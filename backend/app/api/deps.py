from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.redis import get_redis
from app.core.security import AuthError, decode_api_token
from app.db.session import get_session
from app.models import User

SessionDep = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]

_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    session: SessionDep,
    settings: SettingsDep,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    try:
        claims = decode_api_token(creds.credentials, settings)
    except AuthError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token") from exc

    # First authenticated call provisions the user; later calls are a single indexed read.
    stmt = (
        insert(User)
        .values(auth_subject=claims.subject, email=claims.email, display_name=claims.name)
        .on_conflict_do_nothing(index_elements=[User.auth_subject])
    )
    await session.execute(stmt)
    await session.commit()
    user = await session.scalar(select(User).where(User.auth_subject == claims.subject))
    if user is None or user.deleted_at is not None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account unavailable")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_optional_user(
    session: SessionDep,
    settings: SettingsDep,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User | None:
    """Anonymous callers are allowed (Parakh); a bad token is still an error, never ignored."""
    if creds is None:
        return None
    return await get_current_user(session, settings, creds)


OptionalUser = Annotated[User | None, Depends(get_optional_user)]


async def require_admin(user: CurrentUser, settings: SettingsDep) -> User:
    allowed = {e.lower() for e in settings.admin_emails}
    if not user.email or user.email.lower() not in allowed:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admins only")
    return user


AdminUser = Annotated[User, Depends(require_admin)]


def get_redis_dep() -> Redis:
    return get_redis()


RedisDep = Annotated[Redis, Depends(get_redis_dep)]
