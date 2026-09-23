"""One storage quota per account, over everything it keeps in the bucket.

Saved creations ("My creations", routers/artifacts.py) and The Commons' room
images (routers/thecommons.py) both land under users/{id}/ in GCS, so they
share one limit. Both routers ask here, so they can never disagree about how
much an account has used.
"""

import os

DEFAULT_QUOTA_MB = 200


def quota_bytes() -> int:
    mb = int(os.environ.get("SYNTH_STORAGE_QUOTA_MB", DEFAULT_QUOTA_MB))
    return mb * 1024 * 1024


async def used_bytes(pool, user_id: int) -> int:
    """Bytes the account has stored: saved creations plus every image in every
    room it owns. Thumbnails aren't counted; a few KB is rounding error."""
    return await pool.fetchval(
        "SELECT (SELECT COALESCE(SUM(bytes), 0) FROM artifacts WHERE user_id = $1) + "
        "(SELECT COALESCE(SUM(i.bytes), 0) FROM commons_room_images i "
        "JOIN commons_rooms r ON r.id = i.room_id WHERE r.owner_user_id = $1)",
        user_id)
