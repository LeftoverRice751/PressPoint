# About LSPU Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the kiosk About LSPU page (hub-and-spoke with 6 sections) plus the editor dashboard module that maintains its content.

**Architecture:** Two MySQL tables (`about_sections`, `about_milestones`) accessed through Masonite ORM models. A new `AboutController` serves both the kiosk view (single-page client-side detail switcher) and the editor accordion. Rich text is sanitized server-side with `bleach` before persistence. No CSS gradients anywhere — solid colors only.

**Tech Stack:** Masonite 4.20, Masonite ORM 2.24, Jinja2, MySQL, Quill (WYSIWYG, MIT, no API key), bleach (HTML sanitizer), Laravel Mix / webpack, vanilla JS for kiosk view.

**Spec:** `docs/superpowers/specs/2026-05-09-about-lspu-design.md`

---

## File Structure

**New files:**
- `databases/migrations/2026_05_09_120000_create_about_sections_table.py`
- `databases/migrations/2026_05_09_120001_create_about_milestones_table.py`
- `databases/migrations/2026_05_09_120002_seed_about_sections.py`
- `app/models/AboutSection.py`
- `app/models/AboutMilestone.py`
- `app/services/AboutContent.py` — sanitisation + load helpers (keeps controller thin)
- `app/controllers/AboutController.py`
- `templates/kiosk/about-lspu.html`
- `templates/gears/about-lspu.html`
- `resources/css/about-lspu-kiosk.css`
- `resources/css/about-lspu-editor.css`
- `resources/js/about-lspu-kiosk.js`
- `resources/js/about-lspu-editor.js`
- `tests/unit/test_about_lspu.py`

**Modified files:**
- `routes/public.py` — repoint `/kiosk/about-lspu` to `AboutController@kiosk`
- `routes/dashboard.py` — add editor route + save endpoints
- `app/controllers/WelcomeController.py` — remove `about_lspu` stub method
- `templates/gears/dashboard.html` — add "About LSPU" card linking to editor
- `webpack.mix.js` — register the 4 new asset bundles
- `requirements.txt` — add `bleach==6.1.0` (or current stable)

---

## Conventions used in this plan

- **Run tests:** `python -m pytest tests/unit/test_about_lspu.py -v` (project uses unittest-style `TestCase` from `tests/TestCase.py` but pytest is the runner).
- **Run migrations:** `python craft migrate`
- **Roll back one migration:** `python craft migrate:rollback`
- **Build assets (dev):** `npm run dev`
- **Slug list:** `mission`, `values`, `history`, `quality`, `hymn`, `seal` — used as `about_sections.slug` UNIQUE values and as URL params on save endpoints.

---

## Task 1: Add bleach to requirements

**Files:**
- Modify: `requirements.txt`

- [ ] **Step 1: Add bleach to requirements.txt**

Append the following line to `requirements.txt` (alphabetical order is not enforced in this project — append at the end):

```
bleach==6.1.0
```

- [ ] **Step 2: Install**

Run: `pip install bleach==6.1.0`
Expected: "Successfully installed bleach-6.1.0 ..."

- [ ] **Step 3: Verify import**

Run: `python -c "import bleach; print(bleach.__version__)"`
Expected: `6.1.0`

- [ ] **Step 4: Commit**

```bash
git add requirements.txt
git commit -m "Add bleach for About LSPU HTML sanitisation"
```

---

## Task 2: Migration — create about_sections table

**Files:**
- Create: `databases/migrations/2026_05_09_120000_create_about_sections_table.py`

- [ ] **Step 1: Write the migration**

```python
"""CreateAboutSectionsTable Migration."""

from masoniteorm.migrations import Migration


class CreateAboutSectionsTable(Migration):
    def up(self):
        with self.schema.create("about_sections") as table:
            table.increments("id")

            # Stable identifier used in URLs and templates. One of:
            # 'mission', 'values', 'history', 'quality', 'hymn', 'seal'.
            table.string("slug", 40).unique()

            # Display title shown above the section content.
            table.string("title", 150)

            # Sanitized rich-text body. Used directly by 'quality', 'hymn',
            # and 'seal' (description). Null for sections that store all
            # their copy under `subsections` instead.
            table.long_text("body_html").nullable()

            # JSON array of {heading, body_html} objects for fixed-shape
            # multi-part sections ('mission' = Mission/Vision/Mandate,
            # 'values' = Group Values/Performance Pledge). Null for the
            # other slugs.
            table.json("subsections").nullable()

            # Relative path under storage/ for the seal image. Null for
            # all other slugs.
            table.string("image_path", 255).nullable()

            # Audit columns. updated_by_id is nullable so we can seed rows
            # without a user, and so historical rows survive user deletes.
            table.integer("updated_by_id").unsigned().nullable()

            table.timestamps()

            table.foreign("updated_by_id").references("id").on("users").on_delete("set null")

    def down(self):
        self.schema.drop("about_sections")
```

- [ ] **Step 2: Run migration**

Run: `python craft migrate`
Expected: `Migrating: 2026_05_09_120000_create_about_sections_table` followed by `Migrated`.

- [ ] **Step 3: Verify table**

Run: `python craft tinker` then in the shell:
```python
from masoniteorm.schema import Schema
Schema().has_table('about_sections')
```
Expected: `True`. Exit with `exit()`.

(Or run `mysql -u<user> -p presspoint -e "DESCRIBE about_sections"` if tinker is not configured.)

- [ ] **Step 4: Commit**

```bash
git add databases/migrations/2026_05_09_120000_create_about_sections_table.py
git commit -m "Add about_sections migration"
```

---

## Task 3: Migration — create about_milestones table

**Files:**
- Create: `databases/migrations/2026_05_09_120001_create_about_milestones_table.py`

- [ ] **Step 1: Write the migration**

```python
"""CreateAboutMilestonesTable Migration."""

from masoniteorm.migrations import Migration


class CreateAboutMilestonesTable(Migration):
    def up(self):
        with self.schema.create("about_milestones") as table:
            table.increments("id")

            # Year as a string so editors can write ranges like
            # "1952-1957" or qualifiers like "ca. 1900".
            table.string("year", 20)

            table.string("heading", 200)

            # Sanitized rich-text body for the milestone description.
            table.long_text("body_html")

            # Optional milestone image stored under storage/about/milestones/.
            table.string("image_path", 255).nullable()

            # Manual ordering on the timeline. Lower = earlier in the
            # rendered list. Editor reorder buttons mutate this column.
            table.integer("sort_order").default(0)

            table.timestamps()

    def down(self):
        self.schema.drop("about_milestones")
```

- [ ] **Step 2: Run migration**

Run: `python craft migrate`
Expected: `Migrating: 2026_05_09_120001_create_about_milestones_table` followed by `Migrated`.

- [ ] **Step 3: Commit**

```bash
git add databases/migrations/2026_05_09_120001_create_about_milestones_table.py
git commit -m "Add about_milestones migration"
```

---

## Task 4: Migration — seed default about_sections rows

**Files:**
- Create: `databases/migrations/2026_05_09_120002_seed_about_sections.py`

- [ ] **Step 1: Write the seed migration**

