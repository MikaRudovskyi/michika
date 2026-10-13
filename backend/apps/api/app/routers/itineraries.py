from datetime import date, datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.db import from_doc, get_db, to_doc
from app.core.rbac import RANK, require_role
from app.models.itinerary import Itinerary, ItineraryParams
from app.models.site import CulturalSite
from app.models.user import Role, User
from app.services.itinerary_engine import ItineraryEngine
from app.services.live_context import build_context

router = APIRouter(prefix="/itineraries", tags=["itineraries"])

registered = require_role(Role.user)
staff = require_role(Role.manager)


class RebuildIn(BaseModel):
    """Any subset of the planner parameters; unset fields keep their previous value."""

    interests: list[str] | None = None
    budget_jpy: int | None = None
    days: int | None = None
    travelers: int | None = None
    start_date: date | None = None
    pinned_site_ids: list[str] | None = None
    excluded_site_ids: list[str] | None = None
    max_crowd: float | None = None


class RebuildOut(BaseModel):
    itinerary: Itinerary
    diff: dict


def _oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except InvalidId:
        raise HTTPException(404, "Itinerary not found")


async def _engine_for(db, params: ItineraryParams) -> ItineraryEngine:
    q: dict = {"availability": "available"}
    if params.region_ids:
        q["region_id"] = {"$in": params.region_ids}
    sites = [from_doc(CulturalSite, d) async for d in db.cultural_sites.find(q)]
    # Forecast (when the dates are near) and climate normals shape the scoring; if the
    # weather service is unreachable the context quietly falls back to built-in averages.
    ctx = await build_context(db, sites, params.start_date, params.days)
    return ItineraryEngine(sites, ctx)


@router.post("/generate", response_model=Itinerary)
async def generate(
    params: ItineraryParams,
    save: bool = False,
    user: User = Depends(registered),
    db=Depends(get_db),
):
    itinerary = (await _engine_for(db, params)).generate(params)
    if save:
        itinerary.owner_id = user.id
        res = await db.itineraries.insert_one(to_doc(itinerary))
        itinerary.id = str(res.inserted_id)
    return itinerary


@router.get("", response_model=list[Itinerary])
async def my_itineraries(user: User = Depends(registered), db=Depends(get_db)):
    cursor = db.itineraries.find({"owner_id": user.id}).sort("updated_at", -1).limit(50)
    return [from_doc(Itinerary, d) async for d in cursor]


@router.get("/all", response_model=list[Itinerary])
async def all_itineraries(
    skip: int = 0, limit: int = 50, _: User = Depends(staff), db=Depends(get_db)
):
    """Manager/Admin: view user routes."""
    cursor = db.itineraries.find({}).sort("updated_at", -1).skip(skip).limit(min(limit, 100))
    return [from_doc(Itinerary, d) async for d in cursor]


@router.patch("/{itinerary_id}/rebuild", response_model=RebuildOut)
async def rebuild(
    itinerary_id: str,
    changes: RebuildIn,
    user: User = Depends(registered),
    db=Depends(get_db),
):
    doc = await db.itineraries.find_one({"_id": _oid(itinerary_id)})
    if not doc:
        raise HTTPException(404, "Itinerary not found")
    old = from_doc(Itinerary, doc)
    if old.owner_id != user.id and RANK[user.role] < RANK[Role.manager]:
        raise HTTPException(403, "Not your itinerary")

    merged = {**old.params.model_dump(), **changes.model_dump(exclude_unset=True, exclude_none=True)}
    params = ItineraryParams.model_validate(merged)

    new = (await _engine_for(db, params)).generate(params)
    new.id = old.id
    new.owner_id = old.owner_id
    new.version = old.version + 1
    new.created_at = old.created_at
    new.updated_at = datetime.now(timezone.utc)

    await db.itineraries.update_one({"_id": doc["_id"]}, {"$set": to_doc(new)})
    return RebuildOut(itinerary=new, diff=ItineraryEngine.diff(old, new))