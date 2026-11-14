"""Embedding service: `uvicorn app.embed.service:app --port 8001`. Loads the model once."""

from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.embed.model import _load, embed_texts


@asynccontextmanager
async def lifespan(_: FastAPI):  # type: ignore[no-untyped-def]
    await run_in_threadpool(_load)  # warm the model before taking traffic
    yield


app = FastAPI(title="ORO embeddings", lifespan=lifespan, docs_url=None, redoc_url=None)


class EmbedIn(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=64)
    kind: Literal["query", "doc"] = "doc"


class EmbedOut(BaseModel):
    model: str
    vectors: list[list[float]]


@app.post("/embed")
def embed(body: EmbedIn) -> EmbedOut:
    # Sync endpoint: FastAPI runs it in the threadpool so the CPU-bound model never blocks.
    return EmbedOut(model=get_settings().embed_model, vectors=embed_texts(body.texts, body.kind))


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}
