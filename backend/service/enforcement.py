"""Service-mode request enforcement — one middleware, always registered.

Registered unconditionally from ``server.py`` and self-neutralizing: with
``SYNTH_AUTH`` unset it forwards every request untouched, so local installs
pay one env lookup per request and nothing else. In service mode it:

  1. resolves the session cookie → ``request.state.user`` / ``.tier``
  2. enforces same-origin on unsafe /api methods (CSRF belt for SameSite=Lax)
  3. walls all AI-spend paths off from anonymous callers (401)
  4. gates AI paths behind the terms/age attestation (403 terms_required)
  5. blocks disabled accounts, and re-issues rotated session cookies

Cost/tier gating and the credit ledger hook in here in a later phase; the
Lyria WebSocket is gated in ``routers/music.py`` (HTTP middleware never sees
websocket scope).
"""

import logging
from urllib.parse import urlparse

from fastapi.responses import JSONResponse

from . import auth, credits, service_mode

logger = logging.getLogger(__name__)

# Everything that can spend on the operator's key. /ws/music is handled in
# its endpoint; /api/videorama is already hosted-blocked by its own guard.
AI_PREFIXES = (
    "/api/generate/",
    "/api/chat",
    "/api/analyze/",
    "/api/batch/",
    "/api/music",
    "/api/video/",
)


def _same_origin(request) -> bool:
    """Origin (fallback Referer) must match the request host when present.

    Absent headers pass: browsers always send Origin on cross-site unsafe
    requests (the case CSRF cares about); header-less callers are non-browser
    clients (curl, tests) that can't ride ambient cookies cross-site.
    """
    origin = request.headers.get("origin") or request.headers.get("referer")
    if not origin:
        return True
    netloc = urlparse(origin).netloc
    return bool(netloc) and netloc == request.headers.get("host", "")


async def service_middleware(request, call_next):
    if not service_mode():
        return await call_next(request)

    path = request.url.path
    request.state.user = None
    request.state.tier = None

    guarded = path.startswith("/api/") or path.startswith("/chatroom/")

    if guarded and request.method in ("POST", "PUT", "PATCH", "DELETE") and not _same_origin(request):
        return JSONResponse(status_code=403, content={"error": "cross_origin_rejected"})

    rotated = None
    token = request.cookies.get(auth.COOKIE_NAME)
    if token and guarded:
        try:
            user, rotated = await auth.resolve_session(token)
        except RuntimeError:
            user = None  # DB not up yet (startup race) — treat as anonymous
        if user is not None:
            if user["disabled_at"] is not None and path != "/api/auth/logout":
                return JSONResponse(status_code=403, content={"error": "account_disabled"})
            if user["credits_period"] != credits.current_period():
                try:
                    user = await credits.ensure_monthly_grant(user)
                except Exception:  # DB hiccup — serve with the stale row, retry next request
                    logger.exception("monthly grant failed for user %s", user["id"])
            request.state.user = user
            request.state.tier = auth.effective_tier(user)

    if any(path.startswith(p) for p in AI_PREFIXES):
        if request.state.user is None:
            return JSONResponse(
                status_code=401,
                content={"error": "auth_required",
                         "detail": "Sign in with Google to generate on this instance."},
            )
        if auth.needs_terms(request.state.user):
            return JSONResponse(
                status_code=403,
                content={"error": "terms_required", "terms_version": auth.terms_version()},
            )

    response = await call_next(request)
    if rotated:
        auth.set_session_cookie(response, rotated)
    balance = getattr(request.state, "credits_balance", None)
    if balance is not None:
        response.headers["X-Credits-Balance"] = str(balance)  # auth.js live badge
    return response
