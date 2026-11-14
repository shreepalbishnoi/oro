# syntax=docker/dockerfile:1
# Multi-arch (amd64 + arm64) so the same image runs locally and on Oracle Ampere.
# EXTRAS="embed" builds the embedding-service image (adds fastembed + onnxruntime).
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=120 \
    PIP_RETRIES=10
WORKDIR /app

FROM base AS deps
ARG EXTRAS=""
COPY pyproject.toml ./
# Cached wheel downloads survive failed builds on slow links.
RUN --mount=type=cache,target=/root/.cache/pip \
    mkdir app && touch app/__init__.py \
    && if [ -n "$EXTRAS" ]; then pip install ".[${EXTRAS}]"; else pip install .; fi \
    && rm -rf app

FROM base AS runtime
RUN useradd --create-home --uid 10001 oro && mkdir -p /models && chown oro:oro /models
COPY --from=deps /usr/local /usr/local
COPY --chown=oro:oro . .
USER oro
ENV FASTEMBED_CACHE_PATH=/models
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=2).status==200 else 1)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--proxy-headers", "--forwarded-allow-ips", "*"]
