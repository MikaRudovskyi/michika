import jwt
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from app.core.db import from_doc, get_db
from app.core.security import decode_token
from app.models.user import Role, User, UserStatus

oauth2 = OAuth2PasswordBearer(tokenUrl="/auth/login")

RANK = {Role.user: 1, Role.manager: 2, Role.admin: 3}


async def get_current_user(token: str = Depends(oauth2), db=Depends(get_db)) -> User:
    unauthorized = HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    try:
        payload = decode_token(token)
        oid = ObjectId(payload["sub"])
    except (jwt.PyJWTError, InvalidId, KeyError):
        raise unauthorized
    doc = await db.users.find_one({"_id": oid})
    if not doc:
        raise unauthorized
    user = from_doc(User, doc)
    if user.status == UserStatus.blocked:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is blocked")
    return user


def require_role(minimum: Role):
    """Role hierarchy: admin >= manager >= user. Guests simply have no token."""

    async def dependency(user: User = Depends(get_current_user)) -> User:
        if RANK[user.role] < RANK[minimum]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
        return user

    return dependency