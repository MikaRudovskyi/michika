import asyncio
import datetime as dt
import uuid

from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel
from pymongo import UpdateOne

from app.core.config import settings
from app.core.db import get_db, to_oid
from app.core.rbac import require_role
from app.models.common import I18n
from app.models.user import Role, User
from app.services.audit import log_action
from app.services.images import ImageRejected, process_image
from app.services.media_store import Kind, assert_can_edit, public_image
from app.services.storage import get_storage

router = APIRouter(prefix="/media", tags=["media"])
manager = require_role(Role.manager)

MAX_FILES_PER_REQUEST = 10


class ImageOut(BaseModel):
    id: str
    width: int
    height: int
    color: str
    alt: I18n | None = None
    position: int
    files: dict[str, str]  # width in pixels -> URL


class CoverOut(BaseModel):
    cover: ImageOut | None = None
    count: int = 0


class UploadError(BaseModel):
    filename: str
    message: str


class UploadOut(BaseModel):
    items: list[ImageOut]
    errors: list[UploadError]


class OrderIn(BaseModel):
    ids: list[str]


class AltIn(BaseModel):
    alt: I18n | None = None


# ------------------------------ public ------------------------------ #
@router.get("/covers", response_model=dict[str, CoverOut])
async def covers(kind: Kind, ids: str = Query(..., max_length=2500), db=Depends(get_db)):
    """First photo and photo count for many sites or properties at once (catalog cards)."""
    wanted = [i for i in ids.split(",") if i][:100]
    out = {i: CoverOut() for i in wanted}
    pipeline = [
        {"$match": {"kind": kind, "entity_id": {"$in": wanted}}},
        {"$sort": {"position": 1}},
        {"$group": {"_id": "$entity_id", "count": {"$sum": 1}, "first": {"$first": "$$ROOT"}}},
    ]
    async for row in db.media.aggregate(pipeline):
        out[row["_id"]] = CoverOut(cover=ImageOut(**public_image(row["first"])), count=row["count"])
    return out


@router.get("/{kind}/{entity_id}", response_model=list[ImageOut])
async def list_images(kind: Kind, entity_id: str, db=Depends(get_db)):
    cursor = db.media.find({"kind": kind, "entity_id": entity_id}).sort("position", 1)
    return [ImageOut(**public_image(d)) async for d in cursor]


# ------------------------------ staff ------------------------------- #
@router.post("/{kind}/{entity_id}", response_model=UploadOut)
async def upload_images(
    kind: Kind,
    entity_id: str,
    files: list[UploadFile] = File(...),
    user: User = Depends(manager),
    db=Depends(get_db),
):
    """Upload up to 10 photos. Each is checked and processed separately, so one bad file
    does not stop the others: failures come back in `errors`."""
    await assert_can_edit(db, user, kind, entity_id)
    if len(files) > MAX_FILES_PER_REQUEST:
        raise HTTPException(422, f"Upload at most {MAX_FILES_PER_REQUEST} photos at a time")

    storage = get_storage()
    scope = {"kind": kind, "entity_id": entity_id}
    room = settings.max_images_per_entity - await db.media.count_documents(scope)
    last = await db.media.find_one(scope, {"position": 1}, sort=[("position", -1)])
    position = last["position"] + 1 if last else 0
    limit = settings.max_upload_mb * 1024 * 1024

    items: list[ImageOut] = []
    errors: list[UploadError] = []
    for upload in files:
        name = (upload.filename or "photo")[:120]
        if room <= 0:
            errors.append(UploadError(filename=name, message=f"The limit of {settings.max_images_per_entity} photos is reached."))
            continue
        data = await upload.read(limit + 1)
        if len(data) > limit:
            errors.append(UploadError(filename=name, message=f"The file is larger than {settings.max_upload_mb} MB."))
            continue
        try:
            processed = await asyncio.to_thread(process_image, data)  # CPU-bound: keep it off the event loop
        except ImageRejected as exc:
            errors.append(UploadError(filename=name, message=str(exc)))
            continue

        base = f"{kind}/{entity_id}/{uuid.uuid4().hex}"
        stored: dict[str, str] = {}
        for width, blob in processed.variants.items():
            path = f"{base}-{width}.webp"
            await storage.save(path, blob)
            stored[str(width)] = path

        doc = {
            **scope,
            "position": position,
            "width": processed.width,
            "height": processed.height,
            "color": processed.color,
            "files": stored,
            "alt": None,
            "bytes": sum(len(b) for b in processed.variants.values()),
            "uploaded_by": user.id,
            "created_at": dt.datetime.now(dt.timezone.utc),
        }
        res = await db.media.insert_one(doc)
        items.append(ImageOut(**public_image({**doc, "_id": res.inserted_id})))
        position += 1
        room -= 1

    if items:
        await log_action(db, user, "media.upload", kind, entity_id, {"count": len(items)})
    return UploadOut(items=items, errors=errors)


@router.put("/{kind}/{entity_id}/order", response_model=list[ImageOut])
async def reorder_images(
    kind: Kind, entity_id: str, body: OrderIn, user: User = Depends(manager), db=Depends(get_db)
):
    """The first photo is the cover. The list must contain every photo exactly once."""
    await assert_can_edit(db, user, kind, entity_id)
    scope = {"kind": kind, "entity_id": entity_id}
    current = {str(d["_id"]) for d in [x async for x in db.media.find(scope, {"_id": 1})]}
    if len(body.ids) != len(set(body.ids)) or set(body.ids) != current:
        raise HTTPException(422, "The list must contain every photo exactly once")

    if body.ids:
        await db.media.bulk_write(
            [UpdateOne({"_id": ObjectId(mid)}, {"$set": {"position": pos}}) for pos, mid in enumerate(body.ids)]
        )
    await log_action(db, user, "media.reorder", kind, entity_id)
    cursor = db.media.find(scope).sort("position", 1)
    return [ImageOut(**public_image(d)) async for d in cursor]


@router.patch("/item/{media_id}", response_model=ImageOut)
async def set_alt(media_id: str, body: AltIn, user: User = Depends(manager), db=Depends(get_db)):
    """Alternative text for screen readers, in up to three languages. `null` removes it."""
    doc = await db.media.find_one({"_id": to_oid(media_id, "Photo")})
    if not doc:
        raise HTTPException(404, "Photo not found")
    await assert_can_edit(db, user, doc["kind"], doc["entity_id"])
    alt = body.alt.model_dump(mode="json") if body.alt else None
    await db.media.update_one({"_id": doc["_id"]}, {"$set": {"alt": alt}})
    return ImageOut(**public_image({**doc, "alt": alt}))


@router.delete("/item/{media_id}", status_code=204)
async def delete_image(media_id: str, user: User = Depends(manager), db=Depends(get_db)):
    doc = await db.media.find_one({"_id": to_oid(media_id, "Photo")})
    if not doc:
        raise HTTPException(404, "Photo not found")
    await assert_can_edit(db, user, doc["kind"], doc["entity_id"])
    storage = get_storage()
    for path in doc["files"].values():
        await storage.delete(path)
    await db.media.delete_one({"_id": doc["_id"]})
    await log_action(db, user, "media.delete", doc["kind"], doc["entity_id"], {"photo": media_id})
    return Response(status_code=204)