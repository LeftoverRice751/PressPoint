"""The kiosk news index cache, and the one place its key lives.

This moved out of NewsController for a specific reason: a category rename
changes a label the kiosk renders while touching zero `news` rows, so
NewsCategoryController has to invalidate the news cache too. Copying the key
literal into a second module is exactly how two copies drift apart and half
the writers stop invalidating -- so the key, the TTL and forget() live here
and both controllers import them.

NewsController keeps a module-level `_NEWS_CACHE_KEY` alias pointing at KEY:
the existing tests patch and assert against that name.
"""

from masonite.facades import Cache


#: Bump the version suffix on any change to the SHAPE of the cached
#: projection (_news_item_to_dict), not just its contents. Without a bump, a
#: deploy keeps serving the previous shape for up to TTL seconds -- v5 exists
#: because stories carry `category`/`category_id` now, and a cached v4 dict
#: has no such key, so the kiosk would render a blank category label on every
#: story for five minutes after release.
KEY = "kiosk:news:index:v5"

#: Safety net only. Every write path invalidates explicitly via forget().
TTL = 300


def forget():
    """Drop the cached kiosk news index.

    Called by every write that can change what the kiosk shows OR how it is
    labelled -- which now includes all four category writes (create, rename,
    delete, restore), not just story writes. Create is arguably exempt, since
    a brand-new category is on no story yet; it forgets anyway, because an
    "invalidate on three of the four" rule is a trap for the next reader.

    Never raises: a cache miss is a slow request, a raised exception here
    would be a failed publish.
    """
    try:
        Cache.forget(KEY)
    except Exception:
        pass
