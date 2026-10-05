"""Run The Commons on this machine with no database and no Google sign-in.

For trying a piece on a real wall: the real app, relay, desk, display and
phone panels, on the test suite's in-memory stand-ins (FakeCommonsPool) and one
pretend signed-in owner. Nothing is stored; everything is gone when it stops.
NEVER a way to run the service for other people: anyone who opens /dev/signin
is the owner.

    python scripts/commons_local.py            # http://127.0.0.1:8000/dev/signin

Archive pieces (backend/service/thecommons_archive.py) are on by default here,
framed from the generative art archive's explorer on this machine; start that
first (node app/server.mjs, http://localhost:8130), or name another origin with
SYNTH_COMMONS_ARCHIVE_ORIGIN (empty turns them off).
"""

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

os.environ.setdefault("SYNTH_AUTH", "1")
os.environ.setdefault("GOOGLE_OAUTH_CLIENT_ID", "679278101913-test.apps.googleusercontent.com")
os.environ.setdefault("SYNTH_TERMS_VERSION", "v0.2")
os.environ.setdefault("SYNTH_INSECURE_COOKIES", "1")
os.environ.setdefault("SYNTH_COMMONS_ARCHIVE_ORIGIN", "http://localhost:8130")

import uvicorn                                              # noqa: E402
from fastapi.responses import RedirectResponse              # noqa: E402

import backend.server as server                             # noqa: E402
from backend.service import auth as service_auth            # noqa: E402
from backend.service import db as service_db                # noqa: E402
from tests.test_service_auth import _fake_user              # noqa: E402
from tests.test_thecommons_rooms import FakeCommonsPool     # noqa: E402

OWNER = _fake_user(id=1, name="Local owner", email="owner@localhost")
service_db._pool = FakeCommonsPool()


async def _resolve_session(token):
    return OWNER, None


service_auth.resolve_session = _resolve_session


async def dev_signin():
    response = RedirectResponse("/thecommons/")
    response.set_cookie(service_auth.COOKIE_NAME, "local", path="/", httponly=True, samesite="lax")
    return response


# Ahead of everything else: the app ends in a catch-all for its static pages.
server.app.add_api_route("/dev/signin", dev_signin, include_in_schema=False)
server.app.router.routes.insert(0, server.app.router.routes.pop())


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    print(f"The Commons, local and in memory: http://127.0.0.1:{port}/dev/signin")
    uvicorn.run(server.app, host="127.0.0.1", port=port)