```python
"""SeedAboutSections Migration.

Inserts the six fixed About LSPU sections with placeholder content so
the kiosk page never sees missing data on a fresh deploy. Editors edit
in place via the dashboard.
"""

import json
from masoniteorm.migrations import Migration


SEED_ROWS = [
    {
        "slug": "mission",
        "title": "Mission, Vision & Mandate",
        "body_html": None,
        "subsections": [
            {"heading": "Mission",  "body_html": "<p>Mission statement goes here.</p>"},
            {"heading": "Vision",   "body_html": "<p>Vision statement goes here.</p>"},
            {"heading": "Mandate",  "body_html": "<p>Mandate statement goes here.</p>"},
        ],
        "image_path": None,
    },
    {
        "slug": "values",
        "title": "Group Values & Performance Pledge",
        "body_html": None,
        "subsections": [
            {"heading": "Group Values",        "body_html": "<p>Group values go here.</p>"},
            {"heading": "Performance Pledge",  "body_html": "<p>Performance pledge goes here.</p>"},
        ],
        "image_path": None,
    },
    {
        "slug": "history",
        "title": "Historical Development",
        "body_html": "<p>Optional intro paragraph for the history timeline.</p>",
        "subsections": None,
        "image_path": None,
    },
    {
        "slug": "quality",
        "title": "Quality Policy",
        "body_html": "<p>Quality policy statement goes here.</p>",
        "subsections": None,
        "image_path": None,
    },
    {
        "slug": "hymn",
        "title": "University Hymn",
        "body_html": "<p>University hymn lyrics go here.</p>",
        "subsections": None,
        "image_path": None,
    },
    {
        "slug": "seal",
        "title": "University Seal",
        "body_html": "<p>Seal description goes here.</p>",
        "subsections": None,
        "image_path": None,
    },
]


class SeedAboutSections(Migration):
    def up(self):
        connection = self.schema._connection if hasattr(self.schema, "_connection") else None
        # Use raw query through the schema's connection-resolved builder.
        from masoniteorm.query import QueryBuilder
        builder = QueryBuilder(connection_details=self.schema.connection_details).table("about_sections")
        for row in SEED_ROWS:
            payload = dict(row)
            payload["subsections"] = json.dumps(row["subsections"]) if row["subsections"] is not None else None
            builder.insert(payload)

    def down(self):
        from masoniteorm.query import QueryBuilder
        builder = QueryBuilder(connection_details=self.schema.connection_details).table("about_sections")
        for row in SEED_ROWS:
            builder.where("slug", row["slug"]).delete()
```

- [ ] **Step 2: Run migration**

Run: `python craft migrate`
Expected: `Migrating: 2026_05_09_120002_seed_about_sections` followed by `Migrated`.

- [ ] **Step 3: Verify rows present**

Run: `python craft tinker` and:
```python
from app.models.AboutSection import AboutSection  # will work after Task 5; for now use raw:
from masoniteorm.query import QueryBuilder
# Query directly:
QueryBuilder().table("about_sections").count()
```
Expected: `6`. Exit.

(Or `mysql -u<user> -p presspoint -e "SELECT slug FROM about_sections"` and confirm the six slugs.)

- [ ] **Step 4: Commit**

```bash
git add databases/migrations/2026_05_09_120002_seed_about_sections.py
git commit -m "Seed About LSPU sections with placeholder content"
```

---

## Task 5: AboutSection and AboutMilestone models

**Files:**
- Create: `app/models/AboutSection.py`
- Create: `app/models/AboutMilestone.py`

- [ ] **Step 1: Write `AboutSection` model**

```python
""" AboutSection Model """

from masoniteorm.models import Model


class AboutSection(Model):
    """One row per fixed About LSPU section. The six rows are seeded;
    editors only ever update — never insert or delete."""

    __table__ = "about_sections"
    __fillable__ = ["slug", "title", "body_html", "subsections", "image_path", "updated_by_id"]
    __casts__ = {"subsections": "json"}
```

- [ ] **Step 2: Write `AboutMilestone` model**

```python
""" AboutMilestone Model """

from masoniteorm.models import Model


class AboutMilestone(Model):
    """Child rows of the History section, rendered as a timeline."""

    __table__ = "about_milestones"
    __fillable__ = ["year", "heading", "body_html", "image_path", "sort_order"]
```

- [ ] **Step 3: Smoke-test the models**

Run: `python craft tinker` and:
```python
from app.models.AboutSection import AboutSection
[s.slug for s in AboutSection.all()]
```
Expected: `['mission', 'values', 'history', 'quality', 'hymn', 'seal']` (order may vary).

- [ ] **Step 4: Commit**

```bash
git add app/models/AboutSection.py app/models/AboutMilestone.py
git commit -m "Add AboutSection and AboutMilestone models"
```

---

## Task 6: AboutContent service — sanitisation + loader

**Files:**
- Create: `app/services/AboutContent.py`
- Test: `tests/unit/test_about_lspu.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/test_about_lspu.py`:

```python
from tests import TestCase
from app.services.AboutContent import AboutContent


class AboutContentSanitiseTestCase(TestCase):
    def test_strips_script_tags(self):
        dirty = "<p>Hello</p><script>alert(1)</script>"
        clean = AboutContent.sanitize_html(dirty)
        self.assertNotIn("<script", clean)
        self.assertIn("<p>Hello</p>", clean)

    def test_strips_inline_event_handlers(self):
        dirty = '<p onclick="alert(1)">Hi</p>'
        clean = AboutContent.sanitize_html(dirty)
        self.assertNotIn("onclick", clean)
        self.assertIn("Hi", clean)

    def test_keeps_allowed_tags(self):
        dirty = "<p><strong>Bold</strong> and <em>italic</em></p><ul><li>Item</li></ul>"
        clean = AboutContent.sanitize_html(dirty)
        self.assertIn("<strong>Bold</strong>", clean)
        self.assertIn("<em>italic</em>", clean)
        self.assertIn("<li>Item</li>", clean)

    def test_strips_disallowed_iframe(self):
        dirty = '<p>Hi</p><iframe src="https://evil"></iframe>'
        clean = AboutContent.sanitize_html(dirty)
        self.assertNotIn("<iframe", clean)

    def test_keeps_link_with_href(self):
        dirty = '<a href="https://lspu.edu.ph">LSPU</a>'
        clean = AboutContent.sanitize_html(dirty)
        self.assertIn('href="https://lspu.edu.ph"', clean)

    def test_returns_empty_string_for_none(self):
        self.assertEqual(AboutContent.sanitize_html(None), "")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/unit/test_about_lspu.py -v`
Expected: All 6 tests FAIL with `ModuleNotFoundError: No module named 'app.services.AboutContent'`.

- [ ] **Step 3: Write the service**

Create `app/services/AboutContent.py`:

```python
"""About LSPU content helpers.

This module owns:
- sanitisation of editor-supplied HTML before persistence
- loading the six sections + milestones in a single shape ready for the
  kiosk and editor templates

Keeping it out of the controller makes it easy to unit-test sanitisation
without spinning up the request/response cycle.
"""

import bleach

from app.models.AboutMilestone import AboutMilestone
from app.models.AboutSection import AboutSection


# Allowed HTML the WYSIWYG can produce. Tightly scoped because this is a
# production deployment and editors should not be able to inject script
# or arbitrary embeds via the About surface.
ALLOWED_TAGS = [
    "p", "br", "strong", "em", "u",
    "ul", "ol", "li",
    "a",
    "h3", "h4",
    "blockquote",
]
ALLOWED_ATTRS = {
    "a": ["href", "title", "rel"],
}
ALLOWED_PROTOCOLS = ["http", "https", "mailto"]


# Slugs in display order. Used by both the kiosk hub (tile order) and the
# editor accordion (form order). Treat as the canonical sequence.
SECTION_SLUGS = ["mission", "values", "history", "quality", "hymn", "seal"]


class AboutContent:
    @staticmethod
    def sanitize_html(value):
        """Run bleach with the About allowlist. None/empty returns ''."""
        if not value:
            return ""
        return bleach.clean(
            value,
            tags=ALLOWED_TAGS,
            attributes=ALLOWED_ATTRS,
            protocols=ALLOWED_PROTOCOLS,
            strip=True,
        )

    @staticmethod
    def sanitize_subsections(subsections):
        """Sanitize each {heading, body_html} entry. Returns a list."""
        if not subsections:
            return []
        result = []
        for entry in subsections:
            if not isinstance(entry, dict):
                continue
            result.append({
                "heading": (entry.get("heading") or "").strip()[:200],
                "body_html": AboutContent.sanitize_html(entry.get("body_html")),
            })
        return result

    @staticmethod
    def load_all():
        """Return {sections: {slug: section}, milestones: [...] } ordered."""
        rows = list(AboutSection.all() or [])
        sections = {row.slug: row for row in rows}
        milestones = list(
            AboutMilestone.order_by("sort_order", "asc")
                          .order_by("id", "asc")
                          .get() or []
        )
        return {
            "sections": sections,
            "ordered_slugs": SECTION_SLUGS,
            "milestones": milestones,
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/unit/test_about_lspu.py -v`
Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/services/AboutContent.py tests/unit/test_about_lspu.py
git commit -m "Add AboutContent service with bleach sanitisation"
```

---

## Task 7: AboutController — kiosk render + route wiring

**Files:**
- Create: `app/controllers/AboutController.py`
- Modify: `routes/public.py`
- Modify: `app/controllers/WelcomeController.py:109-110` (remove the `about_lspu` stub)

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/test_about_lspu.py`:

