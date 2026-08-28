# Fonts

Two groups live here, with different rules:

| | Families | Committed? |
|---|---|---|
| **Brand** | Moderniz, Gilroy | **No** — commercial, see Licensing |
| **Newsletter** | Tinos, Playfair Display, Lora, Archivo Black, Bebas Neue, Alfa Slab One, Space Grotesk, Caveat, JetBrains Mono | **Yes** — OFL/Apache, with licence texts in `LICENSES/` |

The newsletter group is what an editor can pick from in the news composer's font
dropdown, and it is committed precisely because it is redistributable — a fresh
clone builds and the kiosk renders correctly with no manual step.

## ⚠ Do not use `resources/newsletter-fonts/`

That folder is an **untracked scratch pile of design assets and is not
licensable for this project.** (It was tracked in git until it was removed from
the index; the files stay on disk because Gilroy is converted from them, but they
are gitignored now so they are never redistributed with a clone.) It is named
after the archive category, not after this feature. Its own embedded metadata
forbids what the kiosk does with a font:

- **Gotham** — *"You may not copy, modify, distribute, or download this
  software… or host it from any location."*
- **Circular Std** — *"excludes… storing on publicly available servers"*; the
  file is also an internal rip (`CircularSpotifyText-Light`).
- **Museo Slab** — copyright string ends `TK-rip`.
- **Nexa Rust Slab** is a `Trial` build; **Wakaba** is a `(Demo Version)`;
  **Christmas Sparkle**, **Black Bubbles** and **Airstrike** are personal-use
  only.

Serving any of them from `/assets/fonts/` is public web redistribution. That is
why the composer's palette was built from open-licensed faces instead. If the
publication later buys proper **webfont** licences, drop those files in here and
add the slug to the four places listed at the top of
`resources/css/newsletter-type.css`.

## Current state

**Gilroy is installed** — all five weights, converted from the `.ttf` originals
in `resources/newsletter-fonts/` with the `fonttools` command shown below.
See Licensing: its webfont grant still needs confirming with the adviser.

**The nine newsletter faces are installed** as latin-subset `.woff2`, pulled from
Google Fonts. Five of them (Playfair, Lora, Space Grotesk, Caveat, JetBrains
Mono) are **variable** fonts: one file covers the whole weight axis and the
`@font-face` declares a range, so there is deliberately no `-bold` file for them.

**Moderniz is still missing.** It is the display face — mastheads, the kiosk
welcome screen, error-page status numbers. Until its file lands here,
`--font-display` falls through to Gilroy, which is deliberate: the fallback stack
is geometric-sans so the page stays coherent rather than dropping to a serif.
Drop `moderniz-regular.woff2` in and it takes over with no code change.

## What to place here

`.woff2` is what browsers will actually load; the `.woff` is a fallback for
anything ancient. Both are optional per weight, but ship at least the `.woff2`.

```
resources/fonts/
├── Moderniz/
│   ├── moderniz-regular.woff2      display face, weight 400 (ships one weight)
│   └── moderniz-regular.woff
└── Gilroy/
    ├── gilroy-regular.woff2        body, weight 400
    ├── gilroy-regular.woff
    ├── gilroy-medium.woff2         weight 500
    ├── gilroy-semibold.woff2       weight 600
    ├── gilroy-bold.woff2           weight 700
    └── gilroy-black.woff2          headings, weight 900  ← "Gilroy Black"
```

Filenames are a contract: they're matched verbatim by the `@font-face` `src:`
urls at the bottom of `resources/css/kiosk-tokens.css`. Rename a file and it 404s.

If you were given `.otf`/`.ttf` instead, convert them — `.woff2` is roughly half
the size, which matters on a kiosk that cold-loads over campus wifi:

```bash
venv/bin/pip install fonttools brotli
venv/bin/python - <<'EOF'
from fontTools.ttLib import TTFont
f = TTFont("resources/newsletter-fonts/Gilroy-Black.ttf")
f.flavor = "woff2"; f.save("resources/fonts/Gilroy/gilroy-black.woff2")
f.flavor = "woff";  f.save("resources/fonts/Gilroy/gilroy-black.woff")
EOF
```

That is exactly how the current Gilroy set was produced — 79 KB `.ttf` each down
to ~25 KB `.woff2`, which matters on a kiosk cold-loading over campus wifi.

## How they get served

`webpack.mix.js` copies this whole directory to `storage/compiled/fonts/`, which
`config/filesystem.py` maps to the `/assets/` URL space and which nginx serves
directly (`deploy/nginx-presspoint.conf`, `location /assets/`). So
`resources/fonts/Gilroy/gilroy-black.woff2` ends up at
`/assets/fonts/Gilroy/gilroy-black.woff2`.

After adding files:

```bash
export PATH="$HOME/.nvm/versions/node/v18.20.8/bin:$PATH"   # Node 18 required
npm run prod
ls storage/compiled/fonts/Gilroy/                           # should be populated
```

The build prints a warning when this directory holds no font binaries, so a
silent fallback can't happen again.

## Licensing

**Newsletter faces — settled.** All nine are SIL OFL 1.1 or Apache-2.0. Their
licence texts are in `LICENSES/` and ship to `/assets/fonts/LICENSES/` with the
binaries, which is what the OFL requires when you redistribute. Adding a face
here means adding its licence text too.

**Brand faces — open question.** Moderniz and Gilroy are commercial. Gilroy's
own metadata reads `Copyright © 2015/2016 Radomir Tinkov. All rights reserved.`
with **no webfont grant visible in the file**, and it is currently being served
from `/assets/fonts/Gilroy/`, which is world-readable in production. Either:

1. confirm the publication holds a **webfont** (not desktop) licence and keep it
   as-is — desktop licences usually do not cover serving over HTTP; or
2. restrict `/assets/fonts/Gilroy/` to same-origin requests in
   `deploy/nginx-presspoint.conf`; or
3. swap `--font-heading` / `--font-body` in `kiosk-tokens.css` to an open
   geometric sans — Space Grotesk is already installed here.

Flagged for the adviser rather than decided unilaterally. Keep the licence
documents with the publication's records, and don't commit the commercial
binaries even to a private fork.
