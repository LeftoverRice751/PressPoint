# Photo posts: editor-positioned elements (addendum)

Addendum to `2026-11-09-photo-posts-design.md`. That design listed "free-form
layout (moving elements around)" as a non-goal; the user has now asked for a
bounded version of it. Everything in the parent design still holds unless this
document says otherwise.

## Intent and why

Editors fill in a fixed card template: logo centred over the photo, then event
title, headline and summary stacked and centred in the cream panel. Real posts
don't always suit that: the logo lands on a face, a short headline would read
better off to one side, a long summary wants the room the headline isn't using.
The editor should be able to place and size those pieces themselves, and the
kiosk must show exactly what they made.

## What the editor can do (user's decisions)

- **Logo**: drag anywhere **over the photo area**; resize with a **corner
  handle**. It cannot leave the photo area.
- **Event title, headline, summary**: each drags **freely, inside the cream
  panel only**; each resizes with a **corner handle** (bigger/smaller).
- **Source footer** (icon lines): **stays fixed at the bottom** of the panel.
  Text pieces move only in the space above it.
- **Edges**: a piece **stops at the edge** while dragged; resizing stops growing
  once the piece would spill out of its area.
- **Overlap**: text pieces **may not overlap** each other.
- **Controls**: position and size only. No alignment control, no reset button.

## Constraints carried from the parent design

- One renderer: `templates/kiosk/_post_card.html` serves kiosk, editor and
  review preview; positions must render identically in all three.
- All lengths are `cqw` (card is a size container), so a layout made in the
  narrow dashboard column renders the same on the 720px kiosk card.
- The layout is rendered content: it joins `ReviewQueue._STAMPED_FIELDS`, so
  changing it on a live post re-enters review like any other field.
- Server-side validation of everything stored; no gradients; no `|safe`.
- The column migration `2026_11_09_000100_add_post_fields_to_news` has not run
  on production yet.

## Builder's calls (mine, flagged for review)

- **Two render modes.** `news.element_layout` NULL = today's stacked flow
  layout, unchanged (existing and never-moved posts look exactly as now). The
  first drag or resize in the editor snapshots every piece's current box from
  the DOM into a complete layout, and from then on the card renders in
  positioned mode. A layout is all-or-nothing; partial layouts are invalid.
- **Fixed panel in positioned mode.** The snapshot records the panel's current
  height, and the positioned card keeps that height, so the photo does not jump
  when an editor starts dragging. (Flow mode keeps the grow-to-fit panel.)
- **Stored shape** (`element_layout` TEXT, JSON, all numbers in `cqw`):
  `{"panel_h": h, "logo": {x,y,s}, "kicker": {x,y,w,h,s}, "headline": {...},
  "body": {...}}`. `x,y` are the top-left of the piece — logo relative to the
  card, text relative to the panel. `w` is the text box width at `s = 1`; `s`
  scales font size and box width together, so line breaks don't change while
  resizing. The logo's `s` scales its default height (11cqw) and max width.
- **Server validation** (`Posts.parse_layout`): every key present and finite,
  within sane ranges (x,y 0–100, w 5–100, h 1–70, s 0.5–2.5, panel_h 25–70) and passing the geometry check below; else
  a 422. The server cannot measure text, so it checks the stored boxes; the
  editor measures them.
- **Formatting parity**: style strings are built by one formatter on each side
  (`Posts.layout_styles` / `post-layout.mjs`), reusing the crop formatter's
  two-decimal rule, with a parity test like the crop one.
- **Moving vs typing**: the text pieces stay `contenteditable`, so dragging the
  text itself would fight caret placement. Each piece gets a small **move grip**
  and a **corner resize handle**, shown on hover/focus. The logo is dragged by
  the image itself (its drag must not pan the photo underneath).
- **Keyboard**: with a grip focused, arrow keys nudge the piece by 1cqw
  (Shift: 5cqw), under the same edge and overlap rules.
- **Overlap rule**: a drop or resize that would overlap another text piece, or
  leave its area, is refused: the piece returns to its last valid box.
- **Text growing after placement**: typing that makes a piece overflow the
  panel or overlap a neighbour marks it with a red outline and disables
  Submit for review until it fits (Save draft still works).
- The **empty kicker** in positioned mode keeps its box in the editor (so it
  can be placed) and is omitted on the kiosk as today.
- **Duplicate** copies `element_layout`.
- **Migration**: add `element_layout TEXT NULL` to the not-yet-run
  `000100` migration (one ship step, not two); hand-edit `schema.sql` to match;
  ALTER the preview database directly.

## Builder check answers (my calls)

- **Geometry.** The card is a 100×100 cqw square. In positioned mode the panel
  is absolutely placed at the bottom with height `panel_h`; the photo fills the
  card above it (keeping today's 5cqw tuck under the panel's rounded top). The
  **photo area** is the rectangle `0..100 × 0..(100 − panel_h)`; the logo's box
  must stay inside it, so the logo can never sit on the panel. The **text
  area** is the panel minus its padding and minus the footer's measured height.
- **Boxes are stored, not just positions.** Each text piece stores
  `{x, y, w, h, s}`: `h` is its measured height at `s = 1`, re-measured and
  saved on every save. Positioned mode renders each piece as a fixed
  `w·s × h·s` box with `overflow: hidden`, so the kiosk can never paint a piece
  outside its box even if a font renders a hair differently. The logo stores
  `{x, y, s}` (its box is 11cqw·s tall; width follows the image, capped at
  34cqw·s).
- **`w` is fixed after the snapshot.** The corner handle only changes `s`.
- **Overlap and edges are judged on those boxes**: during drag/resize/nudge,
  on every text input, and on load.
- **The server checks the geometry too**, not only the ranges: every text box
  inside the panel (`x ≥ 0`, `x + w·s ≤ 100`, `y ≥ 0`, `y + h·s ≤ panel_h`),
  no two text boxes intersecting, the logo inside the photo area by its height.
  A malformed or non-fitting layout is refused with a 422 ("The layout doesn't
  fit — move or shrink a piece"), never silently dropped to flow mode, because
  that would change the post's look behind the editor's back. An empty value
  stores NULL (flow mode).
- **Empty pieces.** In positioned mode all three text pieces are always stored.
  An empty kicker's box is measured with its placeholder showing; the kiosk
  omits an empty kicker (and an empty body) entirely.
- **Snapshot units.** The snapshot measures the editor's DOM and divides by the
  card's pixel width ×100, so every number is cqw whatever column width the
  editor was in.
- **Once positioned, always positioned.** With no reset button (user's call),
  a post stays in positioned mode after its first move. Editing a live post's
  layout re-enters review like any edit.
- **Interaction is editor-only.** Grips, handles and logo dragging exist only
  when `post_editor` is set; kiosk and review preview render plain boxes.

## Non-goals

Alignment controls, reset button, moving the footer, moving or resizing the
panel itself, rotation, layering/z-order, snapping guides, moving text over the
photo.

## Anti-goals

- The kiosk shows a different arrangement than the editor did.
- A text piece rendered outside the panel or on top of another on the kiosk
  because the editor let it through.
- Existing posts changing appearance because this shipped.

## Verification

- Unit: `parse_layout` (valid, partial, non-finite, out-of-range, garbage);
  `layout_styles` parity with the JS formatter; store accepts/clears the field;
  stamp changes when the layout changes; duplicate copies it.
- JS: clamp-to-area, overlap test, nudge, snapshot shape, formatter.
- Browser (preview on :8001): drag/resize each piece, overlap refused, edge
  stop, typing overflow blocks submit, approve, kiosk card matches the editor.