```python
from unittest.mock import patch

from app.controllers.AboutController import AboutController


class AboutControllerKioskTestCase(TestCase):
    def test_kiosk_renders_with_six_sections(self):
        controller = AboutController()
        view = type("V", (), {})()
        captured = {}

        def fake_render(template, context):
            captured["template"] = template
            captured["context"] = context
            return "rendered"

        view.render = fake_render
        result = controller.kiosk(view)

        self.assertEqual(result, "rendered")
        self.assertEqual(captured["template"], "kiosk/about-lspu")
        self.assertEqual(captured["context"]["ordered_slugs"],
                         ["mission", "values", "history", "quality", "hymn", "seal"])
        self.assertIn("sections", captured["context"])
        self.assertIn("milestones", captured["context"])
        self.assertEqual(len(captured["context"]["sections"]), 6)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/unit/test_about_lspu.py::AboutControllerKioskTestCase -v`
Expected: FAIL with `ModuleNotFoundError` for `app.controllers.AboutController`.

- [ ] **Step 3: Write the controller (kiosk method only for now)**

Create `app/controllers/AboutController.py`:

```python
from masonite.controllers import Controller
from masonite.views import View

from app.services.AboutContent import AboutContent


class AboutController(Controller):
    def kiosk(self, view: View):
        """Render the public About LSPU kiosk page.

        All six sections are loaded eagerly; the client-side JS swaps
        between hub and detail views without re-hitting the server.
        """
        data = AboutContent.load_all()
        return view.render(
            "kiosk/about-lspu",
            {
                "sections": data["sections"],
                "ordered_slugs": data["ordered_slugs"],
                "milestones": data["milestones"],
            },
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/unit/test_about_lspu.py::AboutControllerKioskTestCase -v`
Expected: PASS.

- [ ] **Step 5: Repoint route in `routes/public.py`**

In `routes/public.py`, find:
```python
Route.get("/kiosk/about-lspu", "WelcomeController@about_lspu").name("kiosk.about-lspu"),
```
Replace with:
```python
Route.get("/kiosk/about-lspu", "AboutController@kiosk").name("kiosk.about-lspu"),
```

- [ ] **Step 6: Remove the obsolete WelcomeController stub**

In `app/controllers/WelcomeController.py`, delete lines:
```python
    def about_lspu(self, view: View):
        return self.coming_soon(view, "About LSPU")
```

- [ ] **Step 7: Commit**

```bash
git add app/controllers/AboutController.py app/controllers/WelcomeController.py routes/public.py tests/unit/test_about_lspu.py
git commit -m "Wire AboutController.kiosk to /kiosk/about-lspu"
```

---

## Task 8: Kiosk template — hub and detail markup

**Files:**
- Create: `templates/kiosk/about-lspu.html`

- [ ] **Step 1: Write the template**

Create `templates/kiosk/about-lspu.html`:

```html
<!DOCTYPE html>
<html>
<head>
<title>About LSPU — PressPoint</title>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, minimal-ui" />
<link rel="stylesheet" href="/storage/compiled/css/about-lspu-kiosk.css">
</head>
<body class="about-page">

  <header class="about-hero">
    <img class="about-hero__logo" src="/gears.png?v=20260411" alt="Gears logo">
    <h1 class="about-hero__title">PRESSPOINT</h1>
    <p class="about-hero__subtitle">About LSPU</p>
  </header>

  <main id="about-stage" class="about-stage" data-view="hub">

    {# ===== HUB ===== #}
    <section class="about-hub" data-pane="hub" aria-hidden="false">
      <ul class="about-tiles">
        {% set tiles = [
          {'slug': 'mission', 'icon': '🎯', 'color': 'tile--blue',   'teaser': 'What we stand for'},
          {'slug': 'values',  'icon': '🤝', 'color': 'tile--amber',  'teaser': 'How we work together'},
          {'slug': 'history', 'icon': '📜', 'color': 'tile--green',  'teaser': 'Milestones over the years'},
          {'slug': 'quality', 'icon': '⭐', 'color': 'tile--purple', 'teaser': 'Our commitment to quality'},
          {'slug': 'hymn',    'icon': '🎵', 'color': 'tile--pink',   'teaser': 'Sing with the campus'},
          {'slug': 'seal',    'icon': '🛡️', 'color': 'tile--cyan',   'teaser': 'Symbols & meaning'}
        ] %}
        {% for tile in tiles %}
          {% set section = sections.get(tile.slug) %}
          <li>
            <button type="button"
                    class="about-tile {{ tile.color }}"
                    data-target="{{ tile.slug }}"
                    aria-label="Open {{ section.title if section else tile.slug }}">
              <span class="about-tile__icon" aria-hidden="true">{{ tile.icon }}</span>
              <span class="about-tile__title">{{ section.title if section else tile.slug|capitalize }}</span>
              <span class="about-tile__teaser">{{ tile.teaser }}</span>
            </button>
          </li>
        {% endfor %}
      </ul>
      <a class="about-back-kiosk" href="/kiosk">◀ Back to Kiosk</a>
    </section>

    {# ===== DETAIL PANES (one per slug) ===== #}
    {% for slug in ordered_slugs %}
      {% set section = sections.get(slug) %}
      <section class="about-detail" data-pane="{{ slug }}" aria-hidden="true">
        <header class="about-detail__bar">
          <button type="button" class="about-detail__back" data-back>◀ Back to Hub</button>
          <h2 class="about-detail__title">{{ section.title if section else slug|capitalize }}</h2>
          <span class="about-detail__idle" aria-hidden="true"></span>
        </header>

        <div class="about-detail__body">
          {% if not section %}
            <p class="about-empty">Coming soon.</p>

          {% elif slug == 'mission' or slug == 'values' %}
            <div class="about-subcards">
              {% for sub in (section.subsections or []) %}
                <article class="about-subcard">
                  <h3 class="about-subcard__heading">{{ sub.heading }}</h3>
                  <div class="about-subcard__body">{{ sub.body_html|safe }}</div>
                </article>
              {% endfor %}
            </div>

          {% elif slug == 'history' %}
            {% if section.body_html %}
              <div class="about-history__intro">{{ section.body_html|safe }}</div>
            {% endif %}
            <ol class="about-timeline">
              {% for m in milestones %}
                <li class="about-timeline__item {% if loop.index is even %}is-right{% else %}is-left{% endif %}">
                  <span class="about-timeline__year">{{ m.year }}</span>
                  <article class="about-timeline__card">
                    <h3 class="about-timeline__heading">{{ m.heading }}</h3>
                    {% if m.image_path %}
                      <img class="about-timeline__image" src="/storage/{{ m.image_path }}" alt="">
                    {% endif %}
                    <div class="about-timeline__body">{{ m.body_html|safe }}</div>
                  </article>
                </li>
              {% endfor %}
              {% if not milestones %}
                <li class="about-empty">No milestones yet.</li>
              {% endif %}
            </ol>

          {% elif slug == 'quality' %}
            <article class="about-statement">{{ section.body_html|safe }}</article>

          {% elif slug == 'hymn' %}
            <article class="about-hymn">{{ section.body_html|safe }}</article>

          {% elif slug == 'seal' %}
            <div class="about-seal">
              {% if section.image_path %}
                <img class="about-seal__image" src="/storage/{{ section.image_path }}" alt="University Seal">
              {% else %}
                <div class="about-seal__placeholder" aria-hidden="true">🛡️</div>
              {% endif %}
              <div class="about-seal__description">{{ section.body_html|safe }}</div>
            </div>
          {% endif %}
        </div>
      </section>
    {% endfor %}

  </main>

  <script src="/storage/compiled/js/about-lspu-kiosk.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add templates/kiosk/about-lspu.html
git commit -m "Add About LSPU kiosk template (hub + 6 detail panes)"
```

