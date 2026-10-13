import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, ValidationError
from pymongo.errors import DuplicateKeyError

from app.core.db import from_doc, get_db, to_doc, to_oid
from app.core.rbac import require_role
from app.models.site import CulturalSite, CulturalSiteIn, SitePatch
from app.models.user import Role, User
from app.services.audit import log_action
from app.services.places import validate_place

router = APIRouter(prefix="/sites", tags=["sites-admin"])
manager = require_role(Role.manager)
admin = require_role(Role.admin)


class SitesPage(BaseModel):
    total: int
    items: list[CulturalSite]


async def _get(db, site_id: str) -> CulturalSite:
    doc = await db.cultural_sites.find_one({"_id": to_oid(site_id, "Site")})
    if not doc:
        raise HTTPException(404, "Site not found")
    return from_doc(CulturalSite, doc)


@router.get("/managed", response_model=SitesPage)
async def managed_sites(
    q: str | None = Query(None, max_length=80),
    availability: Literal["available", "temporarily_unavailable"] | None = None,
    region_id: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    _: User = Depends(manager),
    db=Depends(get_db),
):
    """Staff view of the whole catalog, including temporarily unavailable sites."""
    flt: dict = {}
    if availability:
        flt["availability"] = availability
    if region_id:
        flt["region_id"] = region_id
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        flt["$or"] = [{"slug": rx}, {"name.en": rx}, {"name.uk": rx}, {"name.ja": rx}]
    cursor = db.cultural_sites.find(flt).sort("slug", 1).skip(skip).limit(limit)
    items = [from_doc(CulturalSite, d) async for d in cursor]
    return SitesPage(total=await db.cultural_sites.count_documents(flt), items=items)


@router.post("", response_model=CulturalSite, status_code=201)
async def create_site(body: CulturalSiteIn, user: User = Depends(admin), db=Depends(get_db)):
    error = await validate_place(db, body.region_id, body.city_id)
    if error:
        raise HTTPException(422, error)
    try:
        res = await db.cultural_sites.insert_one(to_doc(body))
    except DuplicateKeyError:
        raise HTTPException(409, "A site with this slug already exists")
    site = CulturalSite(**body.model_dump(), id=str(res.inserted_id))
    await log_action(db, user, "site.create", "site", site.id, {"slug": site.slug})
    return site


@router.patch("/{site_id}", response_model=CulturalSite)
async def update_site(
    site_id: str, body: SitePatch, user: User = Depends(manager), db=Depends(get_db)
):
    """Manager/Admin: edit details, prices, hours, and mark a site temporarily unavailable."""
    site = await _get(db, site_id)
    changes = body.model_dump(exclude_unset=True, mode="json")
    if not changes:
        raise HTTPException(400, "No changes provided")

    merged = {**site.model_dump(mode="json", exclude={"id"}), **changes}
    try:
        updated = CulturalSiteIn.model_validate(merged)
    except ValidationError as exc:
        raise HTTPException(
            422, exc.errors(include_url=False, include_context=False, include_input=False)
        )

    if "region_id" in changes or "city_id" in changes:
        error = await validate_place(db, updated.region_id, updated.city_id)
        if error:
            raise HTTPException(422, error)

    await db.cultural_sites.update_one({"_id": to_oid(site_id)}, {"$set": to_doc(updated)})

    meta: dict = {"slug": site.slug, "fields": sorted(changes)}
    if "availability" in changes:
        meta["availability"] = updated.availability
        meta["reason"] = updated.unavailable_reason
    await log_action(db, user, "site.update", "site", site.id, meta)
    return CulturalSite(**updated.model_dump(), id=site.id)


@router.delete("/{site_id}", status_code=204)
async def delete_site(
    site_id: str, force: bool = False, user: User = Depends(admin), db=Depends(get_db)
):
    site = await _get(db, site_id)
    used = await db.itineraries.count_documents({"days.stops.site_id": site.id})
    if used and not force:
        raise HTTPException(
            409,
            f"{used} saved itinerary(ies) include this site. "
            "Mark it temporarily unavailable instead, or repeat with force=true.",
        )
    await db.cultural_sites.delete_one({"_id": to_oid(site_id)})
    await log_action(
        db, user, "site.delete", "site", site.id, {"slug": site.slug, "itineraries_affected": used}
    )
    return Response(status_code=204)