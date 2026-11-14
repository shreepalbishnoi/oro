from fastapi import APIRouter, Response

from app.api.deps import SessionDep
from app.market.mood import mood

router = APIRouter(prefix="/v1/market", tags=["market"])


@router.get("/mood")
async def market_mood(session: SessionDep, response: Response) -> dict:
    # Changes once a day; let Cloudflare and browsers cache it.
    response.headers["Cache-Control"] = "public, max-age=300, stale-while-revalidate=3600"
    return await mood(session)