---

## Task 9: Kiosk CSS — solid colors, no gradients

**Files:**
- Create: `resources/css/about-lspu-kiosk.css`
- Modify: `webpack.mix.js`

- [ ] **Step 1: Write the CSS**

Create `resources/css/about-lspu-kiosk.css`:

```css
/* About LSPU kiosk styles — solid colors only, no gradients. */

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; height: 100%; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }

.about-page {
  background: #0f1428;
  color: #e5e7eb;
  min-height: 100vh;
}

.about-hero {
  text-align: center;
  padding: 28px 16px 8px;
}
.about-hero__logo { width: 96px; height: auto; }
.about-hero__title { margin: 8px 0 4px; font-size: 32px; letter-spacing: 4px; color: #fff; }
.about-hero__subtitle { margin: 0; font-size: 18px; color: #9ca3af; letter-spacing: 2px; }

.about-stage { padding: 24px; max-width: 1280px; margin: 0 auto; position: relative; }

/* ----- Hub ----- */
.about-hub[aria-hidden="true"] { display: none; }
.about-tiles {
  list-style: none; margin: 0; padding: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-auto-rows: 1fr;
  gap: 18px;
}
@media (max-width: 900px) {
  .about-tiles { grid-template-columns: repeat(2, 1fr); }
}

.about-tile {
  width: 100%;
  aspect-ratio: 1;
  border: none;
  border-radius: 22px;
  padding: 18px;
  cursor: pointer;
  color: #fff;
  text-align: left;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  font-family: inherit;
  transition: transform 120ms ease, box-shadow 120ms ease;
  box-shadow: 0 4px 0 rgba(0,0,0,0.25);
}
.about-tile:active { transform: translateY(2px); box-shadow: 0 2px 0 rgba(0,0,0,0.25); }
.about-tile__icon { font-size: 44px; line-height: 1; margin-bottom: 8px; }
.about-tile__title { display: block; font-size: 22px; font-weight: 800; }
.about-tile__teaser { display: block; font-size: 14px; opacity: 0.85; margin-top: 4px; }

/* Solid tile colors — no gradients. */
.tile--blue   { background: #2563eb; }
.tile--amber  { background: #d97706; }
.tile--green  { background: #059669; }
.tile--purple { background: #7c3aed; }
.tile--pink   { background: #db2777; }
.tile--cyan   { background: #0891b2; }

.about-back-kiosk {
  position: fixed; right: 24px; bottom: 24px;
  background: #1a2240; color: #fff;
  padding: 10px 18px; border-radius: 999px;
  text-decoration: none; font-weight: 600;
  box-shadow: 0 4px 0 rgba(0,0,0,0.25);
}

/* ----- Detail ----- */
.about-detail { display: none; }
.about-stage[data-view="mission"]  .about-detail[data-pane="mission"],
.about-stage[data-view="values"]   .about-detail[data-pane="values"],
.about-stage[data-view="history"]  .about-detail[data-pane="history"],
.about-stage[data-view="quality"]  .about-detail[data-pane="quality"],
.about-stage[data-view="hymn"]     .about-detail[data-pane="hymn"],
.about-stage[data-view="seal"]     .about-detail[data-pane="seal"] {
  display: block;
}
.about-stage[data-view="hub"] .about-hub { display: block; }
.about-stage:not([data-view="hub"]) .about-hub { display: none; }

.about-detail__bar {
  display: flex; align-items: center; gap: 16px;
  padding: 8px 0 18px;
}
.about-detail__back {
  background: #1a2240; color: #fff; border: none;
  padding: 10px 16px; border-radius: 999px; cursor: pointer;
  font-family: inherit; font-weight: 600;
}
.about-detail__title { margin: 0; font-size: 26px; color: #fff; flex: 1; }
.about-detail__idle {
  width: 10px; height: 10px; border-radius: 50%;
  background: #10b981;
  transition: background 200ms;
}
.about-detail__body {
  background: #1a2240;
  border-radius: 18px;
  padding: 28px;
  color: #e5e7eb;
  font-size: 18px;
  line-height: 1.6;
}

/* Sub-cards (mission, values) */
.about-subcards { display: flex; flex-direction: column; gap: 18px; }
.about-subcard {
  background: #0f1428; border-radius: 14px; padding: 22px;
  border-left: 6px solid #2563eb;
}
.about-subcard__heading { margin: 0 0 8px; color: #fff; font-size: 22px; }

/* Timeline (history) */
.about-history__intro { margin-bottom: 24px; }
.about-timeline { list-style: none; margin: 0; padding: 0 0 0 24px; border-left: 3px solid #2563eb; }
.about-timeline__item { position: relative; margin-bottom: 28px; }
.about-timeline__year {
  display: inline-block;
  background: #2563eb; color: #fff;
  padding: 4px 12px; border-radius: 999px; font-weight: 700;
  margin-bottom: 8px;
}
.about-timeline__card { background: #0f1428; padding: 18px; border-radius: 12px; }
.about-timeline__heading { margin: 0 0 8px; color: #fff; }
.about-timeline__image { max-width: 100%; border-radius: 8px; margin-bottom: 8px; }

/* Quality statement */
.about-statement {
  text-align: center;
  font-size: 22px;
  padding: 24px;
  border-top: 3px solid #7c3aed;
  border-bottom: 3px solid #7c3aed;
}

/* Hymn */
.about-hymn { font-size: 22px; line-height: 1.8; text-align: center; }
.about-hymn p { margin-bottom: 16px; }

/* Seal */
.about-seal { display: flex; gap: 24px; align-items: flex-start; }
@media (max-width: 700px) { .about-seal { flex-direction: column; } }
.about-seal__image { max-width: 280px; height: auto; border-radius: 12px; background: #fff; padding: 8px; }
.about-seal__placeholder {
  width: 220px; height: 220px;
  background: #0891b2; color: #fff;
  display: flex; align-items: center; justify-content: center;
  border-radius: 12px; font-size: 80px;
}
.about-seal__description { flex: 1; }

.about-empty { color: #9ca3af; font-style: italic; }
```

- [ ] **Step 2: Register the bundle in `webpack.mix.js`**

In `webpack.mix.js`, in the chain of `.postCss(...)` calls, add **before** `mix.setPublicPath(".")`:

```js
  .postCss('resources/css/about-lspu-kiosk.css', 'storage/compiled/css', [
    //
  ])
```

- [ ] **Step 3: Commit**

```bash
git add resources/css/about-lspu-kiosk.css webpack.mix.js
git commit -m "Add About LSPU kiosk CSS bundle"
```

---

## Task 10: Kiosk JS — view switcher + idle timer

**Files:**
- Create: `resources/js/about-lspu-kiosk.js`
- Modify: `webpack.mix.js`

- [ ] **Step 1: Write the JS**

Create `resources/js/about-lspu-kiosk.js`:

```javascript
// About LSPU kiosk client.
// - Hub-and-spoke: tile click swaps the active pane via the
//   data-view attribute on #about-stage (CSS handles the show/hide).
// - Idle timer: 60 s with no input outside the hub returns to hub.
//   Reset on pointerdown, touchstart, wheel, keydown.

(function () {
  var stage = document.getElementById('about-stage');
  if (!stage) return;

  var IDLE_MS = 60 * 1000;
  var idleTimer = null;

  function showPane(slug) {
    stage.dataset.view = slug;
    if (slug === 'hub') {
      stopIdle();
    } else {
      restartIdle();
      // Scroll the detail body to the top so each pane opens fresh.
      var pane = stage.querySelector('.about-detail[data-pane="' + slug + '"]');
      if (pane) pane.scrollTop = 0;
      window.scrollTo(0, 0);
    }
  }

  function restartIdle() {
    stopIdle();
    idleTimer = window.setTimeout(function () { showPane('hub'); }, IDLE_MS);
  }

  function stopIdle() {
    if (idleTimer) window.clearTimeout(idleTimer);
    idleTimer = null;
  }

  function onActivity() {
    if (stage.dataset.view !== 'hub') restartIdle();
  }

  // Tile click → open pane.
  stage.querySelectorAll('.about-tile').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = btn.getAttribute('data-target');
      if (target) showPane(target);
    });
  });

  // Back-to-hub buttons.
  stage.querySelectorAll('[data-back]').forEach(function (btn) {
    btn.addEventListener('click', function () { showPane('hub'); });
  });

  // Activity listeners — only the four input modalities a kiosk sees.
  ['pointerdown', 'touchstart', 'wheel', 'keydown'].forEach(function (evt) {
    document.addEventListener(evt, onActivity, { passive: true });
  });

  // Start on the hub.
  showPane('hub');
})();
```

