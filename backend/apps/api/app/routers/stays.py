import datetime as dt
import math

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.db import from_doc, get_db, to_oid
from app.core.rbac import RANK, require_role
from app.models.accommodation import Accommodation
from app.models.common import Lang
from app.models.itinerary import CostBreakdown, Itinerary
from app.models.site import CulturalSite
from app.models.user import Role, User
from app.services.cost_engine import compute_costs
from app.services.stay_engine import (
    MAX_STAY_DISTANCE_KM,
    StayRecommendation,
    build_segments,
    default_nightly_budget,
    lodging_by_night,
    recommend,
)

router = APIRouter(prefix="/stays", tags=["stays"])

registered = require_role(Role.user)


class RecommendIn(BaseModel):
    itinerary_id: str
    start_date: dt.date | None = None  # required if the itinerary was generated without one
    max_nightly_room_jpy: int | None = Field(None, gt=0)
    limit: int = Field(3, ge=1, le=10)
    lang: Lang = "en"


class RecommendOut(BaseModel):
    start_date: dt.date
    stays: list[StayRecommendation]
    cost_with_best_stays: CostBreakdown
    warnings: list[str] = Field(default_factory=list)


@router.post("/recommend", response_model=RecommendOut)
async def recommend_stays(
    body: RecommendIn, user: User = Depends(registered), db=Depends(get_db)
):
    doc = await db.itineraries.find_one({"_id": to_oid(body.itinerary_id, "Itinerary")})
    if not doc:
        raise HTTPException(404, "Itinerary not found")
    itinerary = from_doc(Itinerary, doc)
    if itinerary.owner_id != user.id and RANK[user.role] < RANK[Role.manager]:
        raise HTTPException(403, "Not your itinerary")

    start = body.start_date or itinerary.params.start_date
    if start is None:
        raise HTTPException(422, "start_date is required: the itinerary has no start date")

    guests = itinerary.params.travelers
    nights_total = len(itinerary.days) - 1
    if nights_total < 1:
        return RecommendOut(
            start_date=start,
            stays=[],
            cost_with_best_stays=compute_costs(itinerary.days, travelers=guests),
            warnings=["A single-day itinerary needs no accommodation."],
        )

    site_ids = {s.site_id for d in itinerary.days for s in d.stops}
    sites: dict[str, CulturalSite] = {}
    if site_ids:
        cursor = db.cultural_sites.find({"_id": {"$in": [to_oid(i, "Site") for i in site_ids]}})
        async for d in cursor:
            site = from_doc(CulturalSite, d)
            sites[site.id] = site

    segments = build_segments(itinerary.days, sites, start)

    accommodations: list[Accommodation] = []
    booked: dict[tuple[str, str, str], int] = {}
    if segments:
        near_any = [
            {
                "location": {
                    "$geoWithin": {
                        "$centerSphere": [
                            [seg.anchor[1], seg.anchor[0]],
                            MAX_STAY_DISTANCE_KM / 6378.1,
                        ]
                    }
                }
            }
            for seg in segments
        ]
        cursor = db.accommodations.find({"status": "active", "$or": near_any})
        accommodations = [from_doc(Accommodation, d) async for d in cursor]

        if accommodations:
            inv = db.inventory.find(
                {
                    "accommodation_id": {"$in": [a.id for a in accommodations]},
                    "date": {
                        "$gte": segments[0].check_in.isoformat(),
                        "$lt": segments[-1].check_out.isoformat(),
                    },
                }
            )
            async for d in inv:
                booked[(d["accommodation_id"], d["room_type_id"], d["date"])] = d["booked"]

    budget = (
        body.max_nightly_room_jpy
        or itinerary.params.nightly_room_jpy
        or default_nightly_budget(itinerary.params.budget_jpy, nights_total, math.ceil(guests / 2))
    )
    recs = recommend(
        segments,
        accommodations,
        guests=guests,
        booked=booked,
        lang=body.lang,
        nightly_budget_jpy=budget,
        limit=body.limit,
    )

    warnings = [
        f"No available accommodation for nights {r.segment.first_night + 1}-"
        f"{r.segment.first_night + r.segment.nights} "
        f"({r.segment.check_in} to {r.segment.check_out})."
        for r in recs
        if not r.options
    ]
    if not segments:
        warnings.append("The itinerary has no stops, so there is nothing to anchor a stay to.")

    cost = compute_costs(
        itinerary.days,
        travelers=guests,
        nightly_room_jpy=itinerary.params.nightly_room_jpy,
        lodging_by_night=lodging_by_night(recs),
    )
    return RecommendOut(start_date=start, stays=recs, cost_with_best_stays=cost, warnings=warnings)