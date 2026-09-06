"""Resolves the LSPU Citizen's Charter out of the archives table.

The charter is not a special kind of document — it is an ordinary archive row
uploaded through the dashboard like every folio, with `type` set to the
reserved value "charter". That is deliberate: publishing next year's charter
has to be an upload, not a deploy, and rasterisation/paging/covers then come
from ArchiveServices for free.

Two consequences worth knowing before touching this:

  - `is_tabloid` in ArchiveServices only matches "tabloid", so a charter reads
    with the Book (StPageFlip) adapter — the two-page foldable spread — with
    no adapter work here at all.

  - The kiosk archives carousel treats "folio" as a *fallback* category
    (kiosk-archives.js matchesCategory: anything not tabloid/magazine/
    newsletter), so a charter row would otherwise surface as a folio in the
    public grid. ArchivesController filters it out using IS_CHARTER below;
    the charter is reachable from the virtual tour instead.

Type matching is case- and padding-insensitive, matching how the rest of the
app compares `role`/`status`/`type` (see DashboardContext.grouped_counts).
"""

from app.models.Archives import Archives
from app.services.ArchiveServices import ArchiveServices

CHARTER_TYPE = "charter"

# Where the 3D model hangs in the virtual tour.
#
# The GLB lives in storage/public/models/, which STATICFILES maps to "/", and
# NOT under storage/framework/public/ — that path is a *symlink to the NAS*
# (/mnt/gearsnas), so anything put there is a deploy artifact on a network
# mount rather than a file in the repo. Editor-uploaded media belongs there;
# this model does not. It is code-coupled — the tour's hotspot is meaningless
# without it — so it ships with the code and cannot be forgotten on deploy.
#
# The cost of that choice is that storage/public has no nginx block of its own:
# only /pano/, /storage/ and /assets/ are carved out, and everything else falls
# through to `location /` and streams out of a gunicorn worker. deploy/
# nginx-presspoint.conf therefore has a /models/ block, added for exactly the
# reason the /pano/ block exists. Keep the two in sync.
CHARTER_MODEL_URL = "/models/lspu-citizens-charter-2026.glb"

# Scene 0-jst-1 is the tour's opening panorama. Yaw/pitch are radians in
# Marzipano's frame, the same convention as the linkHotspot coordinates in
# resources/js/data.js.
#
# Derived from that scene rather than picked by eye. 0-jst-1 opens at
# yaw -1.772 / pitch +0.090 and carries exactly one hotspot — the walk-forward
# arrow to 1-jst-2 at yaw -2.261 / pitch +0.425. The book sits ~27 deg to the
# *right* of the opening heading, ~55 deg of yaw away from that arrow, so the
# model can never cover the only way out of the scene. It stays inside the
# opening frame because the view limiter clamps FOV to 100-120 deg (FOV_MIN/
# FOV_MAX in kiosk-tour.js), giving at least 50 deg of half-width — so the
# charter is on screen the moment the tour starts, without the visitor having
# to look for it.
#
# PITCH IS POSITIVE-DOWN in Marzipano's frame, and this one is positive on
# purpose: the book is meant to read as an object resting on the floor tiles of
# JST-1, not as a placard hovering at head height. +0.40 rad is 22.9 deg below
# the horizon, which is where the floor is for a camera at roughly chest height
# ~3.5 m back — and 17.8 deg below the opening pitch, comfortably inside that
# 50 deg half-frame. tour-charter.js completes the illusion from the other end,
# framing the model with a downward camera orbit and a contact shadow; the two
# have to agree, so a change here wants a look at the screenshot, not just at
# the arithmetic.
#
# Re-derive these after a tour re-export: a new capture of JST-1 will not share
# this one's heading, and the book would end up pointing at a wall — or through
# a staircase, which is the failure mode the pitch introduces.
CHARTER_SCENE_ID = "0-jst-1"
CHARTER_YAW = -1.30
CHARTER_PITCH = 0.40


def is_charter_type(raw_type):
    """True when an archive row's `type` marks it as the citizen's charter."""
    return (raw_type or "").strip().lower() == CHARTER_TYPE


def latest_charter_entry():
    """The newest charter as a build_archive_entry() dict, or None.

    Returns None rather than raising when no charter has been uploaded — the
    virtual tour renders without the 3D model in that case, which is exactly
    the tour as it was before this feature existed.

    Ordered by date then id so that re-uploading a charter dated the same day
    wins, the same tie-break the archives carousel uses.
    """
    rows = (
        Archives.where("type", CHARTER_TYPE)
        .order_by("date", "desc")
        .order_by("id", "desc")
        .limit(1)
        .get()
    )

    row = rows[0] if len(rows) else None
    if row is None:
        return None

    return ArchiveServices().build_archive_entry(row)