- [ ] **Step 2: Register the bundle in `webpack.mix.js`**

In `webpack.mix.js`, in the chain of `.js(...)` calls, add **before** the `.postCss(...)` chain:

```js
  .js('resources/js/about-lspu-kiosk.js', 'storage/compiled/js')
```

- [ ] **Step 3: Build assets**

Run: `npm run dev`
Expected: build completes, `storage/compiled/js/about-lspu-kiosk.js` and `storage/compiled/css/about-lspu-kiosk.css` exist.

- [ ] **Step 4: Manual smoke test**

Run: `python craft serve` then open `http://localhost:8000/kiosk/about-lspu` in a browser.
Verify:
- 6 tiles are visible in the hub
- Tapping a tile opens the detail pane
- "Back to Hub" returns to the hub
- Wait 60 s with no activity inside a detail pane → snaps back to hub

- [ ] **Step 5: Commit**

```bash
git add resources/js/about-lspu-kiosk.js webpack.mix.js
git commit -m "Add About LSPU kiosk JS (view switcher + idle timer)"
```

---

## Task 11: Editor route + dashboard card

**Files:**
- Modify: `routes/dashboard.py`
- Modify: `templates/gears/dashboard.html`

- [ ] **Step 1: Add the editor GET route**

In `routes/dashboard.py`, append inside `ROUTES`:

```python
    Route.get("/gears/about-lspu",                       "AboutController@editor").name("gears.about-lspu").middleware("auth"),
    Route.post("/gears/about-lspu/sections/@slug",       "AboutController@save_section").middleware("auth"),
    Route.post("/gears/about-lspu/milestones",           "AboutController@create_milestone").middleware("auth"),
    Route.post("/gears/about-lspu/milestones/@id",       "AboutController@update_milestone").middleware("auth"),
    Route.post("/gears/about-lspu/milestones/@id/delete","AboutController@delete_milestone").middleware("auth"),
    Route.post("/gears/about-lspu/milestones/@id/reorder","AboutController@reorder_milestone").middleware("auth"),
    Route.post("/gears/about-lspu/seal/upload",          "AboutController@upload_seal").middleware("auth"),
```

- [ ] **Step 2: Add a dashboard card**

In `templates/gears/dashboard.html`, locate the existing dashboard card grid (search for the block where Archives, News, Tour Mapping cards live — they are the existing `<a>` tiles inside the dashboard nav). Add a new card alongside:

```html
<a href="/gears/about-lspu" class="dashboard-card">
  <span class="dashboard-card__icon">🎓</span>
  <span class="dashboard-card__title">About LSPU</span>
  <span class="dashboard-card__teaser">Edit mission, values, history, quality, hymn, seal</span>
</a>
```

(If the dashboard uses a different markup pattern, match the surrounding cards exactly — the existing classes win over the example above. The point is one link to `/gears/about-lspu`.)

- [ ] **Step 3: Commit**

```bash
git add routes/dashboard.py templates/gears/dashboard.html
git commit -m "Add About LSPU editor routes and dashboard card"
```

---

## Task 12: AboutController.editor + save_section

**Files:**
- Modify: `app/controllers/AboutController.py`
- Test: `tests/unit/test_about_lspu.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/test_about_lspu.py`:

```python
class AboutControllerSaveSectionTestCase(TestCase):
    def test_save_section_rejects_unknown_slug(self):
        from app.models.AboutSection import AboutSection
        controller = AboutController()
        request = type("R", (), {})()
        request.input = lambda key, default=None: ""
        request.user = lambda: type("U", (), {"id": 1})()
        response = type("Resp", (), {})()

        # response.redirect(...).with_errors([...]) chain
        recorded = {}
        class Redirect:
            def with_errors(self, errors):
                recorded["errors"] = errors
                return "redirected"
            def with_success(self, msgs):
                recorded["success"] = msgs
                return "redirected"
        response.redirect = lambda **kwargs: Redirect()

        result = controller.save_section("not-a-real-slug", request, response)
        self.assertEqual(result, "redirected")
        self.assertIn("errors", recorded)

    def test_save_section_strips_script_before_persisting(self):
        from app.models.AboutSection import AboutSection
        controller = AboutController()

        request = type("R", (), {})()
        inputs = {"body_html": "<p>Hello</p><script>bad()</script>"}
        request.input = lambda key, default=None: inputs.get(key, default if default is not None else "")
        request.user = lambda: type("U", (), {"id": 1})()

        class Redirect:
            def with_errors(self, errors): return "err"
            def with_success(self, msgs): return "ok"
        response = type("Resp", (), {})()
        response.redirect = lambda **kwargs: Redirect()

        result = controller.save_section("quality", request, response)
        self.assertEqual(result, "ok")

        row = AboutSection.where("slug", "quality").first()
        self.assertNotIn("<script", row.body_html or "")
        self.assertIn("Hello", row.body_html or "")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/unit/test_about_lspu.py::AboutControllerSaveSectionTestCase -v`
Expected: FAIL — `save_section` not defined on `AboutController`.

- [ ] **Step 3: Add `editor` and `save_section` to the controller**

In `app/controllers/AboutController.py`, expand:

```python
import json

from masonite.controllers import Controller
from masonite.request import Request
from masonite.response import Response
from masonite.views import View

from app.models.AboutSection import AboutSection
from app.services.AboutContent import AboutContent, SECTION_SLUGS


class AboutController(Controller):
    def kiosk(self, view: View):
        data = AboutContent.load_all()
        return view.render(
            "kiosk/about-lspu",
            {
                "sections": data["sections"],
                "ordered_slugs": data["ordered_slugs"],
                "milestones": data["milestones"],
            },
        )

    def editor(self, view: View):
        data = AboutContent.load_all()
        return view.render(
            "gears/about-lspu",
            {
                "sections": data["sections"],
                "ordered_slugs": data["ordered_slugs"],
                "milestones": data["milestones"],
            },
        )

    def save_section(self, slug, request: Request, response: Response):
        """Update a single section's content. Slug is path-bound; whole
        rows are seeded so this is always an UPDATE, never an INSERT."""
        if slug not in SECTION_SLUGS:
            return response.redirect(name="gears.about-lspu").with_errors(
                ["Unknown section."]
            )

        section = AboutSection.where("slug", slug).first()
        if not section:
            return response.redirect(name="gears.about-lspu").with_errors(
                ["Section not found."]
            )

        # Mission/values store sub-blocks, NOT body_html. Their form
        # POSTs each sub-block's HTML as subsections[i][heading] /
        # subsections[i][body_html] — Masonite's request.input flattens
        # those into a list when the form encodes them as JSON. To keep
        # things deterministic we accept a single 'subsections' input
        # holding a JSON-encoded array.
        if slug in ("mission", "values"):
            raw = request.input("subsections") or "[]"
            try:
                parsed = json.loads(raw)
            except (TypeError, ValueError):
                parsed = []
            section.subsections = AboutContent.sanitize_subsections(parsed)
            section.body_html = None
        else:
            section.body_html = AboutContent.sanitize_html(
                request.input("body_html") or ""
            )

        # Title is editable for completeness; clamp length.
        title = (request.input("title") or section.title).strip()
        if title:
            section.title = title[:150]

        try:
            user = request.user() if callable(getattr(request, "user", None)) else None
            section.updated_by_id = getattr(user, "id", None)
        except Exception:
            section.updated_by_id = None

        section.save()
        return response.redirect(name="gears.about-lspu").with_success(
            ["Section saved."]
        )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/unit/test_about_lspu.py::AboutControllerSaveSectionTestCase -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/controllers/AboutController.py tests/unit/test_about_lspu.py
git commit -m "Add About LSPU editor render + save_section endpoint"
```

