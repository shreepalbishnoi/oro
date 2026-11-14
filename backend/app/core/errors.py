"""RFC 9457 problem details for every error the API returns."""

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

PROBLEM = "application/problem+json"


class Problem(Exception):
    def __init__(self, status: int, title: str, detail: str | None = None, **extra: object) -> None:
        self.status, self.title, self.detail, self.extra = status, title, detail, extra


def _body(status: int, title: str, detail: str | None, request: Request, **extra: object) -> dict:
    body: dict[str, object] = {"type": "about:blank", "title": title, "status": status}
    if detail:
        body["detail"] = detail
    body["instance"] = request.url.path
    body.update(extra)
    return body


def install_problem_handlers(app: FastAPI) -> None:
    @app.exception_handler(Problem)
    async def _problem(request: Request, exc: Problem) -> JSONResponse:
        return JSONResponse(
            _body(exc.status, exc.title, exc.detail, request, **exc.extra),
            status_code=exc.status,
            media_type=PROBLEM,
        )

    @app.exception_handler(HTTPException)
    async def _http(request: Request, exc: HTTPException) -> JSONResponse:
        detail = exc.detail if isinstance(exc.detail, str) else None
        return JSONResponse(
            _body(exc.status_code, detail or "Error", None, request),
            status_code=exc.status_code,
            media_type=PROBLEM,
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [
            {"loc": [str(p) for p in e.get("loc", [])], "msg": e.get("msg", "")}
            for e in exc.errors()
        ]
        first = errors[0]["msg"] if errors else None
        return JSONResponse(
            _body(422, "Check the input", first, request, errors=errors),
            status_code=422,
            media_type=PROBLEM,
        )
