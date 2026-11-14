"""Redis rate limits: fixed daily quotas and a sliding-minute burst guard."""

from datetime import datetime
from zoneinfo import ZoneInfo

from redis.asyncio import Redis

IST = ZoneInfo("Asia/Kolkata")


def ist_day() -> str:
    return datetime.now(IST).strftime("%Y%m%d")


async def take_daily(redis: Redis, key: str, limit: int) -> tuple[bool, int]:
    """Consume one unit of a per-IST-day quota. Returns (allowed, remaining)."""
    k = f"rl:day:{ist_day()}:{key}"
    pipe = redis.pipeline()
    pipe.incr(k)
    pipe.expire(k, 60 * 60 * 26)
    used, _ = await pipe.execute()
    if used > limit:
        await redis.decr(k)
        return False, 0
    return True, limit - int(used)


async def peek_daily(redis: Redis, key: str) -> int:
    v = await redis.get(f"rl:day:{ist_day()}:{key}")
    return int(v or 0)


async def take_burst(redis: Redis, key: str, per_minute: int) -> bool:
    """Fixed one-minute window; cheap guard against scripted bursts."""
    k = f"rl:min:{key}"
    pipe = redis.pipeline()
    pipe.incr(k)
    pipe.expire(k, 60, nx=True)
    used, _ = await pipe.execute()
    return int(used) <= per_minute