---

## Task 13: AboutController — milestone CRUD

**Files:**
- Modify: `app/controllers/AboutController.py`
- Test: `tests/unit/test_about_lspu.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/test_about_lspu.py`:

```python
class AboutMilestoneCrudTestCase(TestCase):
    def setUp(self):
        from app.models.AboutMilestone import AboutMilestone
        AboutMilestone.where("heading", "TEST_MILESTONE").delete()

    def _request(self, inputs):
        request = type("R", (), {})()
        request.input = lambda key, default=None: inputs.get(key, default if default is not None else "")
        return request

    def _response(self):
        class Redirect:
            def with_errors(self, errors): return "err"
            def with_success(self, msgs): return "ok"
        response = type("Resp", (), {})()
        response.redirect = lambda **kwargs: Redirect()
        return response

    def test_create_milestone_persists_row(self):
        from app.models.AboutMilestone import AboutMilestone
        controller = AboutController()
        result = controller.create_milestone(
            self._request({"year": "1952", "heading": "TEST_MILESTONE",
                           "body_html": "<p>Founded</p><script>x</script>"}),
            self._response(),
        )
        self.assertEqual(result, "ok")
        row = AboutMilestone.where("heading", "TEST_MILESTONE").first()
        self.assertIsNotNone(row)
        self.assertEqual(row.year, "1952")
        self.assertNotIn("<script", row.body_html)

    def test_delete_milestone_removes_row(self):
        from app.models.AboutMilestone import AboutMilestone
        m = AboutMilestone.create({
            "year": "1999", "heading": "TEST_MILESTONE",
            "body_html": "<p>x</p>", "sort_order": 0,
        })
        controller = AboutController()
        result = controller.delete_milestone(m.id, self._response())
        self.assertEqual(result, "ok")
        self.assertIsNone(AboutMilestone.where("id", m.id).first())
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/unit/test_about_lspu.py::AboutMilestoneCrudTestCase -v`
Expected: FAIL — `create_milestone` / `delete_milestone` not defined.

- [ ] **Step 3: Append the CRUD methods to the controller**

In `app/controllers/AboutController.py`, add at the top:

```python
from app.models.AboutMilestone import AboutMilestone
```

And inside `class AboutController` add:

```python
    def create_milestone(self, request: Request, response: Response):
        year = (request.input("year") or "").strip()[:20]
        heading = (request.input("heading") or "").strip()[:200]
        body_html = AboutContent.sanitize_html(request.input("body_html") or "")
        if not year or not heading:
            return response.redirect(name="gears.about-lspu").with_errors(
                ["Year and heading are required."]
            )

        # New rows go to the end of the timeline by default.
        last = AboutMilestone.order_by("sort_order", "desc").first()
        next_order = (getattr(last, "sort_order", 0) or 0) + 1

        AboutMilestone.create({
            "year": year,
            "heading": heading,
            "body_html": body_html,
            "image_path": None,
            "sort_order": next_order,
        })
        return response.redirect(name="gears.about-lspu").with_success(
            ["Milestone added."]
        )

    def update_milestone(self, id, request: Request, response: Response):
        row = AboutMilestone.where("id", id).first()
        if not row:
            return response.redirect(name="gears.about-lspu").with_errors(
                ["Milestone not found."]
            )
        year = (request.input("year") or "").strip()[:20]
        heading = (request.input("heading") or "").strip()[:200]
        if year:
            row.year = year
        if heading:
            row.heading = heading
        body_html = request.input("body_html")
        if body_html is not None:
            row.body_html = AboutContent.sanitize_html(body_html)
        row.save()
        return response.redirect(name="gears.about-lspu").with_success(
            ["Milestone updated."]
        )

    def delete_milestone(self, id, response: Response):
        row = AboutMilestone.where("id", id).first()
        if row:
            row.delete()
        return response.redirect(name="gears.about-lspu").with_success(
            ["Milestone removed."]
        )

    def reorder_milestone(self, id, request: Request, response: Response):
        # direction = 'up' (decrement sort_order) or 'down' (increment).
        # Swaps sort_order with the adjacent neighbour so positions stay
        # densely packed without an explicit re-numbering pass.
        direction = (request.input("direction") or "").strip()
        row = AboutMilestone.where("id", id).first()
        if not row or direction not in ("up", "down"):
            return response.redirect(name="gears.about-lspu").with_errors(
                ["Cannot reorder."]
            )
        comparator = "<" if direction == "up" else ">"
        order_dir = "desc" if direction == "up" else "asc"
        neighbour = (
            AboutMilestone.where("sort_order", comparator, row.sort_order)
                          .order_by("sort_order", order_dir)
                          .first()
        )
        if neighbour:
            row.sort_order, neighbour.sort_order = neighbour.sort_order, row.sort_order
            row.save()
            neighbour.save()
        return response.redirect(name="gears.about-lspu").with_success(
            ["Order updated."]
        )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/unit/test_about_lspu.py::AboutMilestoneCrudTestCase -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/controllers/AboutController.py tests/unit/test_about_lspu.py
git commit -m "Add About LSPU milestone CRUD endpoints"
```

---

## Task 14: AboutController — seal upload

**Files:**
- Modify: `app/controllers/AboutController.py`
- Test: `tests/unit/test_about_lspu.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/test_about_lspu.py`:

```python
class AboutSealUploadTestCase(TestCase):
    def _response(self):
        class Redirect:
            def __init__(self): self.errors = None; self.success = None
            def with_errors(self, errors): self.errors = errors; return "err:" + ",".join(errors)
            def with_success(self, msgs): self.success = msgs; return "ok"
        response = type("Resp", (), {})()
        # Stash the redirect so the test can inspect it.
        response._last = []
        def redirect(**kwargs):
            r = Redirect()
            response._last.append(r)
            return r
        response.redirect = redirect
        return response

    def test_seal_upload_rejects_non_image(self):
        controller = AboutController()
        # File-like object missing the right mimetype.
        class FakeFile:
            mime_type = "text/plain"
            content = b"not an image"
            filename = "evil.txt"
        request = type("R", (), {})()
        request.input = lambda key, default=None: FakeFile() if key == "file" else (default or "")

        result = controller.upload_seal(request, self._response())
        self.assertTrue(str(result).startswith("err:"))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/unit/test_about_lspu.py::AboutSealUploadTestCase -v`
Expected: FAIL — `upload_seal` not defined.

- [ ] **Step 3: Add `upload_seal` to the controller**

In `app/controllers/AboutController.py`, add imports:

```python
import os
import secrets
```

And inside `class AboutController` add:

```python
    ALLOWED_IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp"}
    MAX_IMAGE_BYTES = 4 * 1024 * 1024
    SEAL_DIR = "storage/about"

    def upload_seal(self, request: Request, response: Response):
        """Persist a seal image to storage/about/ and update the
        seal section's image_path."""
        file = request.input("file")
        if isinstance(file, list):
            file = file[0] if file else None

        mime = getattr(file, "mime_type", None) or getattr(file, "mimetype", None)
        if not file or mime not in self.ALLOWED_IMAGE_MIMES:
            return response.redirect(name="gears.about-lspu").with_errors(
                ["Upload must be a JPEG, PNG, or WEBP image."]
            )

        content = getattr(file, "content", None)
        if content is None and hasattr(file, "stream"):
            content = file.stream.read()
        if content is None or len(content) > self.MAX_IMAGE_BYTES:
            return response.redirect(name="gears.about-lspu").with_errors(
                ["Image must be 4 MB or smaller."]
            )

        ext = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[mime]
        random_name = "seal-" + secrets.token_hex(8) + ext
        os.makedirs(self.SEAL_DIR, exist_ok=True)
        target = os.path.join(self.SEAL_DIR, random_name)
        with open(target, "wb") as fh:
            fh.write(content)

        section = AboutSection.where("slug", "seal").first()
        if section:
            # Stored path is relative to the storage/ route prefix.
            section.image_path = "about/" + random_name
            section.save()

        return response.redirect(name="gears.about-lspu").with_success(
            ["Seal image uploaded."]
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/unit/test_about_lspu.py::AboutSealUploadTestCase -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/controllers/AboutController.py tests/unit/test_about_lspu.py
git commit -m "Add About LSPU seal image upload"
```

