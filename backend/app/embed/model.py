"""EmbeddingGemma-300M via fastembed (ONNX Runtime, CPU). Free, self-hosted, multilingual.

EmbeddingGemma expects task prompts: queries and documents are embedded differently."""

import logging
import threading
import time

import numpy as np

from app.core.config import get_settings

logger = logging.getLogger(__name__)

QUERY_PREFIX = "task: search result | query: "
DOC_PREFIX = "title: none | text: "

_model = None
_lock = threading.Lock()


def _load():  # type: ignore[no-untyped-def]
    global _model
    with _lock:
        if _model is None:
            from fastembed import TextEmbedding

            s = get_settings()
            logger.info("loading embedding model %s", s.embed_model)
            # One intra-op thread keeps the model to a single core on the 2-OCPU VM.
            _model = TextEmbedding(s.embed_model, threads=1)
    return _model


# Small batches keep ONNX Runtime's peak memory (attention grows with batch x length^2) well under
# the container limit, and let a waiting search query run between two document batches.
DOC_BATCH = 1  # ~2 s per document on one ARM core: the longest a search waits
MAX_CHARS = 2000
_run = threading.Lock()
_queries_waiting = 0
_qw_lock = threading.Lock()


def _encode(texts: list[str]) -> list[list[float]]:
    out = []
    for vec in _load().embed(texts, batch_size=len(texts)):
        v = np.asarray(vec, dtype=np.float32)
        n = float(np.linalg.norm(v)) or 1.0
        out.append((v / n).tolist())
    return out


def embed_texts(texts: list[str], kind: str) -> list[list[float]]:
    """Blocking. `kind` is "query" or "doc". Returns L2-normalised vectors.

    One model call at a time (concurrent calls each allocate their own buffers); queries get
    priority over document batches so a live check never waits behind the pipeline's backlog.
    """
    global _queries_waiting
    prefix = QUERY_PREFIX if kind == "query" else DOC_PREFIX
    items = [prefix + t[:MAX_CHARS] for t in texts]
    _load()
    if kind == "query":
        with _qw_lock:
            _queries_waiting += 1
        try:
            with _run:
                return _encode(items)
        finally:
            with _qw_lock:
                _queries_waiting -= 1
    out: list[list[float]] = []
    for i in range(0, len(items), DOC_BATCH):
        while _queries_waiting:  # let searches through first
            time.sleep(0.02)
        with _run:
            out += _encode(items[i : i + DOC_BATCH])
    return out
