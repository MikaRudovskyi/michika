from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query

from app.core.db import from_doc, get_db
from app.models.common import Lang
from app.models.site import CulturalSite, SiteType

router = APIRouter(prefix="/sites", tags=["catalog"])

SORTS = {"popularity": ("popularity", -1), "fee": ("fee_jpy", 1), "duration": ("avg_duration_min", 1)}


@router.get("")
async def list_sites(
    lang: Lang = "en",
    site_type: SiteType | None = Query(None, alias="type"),
    region_id: str | None = None,
    city_id: str | None = None,
    max_fee: int | None = Query(None, ge=0),
    max_duration: int | None = Query(None, ge=10),
    max_crowd: float | None = Query(None, ge=0, le=1),
    month: int | None = Query(None, ge=1, le=12, description="Month used for the crowd filter"),
    sort: Literal["popularity", "fee", "duration"] = "popularity",
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db=Depends(get_db),
):
    """Public endpoint: guests can browse the catalog."""
    q: dict = {"availability": "available"}
    if site_type:
        q["type"] = site_type
    if region_id:
        q["region_id"] = region_id
    if city_id:
        q["city_id"] = city_id
    if max_fee is not None:
        q["fee_jpy"] = {"$lte": max_fee}
    if max_duration is not None:
        q["avg_duration_min"] = {"$lte": max_duration}
    if max_crowd is not None:
        idx = (month or date.today().month) - 1
        q[f"crowd.by_month.{idx}"] = {"$lte": max_crowd}

    field, direction = SORTS[sort]
    cursor = db.cultural_sites.find(q).sort(field, direction).skip(skip).limit(limit)

    items = []
    async for doc in cursor:
        s = from_doc(CulturalSite, doc)
        items.append(
            {
                "id": s.id,
                "slug": s.slug,
                "name": s.name.get(lang),
                "description": s.description.get(lang) if s.description else None,
                "type": s.type,
                "tags": s.tags,
                "region_id": s.region_id,
                "city_id": s.city_id,
                "location": s.location,
                "fee_jpy": s.fee_jpy,
                "avg_duration_min": s.avg_duration_min,
                "popularity": s.popularity,
                "open_hour": s.open_hour,
                "close_hour": s.close_hour,
            }
        )
    total = await db.cultural_sites.count_documents(q)
    return {"total": total, "items": items}