---

## Task 15: Editor template + Quill integration

**Files:**
- Create: `templates/gears/about-lspu.html`

- [ ] **Step 1: Write the editor template**

Create `templates/gears/about-lspu.html`:

```html
<!DOCTYPE html>
<html>
<head>
<title>About LSPU — Editor</title>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/quill@2.0.0/dist/quill.snow.css">
<link rel="stylesheet" href="/storage/compiled/css/about-lspu-editor.css">
</head>
<body class="about-editor">

<header class="editor-header">
  <a href="/gears/dashboard" class="editor-back">◀ Dashboard</a>
  <h1>About LSPU</h1>
</header>

{% if request.session.get('flash_success') %}
  <div class="flash flash--success">{{ request.session.get('flash_success')|join(' ') }}</div>
{% endif %}
{% if request.session.get('flash_errors') %}
  <div class="flash flash--error">{{ request.session.get('flash_errors')|join(' ') }}</div>
{% endif %}

<div class="editor-shell">

  {# ===== Mission / Values: subsections ===== #}
  {% for slug in ['mission', 'values'] %}
    {% set section = sections.get(slug) %}
    <details class="acc" open>
      <summary class="acc__summary">{{ section.title if section else slug }}</summary>
      <form class="acc__form" method="POST" action="/gears/about-lspu/sections/{{ slug }}" data-section-form="{{ slug }}">
        {{ csrf_field|safe if csrf_field is defined else '' }}
        <label class="field">
          <span>Title</span>
          <input type="text" name="title" value="{{ section.title if section else '' }}" maxlength="150">
        </label>
        <div class="subblocks" data-subblocks>
          {% for sub in (section.subsections if section else []) %}
            <div class="subblock">
              <label class="field">
                <span>Heading</span>
                <input type="text" class="js-sub-heading" value="{{ sub.heading }}" maxlength="200">
              </label>
              <label class="field">
                <span>Body</span>
                <div class="js-sub-editor">{{ sub.body_html|safe }}</div>
              </label>
            </div>
          {% endfor %}
        </div>
        <input type="hidden" name="subsections" class="js-subsections-payload">
        <button type="submit" class="btn btn--primary">Save</button>
      </form>
    </details>
  {% endfor %}

  {# ===== History ===== #}
  <details class="acc" open>
    <summary class="acc__summary">{{ sections.get('history').title if sections.get('history') else 'History' }}</summary>

    <form class="acc__form" method="POST" action="/gears/about-lspu/sections/history" data-section-form="history">
      <label class="field">
        <span>Intro paragraph</span>
        <div class="js-body-editor">{{ sections.get('history').body_html|safe if sections.get('history') else '' }}</div>
      </label>
      <input type="hidden" name="body_html" class="js-body-payload">
      <input type="hidden" name="title" value="{{ sections.get('history').title if sections.get('history') else 'Historical Development' }}">
      <button type="submit" class="btn btn--primary">Save intro</button>
    </form>

    <h3>Milestones</h3>
    <ol class="milestones">
      {% for m in milestones %}
        <li class="milestone">
          <form method="POST" action="/gears/about-lspu/milestones/{{ m.id }}" data-milestone-form>
            <div class="row">
              <input type="text" name="year" value="{{ m.year }}" maxlength="20" placeholder="Year">
              <input type="text" name="heading" value="{{ m.heading }}" maxlength="200" placeholder="Heading">
            </div>
            <div class="js-body-editor">{{ m.body_html|safe }}</div>
            <input type="hidden" name="body_html" class="js-body-payload">
            <div class="row row--actions">
              <button type="submit" class="btn">Save</button>
            </div>
          </form>
          <form method="POST" action="/gears/about-lspu/milestones/{{ m.id }}/reorder" class="reorder-form">
            <button name="direction" value="up" class="btn btn--icon">↑</button>
            <button name="direction" value="down" class="btn btn--icon">↓</button>
          </form>
          <form method="POST" action="/gears/about-lspu/milestones/{{ m.id }}/delete">
            <button class="btn btn--danger">✕ Delete</button>
          </form>
        </li>
      {% endfor %}
    </ol>

    <form method="POST" action="/gears/about-lspu/milestones" class="milestone-create" data-milestone-form>
      <h4>Add milestone</h4>
      <div class="row">
        <input type="text" name="year" maxlength="20" placeholder="Year" required>
        <input type="text" name="heading" maxlength="200" placeholder="Heading" required>
      </div>
      <div class="js-body-editor"></div>
      <input type="hidden" name="body_html" class="js-body-payload">
      <button type="submit" class="btn btn--primary">+ Add milestone</button>
    </form>
  </details>

  {# ===== Quality / Hymn: single body_html ===== #}
  {% for slug in ['quality', 'hymn'] %}
    {% set section = sections.get(slug) %}
    <details class="acc">
      <summary class="acc__summary">{{ section.title if section else slug }}</summary>
      <form class="acc__form" method="POST" action="/gears/about-lspu/sections/{{ slug }}" data-section-form="{{ slug }}">
        <label class="field">
          <span>Title</span>
          <input type="text" name="title" value="{{ section.title if section else '' }}" maxlength="150">
        </label>
        <label class="field">
          <span>Body</span>
          <div class="js-body-editor">{{ section.body_html|safe if section else '' }}</div>
        </label>
        <input type="hidden" name="body_html" class="js-body-payload">
        <button type="submit" class="btn btn--primary">Save</button>
      </form>
    </details>
  {% endfor %}

  {# ===== Seal: image upload + body_html ===== #}
  <details class="acc">
    <summary class="acc__summary">{{ sections.get('seal').title if sections.get('seal') else 'University Seal' }}</summary>

    <form class="acc__form" method="POST" action="/gears/about-lspu/seal/upload" enctype="multipart/form-data">
      <label class="field">
        <span>Seal image (JPG / PNG / WEBP, max 4 MB)</span>
        <input type="file" name="file" accept="image/jpeg,image/png,image/webp" required>
      </label>
      {% if sections.get('seal') and sections.get('seal').image_path %}
        <img class="seal-preview" src="/storage/{{ sections.get('seal').image_path }}" alt="Current seal">
      {% endif %}
      <button type="submit" class="btn">Upload image</button>
    </form>

    <form class="acc__form" method="POST" action="/gears/about-lspu/sections/seal" data-section-form="seal">
      <label class="field">
        <span>Title</span>
        <input type="text" name="title" value="{{ sections.get('seal').title if sections.get('seal') else '' }}" maxlength="150">
      </label>
      <label class="field">
        <span>Description</span>
        <div class="js-body-editor">{{ sections.get('seal').body_html|safe if sections.get('seal') else '' }}</div>
      </label>
      <input type="hidden" name="body_html" class="js-body-payload">
      <button type="submit" class="btn btn--primary">Save description</button>
    </form>
  </details>

</div>

<script src="https://cdn.jsdelivr.net/npm/quill@2.0.0/dist/quill.js"></script>
<script src="/storage/compiled/js/about-lspu-editor.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add templates/gears/about-lspu.html
git commit -m "Add About LSPU editor template"
```

---

## Task 16: Editor JS + CSS (Quill init + form serialisation)

**Files:**
- Create: `resources/js/about-lspu-editor.js`
- Create: `resources/css/about-lspu-editor.css`
- Modify: `webpack.mix.js`

- [ ] **Step 1: Write the JS**

Create `resources/js/about-lspu-editor.js`:

