import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.db import from_doc, get_db, to_doc, to_oid
from app.core.rbac import RANK, require_role
from app.models.common import Lang
from app.models.itinerary import Itinerary
from app.models.user import Role, User
from app.services.compare import RouteMetrics, metrics_for, pick_best
from app.services.sites import load_sites

router = APIRouter(prefix="/compare", tags=["compare"])
registered = require_role(Role.user)


class Candidate(RouteMetrics):
    updated_at: dt.datetime


class CompareIn(BaseModel):
    ids: list[str] = Field(min_length=2, max_length=4)


class CompareOut(BaseModel):
    routes: list[RouteMetrics]
    best: dict[str, str]
    shared_site_ids: list[str]
    site_names: dict[str, str]


@router.get("/candidates", response_model=list[Candidate])
async def candidates(user: User = Depends(registered), db=Depends(get_db)):
    """The user's saved routes, ready to be picked for a comparison."""
    cursor = db.itineraries.find({"owner_id": user.id}).sort("updated_at", -1).limit(50)
    return [
        Candidate(**metrics_for(route).model_dump(), updated_at=route.updated_at)
        async for route in (from_doc(Itinerary, d) async for d in cursor)
    ]


@router.post("", response_model=CompareOut)
async def compare(
    body: CompareIn,
    lang: Lang = "en",
    user: User = Depends(registered),
    db=Depends(get_db),
):
    if len(set(body.ids)) != len(body.ids):
        raise HTTPException(422, "Choose different routes")

    routes: list[Itinerary] = []
    for route_id in body.ids:
        doc = await db.itineraries.find_one({"_id": to_oid(route_id, "Itinerary")})
        if not doc:
            raise HTTPException(404, "Itinerary not found")
        route = from_doc(Itinerary, doc)
        if route.owner_id != user.id and RANK[user.role] < RANK[Role.manager]:
            raise HTTPException(403, "Not your itinerary")
        routes.append(route)

    metrics = [metrics_for(r) for r in routes]
    shared = set.intersection(*(set(m.site_ids) for m in metrics))
    sites = await load_sites(db, {i for m in metrics for i in m.site_ids})
    return CompareOut(
        routes=metrics,
        best=pick_best(metrics),
        shared_site_ids=sorted(shared),
        site_names={sid: s.name.get(lang) for sid, s in sites.items()},
    )


@router.post("/snapshot/{itinerary_id}", response_model=Candidate, status_code=201)
async def snapshot(itinerary_id: str, user: User = Depends(registered), db=Depends(get_db)):
    """Freeze a copy of the route: keep editing the original, compare the two later."""
    doc = await db.itineraries.find_one({"_id": to_oid(itinerary_id, "Itinerary")})
    if not doc:
        raise HTTPException(404, "Itinerary not found")
    original = from_doc(Itinerary, doc)
    if original.owner_id != user.id:
        raise HTTPException(403, "Not your itinerary")

    now = dt.datetime.now(dt.timezone.utc)
    copy = original.model_copy(update={"id": None, "version": 1, "created_at": now, "updated_at": now})
    res = await db.itineraries.insert_one(to_doc(copy))
    copy.id = str(res.inserted_id)
    return Candidate(**metrics_for(copy).model_dump(), updated_at=copy.updated_at)