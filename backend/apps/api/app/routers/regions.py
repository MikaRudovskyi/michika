from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.core.db import from_doc, get_db, to_doc
from app.core.rbac import require_role
from app.models.common import I18n
from app.models.place import City, CityIn, Region, RegionIn
from app.models.user import Role, User
from app.services.audit import log_action

router = APIRouter(tags=["regions"])
admin = require_role(Role.admin)


class NamePatch(BaseModel):
    name: I18n


# ------------------------------ public ------------------------------- #
@router.get("/regions", response_model=list[Region])
async def list_regions(db=Depends(get_db)):
    return [from_doc(Region, d) async for d in db.regions.find({}).sort("key", 1)]


@router.get("/cities", response_model=list[City])
async def list_cities(region: str | None = None, db=Depends(get_db)):
    q = {"region_key": region} if region else {}
    return [from_doc(City, d) async for d in db.cities.find(q).sort("key", 1)]


# ------------------------------- admin -------------------------------- #
@router.post("/regions", response_model=Region, status_code=201)
async def create_region(body: RegionIn, user: User = Depends(admin), db=Depends(get_db)):
    try:
        res = await db.regions.insert_one(to_doc(body))
    except DuplicateKeyError:
        raise HTTPException(409, "A region with this key already exists")
    await log_action(db, user, "region.create", "region", body.key)
    return Region(**body.model_dump(), id=str(res.inserted_id))


@router.patch("/regions/{key}", response_model=Region)
async def rename_region(key: str, body: NamePatch, user: User = Depends(admin), db=Depends(get_db)):
    doc = await db.regions.find_one_and_update(
        {"key": key},
        {"$set": {"name": body.name.model_dump(mode="json")}},
        return_document=ReturnDocument.AFTER,
    )
    if not doc:
        raise HTTPException(404, "Region not found")
    await log_action(db, user, "region.update", "region", key)
    return from_doc(Region, doc)


@router.delete("/regions/{key}", status_code=204)
async def delete_region(key: str, user: User = Depends(admin), db=Depends(get_db)):
    if not await db.regions.find_one({"key": key}, {"_id": 1}):
        raise HTTPException(404, "Region not found")
    cities = await db.cities.count_documents({"region_key": key})
    sites = await db.cultural_sites.count_documents({"region_id": key})
    stays = await db.accommodations.count_documents({"region_id": key})
    if cities or sites or stays:
        raise HTTPException(
            409, f"Region is in use: {cities} cities, {sites} sites, {stays} accommodations"
        )
    await db.regions.delete_one({"key": key})
    await log_action(db, user, "region.delete", "region", key)
    return Response(status_code=204)


@router.post("/cities", response_model=City, status_code=201)
async def create_city(body: CityIn, user: User = Depends(admin), db=Depends(get_db)):
    if not await db.regions.find_one({"key": body.region_key}, {"_id": 1}):
        raise HTTPException(422, f"Unknown region '{body.region_key}'")
    try:
        res = await db.cities.insert_one(to_doc(body))
    except DuplicateKeyError:
        raise HTTPException(409, "A city with this key already exists")
    await log_action(db, user, "city.create", "city", body.key, {"region": body.region_key})
    return City(**body.model_dump(), id=str(res.inserted_id))


@router.patch("/cities/{key}", response_model=City)
async def rename_city(key: str, body: NamePatch, user: User = Depends(admin), db=Depends(get_db)):
    doc = await db.cities.find_one_and_update(
        {"key": key},
        {"$set": {"name": body.name.model_dump(mode="json")}},
        return_document=ReturnDocument.AFTER,
    )
    if not doc:
        raise HTTPException(404, "City not found")
    await log_action(db, user, "city.update", "city", key)
    return from_doc(City, doc)


@router.delete("/cities/{key}", status_code=204)
async def delete_city(key: str, user: User = Depends(admin), db=Depends(get_db)):
    if not await db.cities.find_one({"key": key}, {"_id": 1}):
        raise HTTPException(404, "City not found")
    sites = await db.cultural_sites.count_documents({"city_id": key})
    stays = await db.accommodations.count_documents({"city_id": key})
    if sites or stays:
        raise HTTPException(409, f"City is in use: {sites} sites, {stays} accommodations")
    await db.cities.delete_one({"key": key})
    await log_action(db, user, "city.delete", "city", key)
    return Response(status_code=204)