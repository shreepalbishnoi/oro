"""Test harness.

Unit tests need nothing. Database tests run when TEST_DATABASE_URL points at a Postgres with
pgvector (CI service container, Docker, or the embedded pgserver); otherwise they skip.
Redis is always fakeredis. LLM calls never leave the process (LLM_MODE=off or fakes)."""

import os
import subprocess
import sys
from pathlib import Path

os.environ.setdefault("ENV", "test")
os.environ["LLM_MODE"] = "off"
os.environ["EMBED_ENABLED"] = "false"
os.environ.pop("GROQ_API_KEY", None)
os.environ.pop("GEMINI_API_KEY", None)
os.environ.pop("ANTHROPIC_API_KEY", None)
TEST_DB = os.environ.get("TEST_DATABASE_URL")
if TEST_DB:
    os.environ["DATABASE_URL"] = TEST_DB

import fakeredis  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402

from app.core import redis as redis_mod  # noqa: E402
from app.core.config import get_settings  # noqa: E402

get_settings.cache_clear()
BACKEND = Path(__file__).resolve().parents[1]

requires_db = pytest.mark.skipif(not TEST_DB, reason="set TEST_DATABASE_URL to run DB tests")


@pytest.fixture(autouse=True)
def fake_redis():
    r = fakeredis.FakeAsyncRedis(decode_responses=True)
    redis_mod._redis = r
    redis_mod._blocking = r  # SSE streams and the pipeline read through the blocking client
    from app.llm import router as router_mod

    router_mod._router = None
    yield r
    redis_mod._redis = None
    redis_mod._blocking = None


@pytest.fixture(scope="session")
def migrated_db():
    if not TEST_DB:
        pytest.skip("no TEST_DATABASE_URL")
    env = {**os.environ, "DATABASE_URL": TEST_DB}
    for args in (["downgrade", "base"], ["upgrade", "head"]):
        subprocess.run(  # noqa: S603 - fixed argv, our own alembic
            [sys.executable, "-m", "alembic", *args], cwd=BACKEND, env=env, check=True,
            capture_output=True,
        )  # fmt: skip
    return TEST_DB


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def seeded(migrated_db):
    from app.db.session import get_sessionmaker
    from app.devtools.demo import seed

    async with get_sessionmaker()() as session:
        ids = await seed(session)
    return ids


@pytest_asyncio.fixture(loop_scope="session")
async def session(seeded):
    from app.db.session import get_sessionmaker

    async with get_sessionmaker()() as s:
        yield s
        await s.rollback()
