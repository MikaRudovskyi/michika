from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, EmailStr, Field

from app.models.common import Lang


class Role(str, Enum):
    user = "user"
    manager = "manager"
    admin = "admin"


class UserStatus(str, Enum):
    active = "active"
    blocked = "blocked"


class UserPrefs(BaseModel):
    interests: list[str] = Field(default_factory=list)
    budget_jpy: int = Field(150_000, gt=0)
    trip_days: int = Field(5, ge=1, le=21)


class User(BaseModel):
    id: str
    email: EmailStr
    password_hash: str
    name: str
    role: Role = Role.user
    status: UserStatus = UserStatus.active
    prefs: UserPrefs = Field(default_factory=UserPrefs)
    locale: Lang = "en"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserPublic(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: Role
    status: UserStatus
    prefs: UserPrefs
    locale: Lang


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=80)
    prefs: UserPrefs = Field(default_factory=UserPrefs)
    locale: Lang = "en"


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"