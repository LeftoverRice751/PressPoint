"""Request/response doubles shared by the news and issue-calendar suites.

They lived in test_news_endpoints.py, which was deleted with the block composer;
every other suite that borrowed them imports from here instead.
"""

from unittest.mock import Mock


def _mock_request(inputs=None, params=None, ajax=False):
    inputs = inputs or {}
    params = params or {}
    request = Mock()
    request.input.side_effect = lambda key, default="": inputs.get(key, default)
    request.param.side_effect = lambda key, default="": params.get(key, default)
    if ajax:
        # Mirrors wants_json()'s header lookup: only the exact-cased
        # X-Requested-With: XMLHttpRequest header is honored here, matching
        # what a real fetch() client sends.
        request.header.side_effect = lambda name: (
            "XMLHttpRequest" if name == "X-Requested-With" else None
        )
    else:
        request.header.return_value = None
    request.all.return_value = inputs.get("__all__", {})
    return request


def _mock_response():
    response = Mock()
    redirect_response = Mock()
    redirect_response.with_success.return_value = "redirected"
    redirect_response.with_errors.return_value = "redirected-with-errors"
    response.redirect.return_value = redirect_response
    response.back.return_value = redirect_response
    return response


def _where_side_effect(records):
    """Fake for News.where covering the two query shapes layout() issues.

    `where("id", n).first()` looks a record up. `where("layout_type", slot).count()`
    is the slot-capacity guard, and it counts the records this fake holds so a
    test that sets up two mains actually trips the cap rather than comparing a
    bare Mock against an int.
    """
    def _side_effect(field, value):
        query = Mock()

        if field == "layout_type":
            query.count.return_value = sum(
                1
                for record in records.values()
                if getattr(record, "layout_type", None) == value
            )
            return query

        # ids may arrive as int or str depending on caller
        candidates = [value]
        if str(value).isdigit():
            candidates.append(int(value))
        candidates.append(str(value))
        record = None
        for candidate in candidates:
            if candidate in records:
                record = records[candidate]
                break
        query.first.return_value = record
        return query

    return _side_effect


def _mock_actor_request(inputs, role=None, user_id=7):
    """A store() request signed in as `role`.

    Scheduling only applies to a publish-intent status, and only an admin can
    write one — an editor's "published" is downgraded to "review" before
    _apply_scheduling ever sees it. So these tests have to say who is asking;
    a bare Mock() request is nobody, and nobody cannot publish.
    """
    request = Mock()
    request.input.side_effect = lambda key: inputs.get(key)
    request.header.return_value = None
    request.user.return_value = Mock(id=user_id, role=role) if role else None
    return request
