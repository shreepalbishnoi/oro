import time

import jwt
import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.security import AuthError, decode_api_token
from app.main import create_app


def _token(**overrides: object) -> str:
    s = get_settings()
    now = int(time.time())
    claims = {
        "sub": "google:123",
        "email": "a@example.com",
        "aud": s.auth_jwt_audience,
        "iss": s.auth_jwt_issuer,
        "iat": now,
        "exp": now + 300,
    }
    claims.update(overrides)
    return jwt.encode(claims, s.auth_jwt_secret.get_secret_value(), algorithm="HS256")


def test_liveness_sets_tracing_headers() -> None:
    client = TestClient(create_app())
    resp = client.get("/healthz", headers={"X-Request-ID": "abc"})
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
    assert resp.headers["X-Request-ID"] == "abc"
    assert resp.headers["Server-Timing"].startswith("app;dur=")


def test_me_requires_token() -> None:
    client = TestClient(create_app())
    assert client.get("/v1/me").status_code == 401


def test_decode_valid_token() -> None:
    claims = decode_api_token(_token(), get_settings())
    assert claims.subject == "google:123"
    assert claims.email == "a@example.com"


@pytest.mark.parametrize(
    "overrides",
    [
        {"exp": int(time.time()) - 10},
        {"aud": "someone-else"},
        {"iss": "attacker"},
    ],
)
def test_decode_rejects_bad_tokens(overrides: dict[str, object]) -> None:
    with pytest.raises(AuthError):
        decode_api_token(_token(**overrides), get_settings())


def test_decode_rejects_wrong_secret() -> None:
    s = get_settings()
    forged = jwt.encode(
        {"sub": "x", "aud": s.auth_jwt_audience, "iss": s.auth_jwt_issuer, "iat": 0, "exp": 2**31},
        "not-the-secret-not-the-secret-not-the",
        algorithm="HS256",
    )
    with pytest.raises(AuthError):
        decode_api_token(forged, s)


def test_xxxxx_placeholders_mean_not_configured():
    from app.core.config import Settings

    s = Settings(groq_api_key="xxxxx", gemini_api_key="XXXXX", hash_pepper="xxxxx", _env_file=None)
    assert s.groq_api_key is None and s.gemini_api_key is None
    assert s.hash_pepper.get_secret_value() == "dev-only-pepper-change-me"
