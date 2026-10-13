from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pymongo.errors import DuplicateKeyError

from app.core.db import from_doc, get_db
from app.core.rbac import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import RegisterIn, TokenOut, User, UserPublic, UserStatus

router = APIRouter(prefix="/auth", tags=["auth"])


def _public(user: User) -> UserPublic:
    return UserPublic(**user.model_dump(exclude={"password_hash", "created_at"}))


@router.post("/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterIn, db=Depends(get_db)):
    doc = {
        "email": body.email.lower(),
        "password_hash": hash_password(body.password),
        "name": body.name,
        "role": "user",
        "status": "active",
        "prefs": body.prefs.model_dump(),
        "locale": body.locale,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        res = await db.users.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    return _public(from_doc(User, {**doc, "_id": res.inserted_id}))


@router.post("/login", response_model=TokenOut)
async def login(form: OAuth2PasswordRequestForm = Depends(), db=Depends(get_db)):
    doc = await db.users.find_one({"email": form.username.lower()})
    if not doc or not verify_password(form.password, doc["password_hash"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    user = from_doc(User, doc)
    if user.status == UserStatus.blocked:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is blocked")
    return TokenOut(access_token=create_access_token(user.id, user.role.value))


@router.get("/me", response_model=UserPublic)
async def me(user: User = Depends(get_current_user)):
    return _public(user)