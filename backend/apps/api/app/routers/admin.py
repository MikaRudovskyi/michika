import datetime as dt
import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field
from pymongo.errors import DuplicateKeyError

from app.core.db import from_doc, get_db, to_oid
from app.core.rbac import require_role
from app.core.security import hash_password
from app.models.user import Role, User, UserPrefs, UserStatus
from app.services.audit import log_action
from app.services.users import users_by_id

router = APIRouter(prefix="/admin", tags=["admin"])
admin = require_role(Role.admin)


class AdminUser(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: Role
    status: UserStatus
    created_at: dt.datetime | None = None


class UsersPage(BaseModel):
    total: int
    items: list[AdminUser]


class ReasonIn(BaseModel):
    reason: str | None = Field(None, max_length=300)


class RoleIn(BaseModel):
    role: Literal["user", "manager"]


class ManagerIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=8, max_length=128)


class LogEntry(BaseModel):
    id: str
    at: dt.datetime
    actor_id: str
    actor_email: str | None = None
    actor_role: str
    action: str
    target_type: str
    target_id: str
    meta: dict = Field(default_factory=dict)


class LogsPage(BaseModel):
    total: int
    items: list[LogEntry]


def _view(u: User) -> AdminUser:
    return AdminUser(
        id=u.id, email=u.email, name=u.name, role=u.role, status=u.status, created_at=u.created_at
    )


async def _target(db, user_id: str, actor: User) -> User:
    """Admins manage users and managers only, never themselves or other admins."""
    doc = await db.users.find_one({"_id": to_oid(user_id, "User")})
    if not doc:
        raise HTTPException(404, "User not found")
    target = from_doc(User, doc)
    if target.id == actor.id:
        raise HTTPException(409, "You cannot change your own account")
    if target.role == Role.admin:
        raise HTTPException(403, "Administrator accounts cannot be modified here")
    return target


async def _update(db, target: User, changes: dict) -> AdminUser:
    await db.users.update_one({"_id": to_oid(target.id)}, {"$set": changes})
    doc = await db.users.find_one({"_id": to_oid(target.id)})
    return _view(from_doc(User, doc))


@router.get("/users", response_model=UsersPage)
async def list_users(
    role: Role | None = None,
    status: UserStatus | None = None,
    q: str | None = Query(None, max_length=80),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    _: User = Depends(admin),
    db=Depends(get_db),
):
    flt: dict = {}
    if role:
        flt["role"] = role.value
    if status:
        flt["status"] = status.value
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        flt["$or"] = [{"email": rx}, {"name": rx}]
    cursor = db.users.find(flt).sort("email", 1).skip(skip).limit(limit)
    items = [_view(from_doc(User, d)) async for d in cursor]
    return UsersPage(total=await db.users.count_documents(flt), items=items)


@router.post("/users/{user_id}/block", response_model=AdminUser)
async def block_user(
    user_id: str,
    body: ReasonIn | None = None,
    actor: User = Depends(admin),
    db=Depends(get_db),
):
    target = await _target(db, user_id, actor)
    if target.status == UserStatus.blocked:
        raise HTTPException(409, "User is already blocked")
    result = await _update(db, target, {"status": UserStatus.blocked.value})
    await log_action(
        db, actor, "user.block", "user", target.id,
        {"email": target.email, "reason": body.reason if body else None},
    )
    return result


@router.post("/users/{user_id}/unblock", response_model=AdminUser)
async def unblock_user(user_id: str, actor: User = Depends(admin), db=Depends(get_db)):
    target = await _target(db, user_id, actor)
    if target.status == UserStatus.active:
        raise HTTPException(409, "User is not blocked")
    result = await _update(db, target, {"status": UserStatus.active.value})
    await log_action(db, actor, "user.unblock", "user", target.id, {"email": target.email})
    return result


@router.post("/users/{user_id}/role", response_model=AdminUser)
async def set_role(user_id: str, body: RoleIn, actor: User = Depends(admin), db=Depends(get_db)):
    target = await _target(db, user_id, actor)
    if target.role.value == body.role:
        raise HTTPException(409, "User already has this role")
    result = await _update(db, target, {"role": body.role})
    await log_action(
        db, actor, "user.role", "user", target.id,
        {"email": target.email, "from": target.role.value, "to": body.role},
    )
    return result


@router.post("/managers", response_model=AdminUser, status_code=201)
async def create_manager(body: ManagerIn, actor: User = Depends(admin), db=Depends(get_db)):
    doc = {
        "email": body.email.lower(),
        "password_hash": hash_password(body.password),
        "name": body.name,
        "role": Role.manager.value,
        "status": UserStatus.active.value,
        "prefs": UserPrefs().model_dump(),
        "locale": "en",
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }
    try:
        res = await db.users.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(409, "Email already registered")
    await log_action(db, actor, "manager.create", "user", str(res.inserted_id), {"email": doc["email"]})
    return _view(from_doc(User, {**doc, "_id": res.inserted_id}))


def _utc(value: dt.datetime) -> dt.datetime:
    # Motor returns naive UTC datetimes; mark them so clients do not read them as local time.
    return value if value.tzinfo else value.replace(tzinfo=dt.timezone.utc)


@router.get("/logs", response_model=LogsPage)
async def list_logs(
    action: str | None = Query(None, max_length=60, description="Prefix, e.g. 'booking.'"),
    actor_id: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    _: User = Depends(admin),
    db=Depends(get_db),
):
    flt: dict = {}
    if action:
        flt["action"] = {"$regex": f"^{re.escape(action)}"}
    if actor_id:
        flt["actor_id"] = actor_id

    docs = [d async for d in db.system_logs.find(flt).sort("at", -1).skip(skip).limit(limit)]
    actors = await users_by_id(db, {d["actor_id"] for d in docs})
    items = [
        LogEntry(
            id=str(d["_id"]),
            at=_utc(d["at"]),
            actor_id=d["actor_id"],
            actor_email=actors.get(d["actor_id"], {}).get("email"),
            actor_role=d["actor_role"],
            action=d["action"],
            target_type=d["target_type"],
            target_id=d["target_id"],
            meta=d.get("meta", {}),
        )
        for d in docs
    ]
    return LogsPage(total=await db.system_logs.count_documents(flt), items=items)