```javascript
// About LSPU editor client.
// - Initialise a Quill editor on every .js-body-editor and .js-sub-editor.
// - On submit, serialise editor HTML into the matching hidden input.
// - For mission/values forms, package subblocks into a single
//   'subsections' JSON payload (server expects this exact shape).

(function () {
  if (typeof Quill === 'undefined') return;

  var TOOLBAR = [
    ['bold', 'italic', 'underline'],
    [{ 'header': 3 }, { 'header': 4 }],
    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
    ['blockquote', 'link', 'clean']
  ];

  function makeEditor(el) {
    var initial = el.innerHTML;
    el.innerHTML = '';
    var quill = new Quill(el, { theme: 'snow', modules: { toolbar: TOOLBAR } });
    if (initial) quill.clipboard.dangerouslyPasteHTML(initial);
    el._quill = quill;
    return quill;
  }

  // Body editors (history intro, history milestones, quality, hymn, seal description)
  document.querySelectorAll('.js-body-editor').forEach(makeEditor);
  // Sub-editors (mission/values sub-blocks)
  document.querySelectorAll('.js-sub-editor').forEach(makeEditor);

  // Single-body forms: serialise editor HTML into 'body_html' hidden input.
  document.querySelectorAll('form[data-milestone-form], form[data-section-form="history"], form[data-section-form="quality"], form[data-section-form="hymn"], form[data-section-form="seal"]').forEach(function (form) {
    form.addEventListener('submit', function () {
      var editor = form.querySelector('.js-body-editor');
      var hidden = form.querySelector('.js-body-payload');
      if (editor && editor._quill && hidden) {
        hidden.value = editor._quill.root.innerHTML;
      }
    });
  });

  // Mission/values forms: bundle subblocks into JSON.
  document.querySelectorAll('form[data-section-form="mission"], form[data-section-form="values"]').forEach(function (form) {
    form.addEventListener('submit', function () {
      var blocks = [];
      form.querySelectorAll('[data-subblocks] .subblock').forEach(function (block) {
        var heading = block.querySelector('.js-sub-heading');
        var editor = block.querySelector('.js-sub-editor');
        blocks.push({
          heading: heading ? heading.value : '',
          body_html: (editor && editor._quill) ? editor._quill.root.innerHTML : ''
        });
      });
      var hidden = form.querySelector('.js-subsections-payload');
      if (hidden) hidden.value = JSON.stringify(blocks);
    });
  });
})();
```

- [ ] **Step 2: Write the CSS**

Create `resources/css/about-lspu-editor.css`:

```css
/* About LSPU editor — solid colors, no gradients. */

* { box-sizing: border-box; }
body.about-editor { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: #f3f4f6; color: #111827; }

.editor-header { display: flex; align-items: center; gap: 16px; padding: 16px 24px; background: #1f2937; color: #fff; }
.editor-header h1 { margin: 0; font-size: 20px; }
.editor-back { color: #fff; text-decoration: none; background: #374151; padding: 6px 14px; border-radius: 999px; }

.editor-shell { max-width: 980px; margin: 0 auto; padding: 24px; display: flex; flex-direction: column; gap: 18px; }

.flash { padding: 10px 16px; border-radius: 8px; }
.flash--success { background: #d1fae5; color: #065f46; }
.flash--error { background: #fee2e2; color: #991b1b; }

.acc { background: #fff; border-radius: 12px; box-shadow: 0 1px 0 rgba(0,0,0,0.05); overflow: hidden; }
.acc__summary { cursor: pointer; padding: 16px 20px; font-weight: 700; font-size: 18px; background: #e5e7eb; }
.acc__form { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }

.field { display: flex; flex-direction: column; gap: 6px; }
.field > span { font-weight: 600; font-size: 14px; color: #374151; }
.field input[type="text"], .field input[type="file"] { padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 8px; font: inherit; }

.row { display: flex; gap: 10px; }
.row--actions { justify-content: flex-end; }
.row > input { flex: 1; }

.btn { background: #e5e7eb; color: #111827; border: none; padding: 8px 14px; border-radius: 8px; cursor: pointer; font: inherit; }
.btn--primary { background: #2563eb; color: #fff; }
.btn--danger  { background: #dc2626; color: #fff; }
.btn--icon { padding: 6px 10px; }

.subblocks { display: flex; flex-direction: column; gap: 14px; }
.subblock { background: #f9fafb; padding: 12px; border-radius: 8px; border-left: 4px solid #2563eb; }

.milestones { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
.milestone { background: #f9fafb; padding: 12px; border-radius: 10px; border-left: 4px solid #059669; display: flex; flex-direction: column; gap: 8px; }
.milestone form { display: flex; flex-direction: column; gap: 8px; }
.reorder-form { display: flex; gap: 6px; flex-direction: row !important; }

.milestone-create { background: #f0fdf4; padding: 14px; border-radius: 10px; margin-top: 12px; }
.milestone-create h4 { margin: 0 0 8px; }

.seal-preview { max-width: 200px; border-radius: 8px; margin-top: 8px; }

/* Quill — keep snow theme defaults. */
.ql-container { min-height: 120px; font-size: 16px; }
```

- [ ] **Step 3: Register both bundles in `webpack.mix.js`**

In `webpack.mix.js`, add to the `.js(...)` chain:

```js
  .js('resources/js/about-lspu-editor.js', 'storage/compiled/js')
```

And to the `.postCss(...)` chain:

```js
  .postCss('resources/css/about-lspu-editor.css', 'storage/compiled/css', [
    //
  ])
```

- [ ] **Step 4: Build assets**

Run: `npm run dev`
Expected: build completes, `storage/compiled/js/about-lspu-editor.js` and `storage/compiled/css/about-lspu-editor.css` exist.

- [ ] **Step 5: Commit**

```bash
git add resources/js/about-lspu-editor.js resources/css/about-lspu-editor.css webpack.mix.js
git commit -m "Add About LSPU editor JS + CSS"
```

---

## Task 17: Full-stack manual verification

**Files:** none

- [ ] **Step 1: Run the full test suite**

Run: `python -m pytest tests/unit/test_about_lspu.py -v`
Expected: ALL tests PASS.

- [ ] **Step 2: Build assets and start the server**

Run: `npm run dev` (if not already done) and `python craft serve`.

- [ ] **Step 3: Verify kiosk page**

Open `http://localhost:8000/kiosk/about-lspu`. Verify:
- All 6 tiles visible with correct colors (no gradients), icons, titles.
- Tap each tile → its detail pane appears (mission/values stacked sub-cards, history timeline, quality centered statement, hymn lyrics, seal image+description).
- "Back to Hub" returns to the tile grid.
- 60 s of inactivity inside a detail returns to hub.
- "Back to Kiosk" pill links to `/kiosk`.

- [ ] **Step 4: Verify editor page**

Log in as an editor, then open `http://localhost:8000/gears/about-lspu` (also reachable via the new card on `/gears/dashboard`). Verify:
- Each accordion expands; Quill toolbar renders.
- Editing and saving each section persists (reload page, confirm content sticks).
- Editing a milestone, adding a milestone, deleting one, reordering — all work.
- Uploading a JPG/PNG/WEBP seal image (≤4 MB) succeeds; uploading a `.txt` is rejected with a flash error.

- [ ] **Step 5: Verify dashboard card**

Open `/gears/dashboard`, confirm the "About LSPU" card is present and links to `/gears/about-lspu`.

- [ ] **Step 6: Verify production safety**

Run: `python -m pytest tests/unit/test_about_lspu.py::AboutContentSanitiseTestCase -v`
Expected: PASS — the sanitiser strips `<script>`, `<iframe>`, and inline event handlers.

- [ ] **Step 7: Commit any final tweaks**

If manual verification surfaces fixes:

```bash
git add <files>
git commit -m "About LSPU: fixes from manual verification"
```

---

## Self-review checklist

- [x] Spec coverage: every section in the spec has at least one task — data model (Tasks 2-5), kiosk UX (Tasks 8-10), editor UX (Tasks 11, 15, 16), routes & controller (Tasks 7, 11-14), error handling (Tasks 6, 12, 14), testing (Tasks 6, 7, 12-14, 17).
- [x] No placeholders ("TBD", "implement later"); every step shows code.
- [x] Type/symbol consistency: `AboutSection`, `AboutMilestone`, `AboutContent.sanitize_html`, `SECTION_SLUGS` used identically across all tasks.
- [x] No gradient styles anywhere — all tile and accent colors are flat solids.
- [x] Bleach allowlist matches spec (p, br, strong, em, u, ul, ol, li, a, h3, h4, blockquote).
- [x] Idle timer scoped to detail panes only, not the hub (Task 10 step 1).
