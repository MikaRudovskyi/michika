import datetime as dt

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.db import from_doc, get_db, to_oid
from app.core.rbac import require_role
from app.models.booking import Booking, BookingStatus
from app.models.itinerary import Itinerary
from app.models.user import Role, User
from app.services.staff_views import summarize
from app.services.users import users_by_id

router = APIRouter(prefix="/staff", tags=["staff"])
manager = require_role(Role.manager)


# ------------------------------ bookings ------------------------------ #
class StaffBooking(Booking):
    guest_name: str | None = None
    guest_email: str | None = None


class StaffBookingsPage(BaseModel):
    total: int
    items: list[StaffBooking]


@router.get("/bookings", response_model=StaffBookingsPage)
async def staff_bookings(
    status: BookingStatus | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    user: User = Depends(manager),
    db=Depends(get_db),
):
    """Bookings of the manager's own properties (admins see everything), with guest details.
    Actions reuse POST /bookings/{id}/confirm | cancel | complete."""
    flt: dict = {} if user.role == Role.admin else {"owner_id": user.id}
    if status:
        flt["status"] = status.value

    cursor = db.bookings.find(flt).sort("check_in", 1).skip(skip).limit(limit)
    bookings = [from_doc(Booking, d) async for d in cursor]
    guests = await users_by_id(db, {b.user_id for b in bookings})

    items = [
        StaffBooking(
            **b.model_dump(),
            guest_name=guests.get(b.user_id, {}).get("name"),
            guest_email=guests.get(b.user_id, {}).get("email"),
        )
        for b in bookings
    ]
    return StaffBookingsPage(total=await db.bookings.count_documents(flt), items=items)


# ------------------------------- stats -------------------------------- #
class StatusStat(BaseModel):
    count: int = 0
    value_jpy: int = 0


class TopProperty(BaseModel):
    name: str
    bookings: int
    value_jpy: int


class AdminStats(BaseModel):
    users: int
    managers: int
    blocked: int
    sites: int
    sites_unavailable: int
    itineraries: int
    regions: int
    cities: int


class StatsOut(BaseModel):
    bookings: dict[str, StatusStat]
    upcoming_7d: int
    accommodations: int
    accommodations_hidden: int
    top_properties: list[TopProperty]
    admin: AdminStats | None = None


@router.get("/stats", response_model=StatsOut)
async def stats(user: User = Depends(manager), db=Depends(get_db)):
    """Managers see their own properties' numbers, administrators see the whole platform."""
    scope: dict = {} if user.role == Role.admin else {"owner_id": user.id}

    by_status = {s.value: StatusStat() for s in BookingStatus}
    async for row in db.bookings.aggregate(
        [
            {"$match": scope},
            {"$group": {"_id": "$status", "count": {"$sum": 1}, "value": {"$sum": "$total_jpy"}}},
        ]
    ):
        if row["_id"] in by_status:
            by_status[row["_id"]] = StatusStat(count=row["count"], value_jpy=row["value"])

    today = dt.date.today()
    upcoming = await db.bookings.count_documents(
        {
            **scope,
            "status": {"$in": ["pending", "confirmed"]},
            "check_in": {
                "$gte": today.isoformat(),
                "$lte": (today + dt.timedelta(days=7)).isoformat(),
            },
        }
    )

    top: list[TopProperty] = []
    async for row in db.bookings.aggregate(
        [
            {"$match": {**scope, "status": {"$in": ["confirmed", "completed"]}}},
            {
                "$group": {
                    "_id": "$accommodation_name",
                    "bookings": {"$sum": 1},
                    "value": {"$sum": "$total_jpy"},
                }
            },
            {"$sort": {"value": -1}},
            {"$limit": 5},
        ]
    ):
        top.append(TopProperty(name=row["_id"], bookings=row["bookings"], value_jpy=row["value"]))

    admin_stats = None
    if user.role == Role.admin:
        admin_stats = AdminStats(
            users=await db.users.count_documents({}),
            managers=await db.users.count_documents({"role": "manager"}),
            blocked=await db.users.count_documents({"status": "blocked"}),
            sites=await db.cultural_sites.count_documents({}),
            sites_unavailable=await db.cultural_sites.count_documents(
                {"availability": "temporarily_unavailable"}
            ),
            itineraries=await db.itineraries.count_documents({}),
            regions=await db.regions.count_documents({}),
            cities=await db.cities.count_documents({}),
        )

    return StatsOut(
        bookings=by_status,
        upcoming_7d=upcoming,
        accommodations=await db.accommodations.count_documents(scope),
        accommodations_hidden=await db.accommodations.count_documents({**scope, "status": "hidden"}),
        top_properties=top,
        admin=admin_stats,
    )


# --------------------------- user itineraries ------------------------- #
class ItinerarySummary(BaseModel):
    id: str
    owner_id: str | None = None
    owner_name: str | None = None
    owner_email: str | None = None
    days: int
    stops: int
    travelers: int
    budget_jpy: int
    total_jpy: int
    start_date: dt.date | None = None
    version: int
    warnings: int
    updated_at: dt.datetime


class ItinerariesPage(BaseModel):
    total: int
    items: list[ItinerarySummary]


class StaffItinerary(Itinerary):
    owner_name: str | None = None
    owner_email: str | None = None
    site_names: dict[str, str] = Field(default_factory=dict)


@router.get("/itineraries", response_model=ItinerariesPage)
async def staff_itineraries(
    owner_id: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    _: User = Depends(manager),
    db=Depends(get_db),
):
    """Manager/Admin: browse the routes users have saved."""
    flt = {"owner_id": owner_id} if owner_id else {}
    cursor = db.itineraries.find(flt).sort("updated_at", -1).skip(skip).limit(limit)
    routes = [from_doc(Itinerary, d) async for d in cursor]
    owners = await users_by_id(db, {r.owner_id for r in routes if r.owner_id})

    items = [
        ItinerarySummary(
            id=r.id or "",
            owner_id=r.owner_id,
            owner_name=owners.get(r.owner_id or "", {}).get("name"),
            owner_email=owners.get(r.owner_id or "", {}).get("email"),
            travelers=r.params.travelers,
            budget_jpy=r.params.budget_jpy,
            start_date=r.params.start_date,
            version=r.version,
            updated_at=r.updated_at,
            **summarize(r),
        )
        for r in routes
    ]
    return ItinerariesPage(total=await db.itineraries.count_documents(flt), items=items)


@router.get("/itineraries/{itinerary_id}", response_model=StaffItinerary)
async def staff_itinerary(itinerary_id: str, _: User = Depends(manager), db=Depends(get_db)):
    doc = await db.itineraries.find_one({"_id": to_oid(itinerary_id, "Itinerary")})
    if not doc:
        raise HTTPException(404, "Itinerary not found")
    route = from_doc(Itinerary, doc)

    owners = await users_by_id(db, {route.owner_id} if route.owner_id else set())
    owner = owners.get(route.owner_id or "", {})

    site_ids = {s.site_id for d in route.days for s in d.stops if ObjectId.is_valid(s.site_id)}
    names: dict[str, str] = {}
    if site_ids:
        cursor = db.cultural_sites.find({"_id": {"$in": [ObjectId(i) for i in site_ids]}}, {"name": 1})
        async for site in cursor:
            names[str(site["_id"])] = site["name"]["en"]

    return StaffItinerary(
        **route.model_dump(),
        owner_name=owner.get("name"),
        owner_email=owner.get("email"),
        site_names=names,
    )