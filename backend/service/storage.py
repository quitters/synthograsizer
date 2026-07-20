"""Google Cloud Storage — per-user saved artifacts ("My creations" gallery).

Self-neutralizing like ``db.py``: with ``SYNTH_GCS_BUCKET`` unset, ``enabled()``
is False and every I/O function raises ``RuntimeError`` — callers (the
artifacts router) turn that into a 503. Local installs and any deployment
that hasn't opted into the gallery never import ``google.cloud.storage`` at
all, since every such import is deferred inside the functions that need it.

Object layout: ``users/{user_id}/{artifact_id}.{ext}`` — never anything
user-controlled in the path, so an account delete is one prefix delete
(``delete_prefix``, called from routers/account.py before the user row goes).

V4 signed URLs on Cloud Run have no private key to sign with locally.
``Blob.generate_signed_url`` falls back to the IAM ``signBlob`` API when given
a service-account email and a bearer token instead of a key file — that's
what ``google.auth.default()`` plus a refreshed token provides, and what
``roles/iam.serviceAccountTokenCreator`` granted to the runtime SA on itself
(one-time, see HANDOFF_CLOUD_STORAGE.md) authorizes. The credentials object
is cached and refreshed only when its token has actually expired, not per call.
"""

import logging
import os
from datetime import timedelta
from typing import Optional

logger = logging.getLogger(__name__)

_client = None
_credentials = None  # cached google.auth Credentials; refreshed lazily

# Extension chosen by MIME type first; falls back to a per-kind default so an
# unrecognized-but-plausible MIME (a codec variant, a future format) still
# gets a sane filename instead of failing the save outright.
_KIND_EXT = {"image": "png", "video": "mp4", "music": "wav"}
_MIME_EXT = {
    "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
    "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
    "audio/wav": "wav", "audio/x-wav": "wav", "audio/mpeg": "mp3", "audio/mp3": "mp3",
    "audio/ogg": "ogg",
}


def enabled() -> bool:
    return bool(os.environ.get("SYNTH_GCS_BUCKET"))


def _bucket_name() -> str:
    name = os.environ.get("SYNTH_GCS_BUCKET")
    if not name:
        raise RuntimeError("SYNTH_GCS_BUCKET is not configured — storage is disabled")
    return name


def _client_and_bucket():
    global _client
    if _client is None:
        from google.cloud import storage as gcs  # lazy: only when enabled
        _client = gcs.Client()
    return _client, _client.bucket(_bucket_name())


def _signing_credentials():
    """Cached, auto-refreshing credentials for keyless V4 signing."""
    global _credentials
    import google.auth
    import google.auth.transport.requests

    if _credentials is None:
        _credentials, _project = google.auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
    if not _credentials.valid:
        _credentials.refresh(google.auth.transport.requests.Request())
    return _credentials


def extension_for(kind: str, mime: Optional[str]) -> str:
    if mime and mime.lower() in _MIME_EXT:
        return _MIME_EXT[mime.lower()]
    return _KIND_EXT.get(kind, "bin")


def object_path(user_id: int, artifact_key: str, kind: str, mime: Optional[str]) -> str:
    """``artifact_key`` is an opaque unique token (a UUID, not the DB row id —
    callers need the full path before the row exists, since storage_path is
    NOT NULL, so it can't be derived from an autoincrement id)."""
    return f"users/{user_id}/{artifact_key}.{extension_for(kind, mime)}"


def put(storage_path: str, data: bytes, mime: str) -> None:
    """Upload bytes to an already-computed path (see object_path)."""
    _client_obj, bucket = _client_and_bucket()
    bucket.blob(storage_path).upload_from_string(data, content_type=mime)


def signed_url(storage_path: str, ttl_seconds: Optional[int] = None) -> str:
    _client_obj, bucket = _client_and_bucket()
    ttl = ttl_seconds or int(os.environ.get("SYNTH_SIGNED_URL_TTL_S", "600"))
    creds = _signing_credentials()
    return bucket.blob(storage_path).generate_signed_url(
        version="v4",
        expiration=timedelta(seconds=ttl),
        method="GET",
        service_account_email=creds.service_account_email,
        access_token=creds.token,
    )


def delete(storage_path: str) -> None:
    """Idempotent: deleting an already-gone object is not an error (a retry
    after a partial failure, or the janitor racing a user's own delete, must
    not raise)."""
    from google.api_core import exceptions as gcs_exceptions

    _client_obj, bucket = _client_and_bucket()
    try:
        bucket.blob(storage_path).delete()
    except gcs_exceptions.NotFound:
        pass


def delete_prefix(prefix: str) -> int:
    """Delete every object under ``prefix``. Returns the count removed."""
    from google.api_core import exceptions as gcs_exceptions

    client_obj, bucket = _client_and_bucket()
    removed = 0
    for blob in client_obj.list_blobs(bucket, prefix=prefix):
        try:
            blob.delete()
        except gcs_exceptions.NotFound:
            continue
        removed += 1
    return removed


def list_user_ids_with_objects() -> list[int]:
    """Every numeric user_id with at least one object under ``users/``.

    Used by the retention janitor to find storage orphaned by a DSAR delete
    whose purge step failed (routers/account.py logs and continues rather
    than blocking account deletion on a GCS hiccup — this is the cleanup for
    that case). Directory-style listing: ``delimiter="/"`` makes the SDK
    populate ``.prefixes`` with immediate "subdirectories" like
    ``users/42/``, but only once the iterator has been fully consumed.
    """
    client_obj, bucket = _client_and_bucket()
    iterator = client_obj.list_blobs(bucket, prefix="users/", delimiter="/")
    for _ in iterator:
        pass  # force full pagination so .prefixes is populated
    ids = []
    for prefix in iterator.prefixes:
        part = prefix[len("users/"):].rstrip("/")
        if part.isdigit():
            ids.append(int(part))
    return ids
