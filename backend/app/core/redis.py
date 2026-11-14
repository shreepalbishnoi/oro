from redis.asyncio import Redis

from app.core.config import get_settings

_redis: Redis | None = None
_blocking: Redis | None = None

# Blocking reads (XREAD/XREADGROUP with BLOCK) wait up to this long; the socket timeout must be
# longer, or redis-py raises TimeoutError while the server is still legitimately waiting.
MAX_BLOCK_MS = 15_000


def get_redis() -> Redis:
    """Client for ordinary commands: a short socket timeout so a stuck Redis fails fast."""
    global _redis
    if _redis is None:
        _redis = Redis.from_url(
            get_settings().redis_url,
            decode_responses=True,
            socket_timeout=2.0,
            socket_connect_timeout=2.0,
            health_check_interval=30,
        )
    return _redis


def get_blocking_redis() -> Redis:
    """Client for blocking stream reads (SSE relays, the pipeline consumer)."""
    global _blocking
    if _blocking is None:
        _blocking = Redis.from_url(
            get_settings().redis_url,
            decode_responses=True,
            socket_timeout=MAX_BLOCK_MS / 1000 + 10,
            socket_connect_timeout=2.0,
            health_check_interval=30,
        )
    return _blocking


async def close_redis() -> None:
    global _redis, _blocking
    for client in (_redis, _blocking):
        if client is not None:
            await client.aclose()
    _redis = _blocking = None
