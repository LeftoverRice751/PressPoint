/*!
 * Campus 2.5D — self-contained Leaflet layer (plugin + footprint data)
 * Requires only Leaflet 1.x. One file, no fetch, no build step.
 *
 *   <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
 *   <script src="campus-2.5d.layer.js"></script>
 *   <script>
 *     const map = L.map('map', { crs: L.CRS.Simple, minZoom: -3, maxZoom: 3, zoomSnap: 0.25 });
 *     const layer = L.campus25d().addTo(map);        // or L.campus25d({ cameraDistance: 2.4 })
 *     map.fitBounds(layer.getBounds(), { padding: [48, 48] });
 *   </script>
 *
 * L.twoPointFiveD(anyGeoJSON, opts) is also exported, for your own data.
 * L.CAMPUS_25D_DATA holds the GeoJSON (pixel CRS: lng = x, lat = -y).
 */
(function (factory) {
  if (typeof define === 'function' && define.amd) define(['leaflet'], factory);
  else if (typeof module === 'object' && module.exports) module.exports = factory(require('leaflet'));
  else factory(window.L);
})(function (L) {
  'use strict';

  'use strict';

  function hexToRgb(hex) {
    hex = String(hex || '#cccccc').replace('#', '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function shade(hex, amt) {
    const c = hexToRgb(hex).map(v => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt))));
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  }

  function cssVar(name, fallback) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }

  const TwoPointFiveD = L.Layer.extend({
    options: {
      heightProperty: 'height',
      colorProperty: 'color',
      idProperty: 'id',
      kindProperty: 'kind',
      flatKinds: ['ground', 'path', 'gate', 'open'],
      cameraDistance: 1.7,     // multiples of viewport height (radial parallax)
      verticalLift: 0.62,      // share of height drawn as straight-up rise
      heightScale: 1,          // multiplier on the height property
      wallLight: -0.12,        // shading of lit walls
      wallDark: -0.34,         // shading of shaded walls
      outline: 'rgba(22,19,16,0.28)',
      roofHighlight: cssVar('--accent', '#FF4D00'),
      shadow: true,
      shadowAngle: 0.6,        // radians, direction of the ground shadow
      shadowLength: 0.35,      // relative to height
      minZoomExtrude: -Infinity,
      labelProperty: 'label',
      labelFont: '600 11px ' + cssVar('--font-body', 'ui-sans-serif, system-ui, sans-serif'),
      labelColor: cssVar('--fg', '#161310'),
      minLabelArea: 900, // only applies to labels longer than 2 characters
      interactive: true,
      pane: 'overlayPane'
    },

    initialize: function (geojson, options) {
      L.setOptions(this, options);
      this._features = [];
      if (geojson) this.setData(geojson);
    },

    setData: function (geojson) {
      const feats = geojson.type === 'FeatureCollection' ? geojson.features : [geojson];
      this._features = [];
      feats.forEach(f => {
        const g = f.geometry; if (!g) return;
        const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : null;
        if (!polys) return;
        polys.forEach(rings => {
          this._features.push({
            props: f.properties || {},
            rings: rings.map(r => r.map(c => L.latLng(c[1], c[0])))
          });
        });
      });
      if (this._map) this._render();
      return this;
    },

    onAdd: function (map) {
      this._map = map;
      const c = this._canvas = L.DomUtil.create('canvas', 'leaflet-2-5d-layer leaflet-zoom-animated');
      c.style.pointerEvents = 'none';
      this._ctx = c.getContext('2d');
      map.getPane(this.options.pane).appendChild(c);

      map.on('move zoom viewreset resize zoomend moveend', this._render, this);
      if (map.options.zoomAnimation && L.Browser.any3d) map.on('zoomanim', this._animateZoom, this);
      if (this.options.interactive) {
        map.on('mousemove', this._onMove, this);
        map.on('click', this._onClick, this);
        map.on('mouseout', this._onOut, this);
      }
      this._render();
    },

    onRemove: function (map) {
      L.DomUtil.remove(this._canvas);
      map.off('move zoom viewreset resize zoomend moveend', this._render, this);
      map.off('zoomanim', this._animateZoom, this);
      map.off('mousemove', this._onMove, this).off('click', this._onClick, this).off('mouseout', this._onOut, this);
      this._map = null;
    },

    _animateZoom: function (e) {
      const scale = this._map.getZoomScale(e.zoom, this._map.getZoom());
      const off = this._map._latLngBoundsToNewLayerBounds(this._map.getBounds(), e.zoom, e.center).min;
      L.DomUtil.setTransform(this._canvas, off, scale);
    },

    // ---- projection ------------------------------------------------------
    _unitPx: function () {
      const m = this._map, c = m.getCenter();
      const a = m.latLngToContainerPoint(c);
      const b = m.latLngToContainerPoint(L.latLng(c.lat, c.lng + 1));
      return Math.abs(b.x - a.x) || 1;
    },

    _render: function () {
      if (!this._map) return;
      const map = this._map, size = map.getSize(), dpr = window.devicePixelRatio || 1;
      const c = this._canvas, ctx = this._ctx;

      if (c.width !== Math.round(size.x * dpr) || c.height !== Math.round(size.y * dpr)) {
        c.width = Math.round(size.x * dpr); c.height = Math.round(size.y * dpr);
        c.style.width = size.x + 'px'; c.style.height = size.y + 'px';
      }
      L.DomUtil.setTransform(c, map.containerPointToLayerPoint([0, 0]), 1);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.x, size.y);

      const unit = this._unitPx();
      const pivot = L.point(size.x / 2, size.y / 2);
      const camZ = this.options.cameraDistance * size.y;
      const extrude = map.getZoom() >= this.options.minZoomExtrude;

      // project + bucket
      const drawables = [];
      for (const f of this._features) {
        const kind = f.props[this.options.kindProperty];
        const flat = !extrude || this.options.flatKinds.indexOf(kind) !== -1;
        const h = flat ? 0 : (Number(f.props[this.options.heightProperty]) || 0) * this.options.heightScale * unit;
        const rings = f.rings.map(r => r.map(ll => map.latLngToContainerPoint(ll)));
        // cheap cull
        const b = ringBounds(rings[0]);
        if (b.maxX < -400 || b.minX > size.x + 400 || b.maxY < -400 || b.minY > size.y + 400) continue;
        const k = camZ / Math.max(1, camZ - h);
        const lift = h * this.options.verticalLift;
        const roof = rings.map(r => r.map(p => L.point(pivot.x + (p.x - pivot.x) * k, pivot.y + (p.y - pivot.y) * k - lift)));
        const ground = f.props[this.options.kindProperty] === 'ground';
        drawables.push({ f, base: rings, roof, h, flat, ground, cy: centroidY(rings[0]) });
      }
      // ground first, then other flat features, then extruded bodies back-to-front
      const rank = d => d.ground ? 0 : d.flat ? 1 : 2;
      drawables.sort((a, b) => (rank(a) - rank(b)) || (a.cy - b.cy));

      this._hit = [];
      for (const d of drawables) this._drawOne(ctx, d, unit);

      if (this._hover) this._strokeRoof(ctx, this._hover, this.options.roofHighlight);
    },

    _label: function (ctx, d) {
      const o = this.options;
      if (!o.labelProperty) return;
      const txt = d.f.props[o.labelProperty];
      if (!txt || d.f.props[o.kindProperty] === 'ground') return;
      const bb = ringBounds(d.roof[0]);
      ctx.font = o.labelFont;
      const s = String(txt);
      // short labels only need to fit; long ones also need a minimum footprint
      const w = ctx.measureText(s).width;
      if (bb.maxX - bb.minX < w + 6 || bb.maxY - bb.minY < 12) return;
      if (s.length > 2 && (bb.maxX - bb.minX) * (bb.maxY - bb.minY) <= o.minLabelArea) return;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = o.labelColor;
      ctx.fillText(String(txt), (bb.minX + bb.maxX) / 2, (bb.minY + bb.maxY) / 2);
    },

    _drawOne: function (ctx, d, unit) {
      const o = this.options, color = d.f.props[o.colorProperty] || '#cccccc';

      if (d.flat) {
        ctx.beginPath(); tracePath(ctx, d.base);
        ctx.fillStyle = color; ctx.fill('evenodd');
        if (d.f.props[o.kindProperty] === 'ground') { ctx.strokeStyle = 'rgba(22,19,16,0.55)'; ctx.lineWidth = 1.5; ctx.stroke(); }
        this._label(ctx, d);
        this._hit.push(d);
        return;
      }

      // ground shadow
      if (o.shadow) {
        const dx = Math.cos(o.shadowAngle) * d.h * o.shadowLength, dy = Math.sin(o.shadowAngle) * d.h * o.shadowLength;
        ctx.save(); ctx.translate(dx, dy);
        ctx.beginPath(); tracePath(ctx, d.base);
        ctx.fillStyle = 'rgba(22,19,16,0.10)'; ctx.fill('evenodd');
        ctx.restore();
      }

      // walls — only outward-facing edges, painter-sorted by depth
      const walls = [];
      for (let ri = 0; ri < d.base.length; ri++) {
        const b = d.base[ri], r = d.roof[ri];
        for (let i = 0; i < b.length - 1; i++) {
          const p1 = b[i], p2 = b[i + 1], q1 = r[i], q2 = r[i + 1];
          // cull faces whose quad winds the wrong way (facing away from viewer)
          const area = (p2.x - p1.x) * (q1.y - p1.y) - (q1.x - p1.x) * (p2.y - p1.y);
          if (area <= 0) continue;
          const nx = p2.y - p1.y, ny = -(p2.x - p1.x), len = Math.hypot(nx, ny) || 1;
          const lit = (nx / len) * 0.45 + (ny / len) * -0.89; // light from top-left-ish
          walls.push({ p1, p2, q1, q2, shade: lit, depth: Math.min(p1.y, p2.y) });
        }
      }
      walls.sort((a, b) => a.depth - b.depth);
      for (const w of walls) {
        ctx.beginPath();
        ctx.moveTo(w.p1.x, w.p1.y); ctx.lineTo(w.p2.x, w.p2.y); ctx.lineTo(w.q2.x, w.q2.y); ctx.lineTo(w.q1.x, w.q1.y); ctx.closePath();
        const t = o.wallDark + (o.wallLight - o.wallDark) * (0.5 + 0.5 * w.shade);
        ctx.fillStyle = shade(color, t); ctx.fill();
        ctx.strokeStyle = 'rgba(22,19,16,0.10)'; ctx.lineWidth = 0.6; ctx.stroke();
      }

      // roof
      ctx.beginPath(); tracePath(ctx, d.roof);
      ctx.fillStyle = shade(color, 0.06); ctx.fill('evenodd');
      ctx.strokeStyle = o.outline; ctx.lineWidth = 1; ctx.stroke();

      this._label(ctx, d);
      this._hit.push(d);
    },

    _strokeRoof: function (ctx, d, color) {
      ctx.beginPath(); tracePath(ctx, d.roof);
      ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke();
    },

    _pick: function (e) {
      const p = e.containerPoint, ctx = this._ctx;
      for (let i = this._hit.length - 1; i >= 0; i--) {
        const d = this._hit[i];
        ctx.beginPath(); tracePath(ctx, d.roof);
        if (ctx.isPointInPath(p.x, p.y, 'evenodd')) return d;
      }
      return null;
    },

    _onMove: function (e) {
      const d = this._pick(e), map = this._map;
      if (d === this._hover) return;
      this._hover = d;
      map.getContainer().style.cursor = d && d.f.props[this.options.kindProperty] === 'building' ? 'pointer' : '';
      this.fire('featurehover', { feature: d && d.f.props });
      if (this.options.onFeatureHover) this.options.onFeatureHover(d && d.f.props, e);
      this._render();
    },

    _onOut: function () { if (this._hover) { this._hover = null; this._render(); } },

    _onClick: function (e) {
      const d = this._pick(e);
      if (!d) return;
      this.fire('featureclick', { feature: d.f.props, latlng: e.latlng });
      if (this.options.onFeatureClick) this.options.onFeatureClick(d.f.props, e);
    },

    /** Centre + zoom the map on the data extent. */
    getBounds: function () {
      const b = new L.LatLngBounds();
      this._features.forEach(f => f.rings[0].forEach(ll => b.extend(ll)));
      return b;
    },

    setCameraDistance: function (v) { this.options.cameraDistance = v; this._render(); return this; },
    setHeightScale: function (v) { this.options.heightScale = v; this._render(); return this; }
  });

  function tracePath(ctx, rings) {
    for (const r of rings) {
      ctx.moveTo(r[0].x, r[0].y);
      for (let i = 1; i < r.length; i++) ctx.lineTo(r[i].x, r[i].y);
      ctx.closePath();
    }
  }
  function ringBounds(r) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of r) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
    return { minX, minY, maxX, maxY };
  }
  function centroidY(r) { let s = 0; for (const p of r) s += p.y; return s / r.length; }


  const CAMPUS = {
 "type": "FeatureCollection",
 "properties": {
  "name": "Campus 2.5D",
  "crs": "pixel",
  "bounds": [
   [
    -1080,
    20
   ],
   [
    0,
    1180
   ]
  ]
 },
 "features": [
  {
   "type": "Feature",
   "properties": {
    "id": "21",
    "name": "Block 21",
    "color": "#5B9BD5",
    "height": 18,
    "kind": "building",
    "label": "21"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       162,
       -36
      ],
      [
       360,
       -36
      ],
      [
       360,
       -84
      ],
      [
       162,
       -84
      ],
      [
       162,
       -36
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "H",
    "name": "Gate H",
    "color": "#5B9BD5",
    "height": 10,
    "kind": "building",
    "label": "H"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       100,
       -42
      ],
      [
       160,
       -42
      ],
      [
       160,
       -84
      ],
      [
       100,
       -84
      ],
      [
       100,
       -42
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "19",
    "name": "Block 19",
    "color": "#D71920",
    "height": 22,
    "kind": "building",
    "label": "19"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       98,
       -88
      ],
      [
       142,
       -88
      ],
      [
       142,
       -160
      ],
      [
       98,
       -160
      ],
      [
       98,
       -88
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "19b",
    "name": "Block 19 annex",
    "color": "#D71920",
    "height": 14,
    "kind": "building",
    "label": "19b"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       142,
       -140
      ],
      [
       182,
       -140
      ],
      [
       182,
       -168
      ],
      [
       142,
       -168
      ],
      [
       142,
       -140
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "20",
    "name": "Block 20",
    "color": "#5B9BD5",
    "height": 14,
    "kind": "building",
    "label": "20"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       265,
       -145
      ],
      [
       341,
       -145
      ],
      [
       341,
       -185
      ],
      [
       265,
       -185
      ],
      [
       265,
       -145
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "18",
    "name": "Block 18",
    "color": "#D71920",
    "height": 16,
    "kind": "building",
    "label": "18"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       95,
       -215
      ],
      [
       341,
       -215
      ],
      [
       341,
       -255
      ],
      [
       95,
       -255
      ],
      [
       95,
       -215
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "17",
    "name": "Block 17",
    "color": "#D71920",
    "height": 12,
    "kind": "building",
    "label": "17"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       95,
       -258
      ],
      [
       129,
       -258
      ],
      [
       129,
       -296
      ],
      [
       95,
       -296
      ],
      [
       95,
       -258
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "16",
    "name": "Block 16",
    "color": "#F5E17A",
    "height": 14,
    "kind": "building",
    "label": "16"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       100,
       -310
      ],
      [
       286,
       -310
      ],
      [
       286,
       -346
      ],
      [
       100,
       -346
      ],
      [
       100,
       -310
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "15",
    "name": "Block 15",
    "color": "#F17C7C",
    "height": 16,
    "kind": "building",
    "label": "15"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       110,
       -385
      ],
      [
       340,
       -385
      ],
      [
       340,
       -427
      ],
      [
       110,
       -427
      ],
      [
       110,
       -385
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "23",
    "name": "Block 23",
    "color": "#5B9BD5",
    "height": 16,
    "kind": "building",
    "label": "23"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       405,
       -272
      ],
      [
       505,
       -272
      ],
      [
       505,
       -326
      ],
      [
       405,
       -326
      ],
      [
       405,
       -272
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "14",
    "name": "Block 14",
    "color": "#F17C7C",
    "height": 16,
    "kind": "building",
    "label": "14"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       370,
       -350
      ],
      [
       608,
       -350
      ],
      [
       608,
       -396
      ],
      [
       370,
       -396
      ],
      [
       370,
       -350
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "12",
    "name": "Block 12",
    "color": "#F5761A",
    "height": 12,
    "kind": "building",
    "label": "12"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       378,
       -410
      ],
      [
       432,
       -410
      ],
      [
       432,
       -448
      ],
      [
       378,
       -448
      ],
      [
       378,
       -410
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "G",
    "name": "Gate G",
    "color": "#5B9BD5",
    "height": 10,
    "kind": "building",
    "label": "G"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       355,
       -448
      ],
      [
       401,
       -448
      ],
      [
       401,
       -486
      ],
      [
       355,
       -486
      ],
      [
       355,
       -448
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "13",
    "name": "Block 13",
    "color": "#F5E17A",
    "height": 14,
    "kind": "building",
    "label": "13"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       420,
       -432
      ],
      [
       576,
       -432
      ],
      [
       576,
       -470
      ],
      [
       420,
       -470
      ],
      [
       420,
       -432
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "11",
    "name": "Block 11",
    "color": "#5B9BD5",
    "height": 18,
    "kind": "building",
    "label": "11"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       425,
       -500
      ],
      [
       569,
       -500
      ],
      [
       569,
       -558
      ],
      [
       425,
       -558
      ],
      [
       425,
       -500
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "25",
    "name": "Block 25",
    "color": "#7DD87D",
    "height": 18,
    "kind": "building",
    "label": "25"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       640,
       -225
      ],
      [
       830,
       -225
      ],
      [
       830,
       -285
      ],
      [
       640,
       -285
      ],
      [
       640,
       -225
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "24",
    "name": "Block 24",
    "color": "#7DD87D",
    "height": 12,
    "kind": "building",
    "label": "24"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       640,
       -255
      ],
      [
       676,
       -255
      ],
      [
       676,
       -291
      ],
      [
       640,
       -291
      ],
      [
       640,
       -255
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "33",
    "name": "Block 33",
    "color": "#F5761A",
    "height": 20,
    "kind": "building",
    "label": "33"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       843,
       -195
      ],
      [
       1035,
       -195
      ],
      [
       1035,
       -237
      ],
      [
       843,
       -237
      ],
      [
       843,
       -195
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "32",
    "name": "Block 32",
    "color": "#F5761A",
    "height": 20,
    "kind": "building",
    "label": "32"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       843,
       -237
      ],
      [
       1061,
       -237
      ],
      [
       1061,
       -277
      ],
      [
       843,
       -277
      ],
      [
       843,
       -237
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "34",
    "name": "Block 34",
    "color": "#F5761A",
    "height": 22,
    "kind": "building",
    "label": "34"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       1078,
       -200
      ],
      [
       1120,
       -200
      ],
      [
       1120,
       -276
      ],
      [
       1078,
       -276
      ],
      [
       1078,
       -200
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "38",
    "name": "Block 38",
    "color": "#D71920",
    "height": 14,
    "kind": "building",
    "label": "38"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       1100,
       -300
      ],
      [
       1128,
       -300
      ],
      [
       1128,
       -350
      ],
      [
       1100,
       -350
      ],
      [
       1100,
       -300
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "26",
    "name": "Block 26",
    "color": "#F5E17A",
    "height": 14,
    "kind": "building",
    "label": "26"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       700,
       -330
      ],
      [
       768,
       -330
      ],
      [
       768,
       -362
      ],
      [
       700,
       -362
      ],
      [
       700,
       -330
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "27",
    "name": "Block 27",
    "color": "#F5E17A",
    "height": 14,
    "kind": "building",
    "label": "27"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       770,
       -330
      ],
      [
       826,
       -330
      ],
      [
       826,
       -362
      ],
      [
       770,
       -362
      ],
      [
       770,
       -330
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "31",
    "name": "Block 31",
    "color": "#F5761A",
    "height": 22,
    "kind": "building",
    "label": "31"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       845,
       -340
      ],
      [
       1059,
       -340
      ],
      [
       1059,
       -390
      ],
      [
       845,
       -390
      ],
      [
       845,
       -340
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "29",
    "name": "Block 29",
    "color": "#F5761A",
    "height": 16,
    "kind": "building",
    "label": "29"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       855,
       -405
      ],
      [
       951,
       -405
      ],
      [
       951,
       -451
      ],
      [
       855,
       -451
      ],
      [
       855,
       -405
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "30",
    "name": "Block 30",
    "color": "#F5761A",
    "height": 16,
    "kind": "building",
    "label": "30"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       958,
       -405
      ],
      [
       1052,
       -405
      ],
      [
       1052,
       -451
      ],
      [
       958,
       -451
      ],
      [
       958,
       -405
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "36",
    "name": "Block 36",
    "color": "#FF33FF",
    "height": 14,
    "kind": "building",
    "label": "36"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       1058,
       -410
      ],
      [
       1090,
       -410
      ],
      [
       1090,
       -490
      ],
      [
       1058,
       -490
      ],
      [
       1058,
       -410
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "35",
    "name": "Block 35",
    "color": "#6E6E6E",
    "height": 24,
    "kind": "building",
    "label": "35"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       1095,
       -398
      ],
      [
       1145,
       -398
      ],
      [
       1145,
       -506
      ],
      [
       1095,
       -506
      ],
      [
       1095,
       -398
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "37",
    "name": "Block 37",
    "color": "#F5761A",
    "height": 12,
    "kind": "building",
    "label": "37"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       1085,
       -535
      ],
      [
       1121,
       -535
      ],
      [
       1121,
       -575
      ],
      [
       1085,
       -575
      ],
      [
       1085,
       -535
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "E",
    "name": "Gate E",
    "color": "#6E6E6E",
    "height": 10,
    "kind": "building",
    "label": "E"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       350,
       -600
      ],
      [
       410,
       -600
      ],
      [
       410,
       -656
      ],
      [
       350,
       -656
      ],
      [
       350,
       -600
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "F",
    "name": "Gate F",
    "color": "#6E6E6E",
    "height": 10,
    "kind": "building",
    "label": "F"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       462,
       -570
      ],
      [
       486,
       -570
      ],
      [
       486,
       -602
      ],
      [
       462,
       -602
      ],
      [
       462,
       -570
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "D",
    "name": "Gate D",
    "color": "#6E6E6E",
    "height": 10,
    "kind": "building",
    "label": "D"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       572,
       -605
      ],
      [
       598,
       -605
      ],
      [
       598,
       -635
      ],
      [
       572,
       -635
      ],
      [
       572,
       -605
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "10",
    "name": "Block 10",
    "color": "#F5761A",
    "height": 12,
    "kind": "building",
    "label": "10"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       604,
       -600
      ],
      [
       650,
       -600
      ],
      [
       650,
       -632
      ],
      [
       604,
       -632
      ],
      [
       604,
       -600
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "8",
    "name": "Block 8",
    "color": "#E019E0",
    "height": 24,
    "kind": "building",
    "label": "8"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       608,
       -645
      ],
      [
       652,
       -645
      ],
      [
       652,
       -845
      ],
      [
       608,
       -845
      ],
      [
       608,
       -645
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "3",
    "name": "Block 3",
    "color": "#F5E17A",
    "height": 12,
    "kind": "building",
    "label": "3"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       575,
       -865
      ],
      [
       613,
       -865
      ],
      [
       613,
       -901
      ],
      [
       575,
       -901
      ],
      [
       575,
       -865
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "2",
    "name": "Block 2",
    "color": "#F5E17A",
    "height": 16,
    "kind": "building",
    "label": "2"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       565,
       -905
      ],
      [
       613,
       -905
      ],
      [
       613,
       -1051
      ],
      [
       565,
       -1051
      ],
      [
       565,
       -905
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "1",
    "name": "Block 1",
    "color": "#D71920",
    "height": 14,
    "kind": "building",
    "label": "1"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       605,
       -955
      ],
      [
       641,
       -955
      ],
      [
       641,
       -1041
      ],
      [
       605,
       -1041
      ],
      [
       605,
       -955
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "7",
    "name": "Block 7",
    "color": "#F17C7C",
    "height": 18,
    "kind": "building",
    "label": "7"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       688,
       -845
      ],
      [
       732,
       -845
      ],
      [
       732,
       -985
      ],
      [
       688,
       -985
      ],
      [
       688,
       -845
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "7b",
    "name": "Block 7 wing",
    "color": "#F17C7C",
    "height": 14,
    "kind": "building",
    "label": "7b"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       732,
       -900
      ],
      [
       754,
       -900
      ],
      [
       754,
       -934
      ],
      [
       732,
       -934
      ],
      [
       732,
       -900
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "4",
    "name": "Block 4",
    "color": "#F5E17A",
    "height": 12,
    "kind": "building",
    "label": "4"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       692,
       -1014
      ],
      [
       768,
       -1014
      ],
      [
       768,
       -1052
      ],
      [
       692,
       -1052
      ],
      [
       692,
       -1014
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "5",
    "name": "Block 5",
    "color": "#17A673",
    "height": 12,
    "kind": "building",
    "label": "5"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       768,
       -1014
      ],
      [
       806,
       -1014
      ],
      [
       806,
       -1052
      ],
      [
       768,
       -1052
      ],
      [
       768,
       -1014
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "6",
    "name": "Block 6",
    "color": "#17A673",
    "height": 16,
    "kind": "building",
    "label": "6"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       806,
       -988
      ],
      [
       890,
       -988
      ],
      [
       890,
       -1052
      ],
      [
       806,
       -1052
      ],
      [
       806,
       -988
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "22",
    "name": "Block 22",
    "color": "#5B9BD5",
    "height": 26,
    "kind": "building",
    "label": "22"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       368,
       -190
      ],
      [
       460,
       -190
      ],
      [
       460,
       -178
      ],
      [
       520,
       -178
      ],
      [
       520,
       -190
      ],
      [
       620,
       -190
      ],
      [
       620,
       -265
      ],
      [
       505,
       -265
      ],
      [
       505,
       -325
      ],
      [
       368,
       -325
      ],
      [
       368,
       -190
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "28",
    "name": "Block 28",
    "color": "#F5E17A",
    "height": 22,
    "kind": "building",
    "label": "28"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       682,
       -392
      ],
      [
       712,
       -392
      ],
      [
       712,
       -360
      ],
      [
       800,
       -360
      ],
      [
       800,
       -392
      ],
      [
       838,
       -392
      ],
      [
       838,
       -470
      ],
      [
       820,
       -470
      ],
      [
       820,
       -510
      ],
      [
       790,
       -510
      ],
      [
       790,
       -548
      ],
      [
       700,
       -548
      ],
      [
       700,
       -500
      ],
      [
       682,
       -500
      ],
      [
       682,
       -392
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "9",
    "name": "Block 9",
    "color": "#E019E0",
    "height": 26,
    "kind": "building",
    "label": "9"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       430,
       -615
      ],
      [
       500,
       -615
      ],
      [
       500,
       -632
      ],
      [
       600,
       -632
      ],
      [
       600,
       -850
      ],
      [
       540,
       -850
      ],
      [
       540,
       -800
      ],
      [
       480,
       -800
      ],
      [
       480,
       -850
      ],
      [
       410,
       -850
      ],
      [
       410,
       -690
      ],
      [
       430,
       -690
      ],
      [
       430,
       -615
      ]
     ],
     [
      [
       470,
       -668
      ],
      [
       470,
       -782
      ],
      [
       570,
       -782
      ],
      [
       570,
       -668
      ],
      [
       470,
       -668
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "A",
    "name": "Court A",
    "color": "#FFFFFF",
    "height": 6,
    "kind": "open",
    "label": "A"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       1058,
       -678
      ],
      [
       1122,
       -678
      ],
      [
       1122,
       -856
      ],
      [
       1058,
       -856
      ],
      [
       1058,
       -678
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "B",
    "name": "Court B",
    "color": "#FFFFFF",
    "height": 6,
    "kind": "open",
    "label": "B"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       682,
       -690
      ],
      [
       762,
       -690
      ],
      [
       762,
       -816
      ],
      [
       682,
       -816
      ],
      [
       682,
       -690
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "C1",
    "name": "Court C",
    "color": "#FFFFFF",
    "height": 6,
    "kind": "open",
    "label": "C"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       705,
       -604
      ],
      [
       749,
       -604
      ],
      [
       749,
       -682
      ],
      [
       705,
       -682
      ],
      [
       705,
       -604
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "C2",
    "name": "Court C",
    "color": "#FFFFFF",
    "height": 6,
    "kind": "open",
    "label": "C"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       752,
       -604
      ],
      [
       806,
       -604
      ],
      [
       806,
       -682
      ],
      [
       752,
       -682
      ],
      [
       752,
       -604
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "I",
    "name": "Courtyard I",
    "color": "#FFFFFF",
    "height": 6,
    "kind": "open",
    "label": "I"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       512,
       -268
      ],
      [
       612,
       -268
      ],
      [
       612,
       -322
      ],
      [
       512,
       -322
      ],
      [
       512,
       -268
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "site",
    "name": "Campus boundary",
    "color": "#EFEAE0",
    "height": 0,
    "kind": "ground"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       95,
       -30
      ],
      [
       355,
       -30
      ],
      [
       355,
       -158
      ],
      [
       398,
       -158
      ],
      [
       398,
       -180
      ],
      [
       1130,
       -180
      ],
      [
       1168,
       -215
      ],
      [
       1168,
       -930
      ],
      [
       1140,
       -1000
      ],
      [
       1140,
       -1062
      ],
      [
       552,
       -1062
      ],
      [
       552,
       -880
      ],
      [
       386,
       -880
      ],
      [
       386,
       -604
      ],
      [
       38,
       -604
      ],
      [
       38,
       -150
      ],
      [
       95,
       -30
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "p1",
    "name": "Path",
    "color": "#DEDEDE",
    "height": 1,
    "kind": "path"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       348,
       -36
      ],
      [
       370,
       -36
      ],
      [
       370,
       -596
      ],
      [
       348,
       -596
      ],
      [
       348,
       -36
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "p2",
    "name": "Path",
    "color": "#DEDEDE",
    "height": 1,
    "kind": "path"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       348,
       -320
      ],
      [
       618,
       -320
      ],
      [
       618,
       -340
      ],
      [
       348,
       -340
      ],
      [
       348,
       -320
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "p3",
    "name": "Path",
    "color": "#DEDEDE",
    "height": 1,
    "kind": "path"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       600,
       -300
      ],
      [
       1130,
       -300
      ],
      [
       1130,
       -320
      ],
      [
       600,
       -320
      ],
      [
       600,
       -300
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "p4",
    "name": "Path",
    "color": "#DEDEDE",
    "height": 1,
    "kind": "path"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       618,
       -320
      ],
      [
       644,
       -320
      ],
      [
       644,
       -1065
      ],
      [
       618,
       -1065
      ],
      [
       618,
       -320
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "p5",
    "name": "Path",
    "color": "#DEDEDE",
    "height": 1,
    "kind": "path"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       600,
       -240
      ],
      [
       620,
       -240
      ],
      [
       620,
       -330
      ],
      [
       600,
       -330
      ],
      [
       600,
       -240
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "p6",
    "name": "Path",
    "color": "#DEDEDE",
    "height": 1,
    "kind": "path"
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       348,
       -560
      ],
      [
       648,
       -560
      ],
      [
       648,
       -580
      ],
      [
       348,
       -580
      ],
      [
       348,
       -560
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "g1",
    "name": "Gate",
    "color": "#1E7A1E",
    "height": 3,
    "kind": "gate",
    "label": ""
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       334,
       -215
      ],
      [
       348,
       -215
      ],
      [
       348,
       -430
      ],
      [
       334,
       -430
      ],
      [
       334,
       -215
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "g2",
    "name": "Gate",
    "color": "#1E7A1E",
    "height": 3,
    "kind": "gate",
    "label": ""
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       330,
       -588
      ],
      [
       446,
       -588
      ],
      [
       446,
       -602
      ],
      [
       330,
       -602
      ],
      [
       330,
       -588
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "g3",
    "name": "Gate",
    "color": "#1E7A1E",
    "height": 3,
    "kind": "gate",
    "label": ""
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       836,
       -288
      ],
      [
       1098,
       -288
      ],
      [
       1098,
       -300
      ],
      [
       836,
       -300
      ],
      [
       836,
       -288
      ]
     ]
    ]
   }
  },
  {
   "type": "Feature",
   "properties": {
    "id": "g4",
    "name": "Gate",
    "color": "#1E7A1E",
    "height": 3,
    "kind": "gate",
    "label": ""
   },
   "geometry": {
    "type": "Polygon",
    "coordinates": [
     [
      [
       620,
       -860
      ],
      [
       634,
       -860
      ],
      [
       634,
       -980
      ],
      [
       620,
       -980
      ],
      [
       620,
       -860
      ]
     ]
    ]
   }
  }
 ]
};

  L.CAMPUS_25D_DATA = CAMPUS;
  L.campus25d = function (options) { return new TwoPointFiveD(CAMPUS, options); };
  L.TwoPointFiveD = TwoPointFiveD;
  L.twoPointFiveD = function (geojson, options) { return new TwoPointFiveD(geojson, options); };
  return TwoPointFiveD;
});
