from dataclasses import dataclass

import jwt

from app.core.config import Settings


class AuthError(Exception):
    pass


@dataclass(frozen=True)
class TokenClaims:
    subject: str
    email: str | None
    name: str | None


def decode_api_token(token: str, settings: Settings) -> TokenClaims:
    """Verify the short-lived HS256 token the Next.js server mints for API calls."""
    try:
        claims = jwt.decode(
            token,
            settings.auth_jwt_secret.get_secret_value(),
            algorithms=["HS256"],
            audience=settings.auth_jwt_audience,
            issuer=settings.auth_jwt_issuer,
            options={"require": ["exp", "iat", "sub"]},
        )
    except jwt.PyJWTError as exc:
        raise AuthError(str(exc)) from exc
    return TokenClaims(subject=claims["sub"], email=claims.get("email"), name=claims.get("name"))
