"""The kiosk news index cache, and the one place its key lives.

NewsController keeps a module-level `_NEWS_CACHE_KEY` alias pointing at KEY:
the existing tests patch and assert against that name.
"""

from masonite.facades import Cache


#: Bump the version suffix on any change to the SHAPE of the cached projection
#: (Posts.card_context), not just its contents. Without a bump, a deploy keeps
#: serving the previous shape for up to TTL seconds.
# v9: the payload is now {"posts": [card_context, ...]}, not per-issue blocks.
KEY = "kiosk:news:index:v9"

#: Safety net only. Every write path invalidates explicitly via forget().
TTL = 300


def forget():
    """Drop the cached kiosk news index.

    Never raises: a cache miss is a slow request, a raised exception here
    would be a failed publish.
    """
    try:
        Cache.forget(KEY)
    except Exception:
        pass
