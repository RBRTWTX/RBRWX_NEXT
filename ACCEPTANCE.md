# RBRWX NEXT Acceptance Ledger

## 0.1.0 — Broadcast Map Foundation

Status: **IN DEVELOPMENT — NOT ACCEPTED**

A later release must not branch conceptually from 0.1.0 until this ledger is changed to ACCEPTED against a specific tested commit.

### Build gate

- [ ] `npm install` succeeds on the Windows development workstation.
- [ ] `npm run verify` passes (payload integrity, structural contract, official style validation, live provider validation, strict TypeScript, and production frontend build).
- [ ] `npm run tauri dev` launches without Tauri/API mismatch errors.
- [ ] Production frontend build succeeds.

### Broadcast map contract gate

- [x] Roads, cities, counties, and states have separate ownership groups in code.
- [x] Road geometry is below the weather insertion slot.
- [x] Reference boundaries, route shields, road names, and cities are above the weather insertion slot.
- [x] Interstate and U.S. Highway shields use network-aware route sprites and real `ref` values.
- [x] Generic `us-state` shield rendering is prohibited for Texas routes; preserved `route_1_network` / `route_1_ref` metadata drives RBRWX-owned black/white Texas guide-route badges for State Highway/FM/RM/Loop/Spur families.
- [x] City density is controlled by class/rank/zoom.
- [x] Generic finished third-party basemap styles are not imported.
- [x] County geometry uses the Census TIGERweb Counties feature layer (January 1, 2026 vintage); labels use Census INTPTLAT/INTPTLON interior points.

### Runtime regression gate

- [ ] Roads OFF leaves cities and counties visible.
- [ ] Cities OFF leaves roads and counties visible.
- [ ] Counties OFF leaves roads and cities visible.
- [ ] State boundaries can be controlled independently.
- [ ] Zooming from CONUS to street/local scale adds detail progressively without label explosion.
- [ ] Panning leaves no stale labels or duplicate layers.
- [ ] Window resize produces no map/canvas mismatch.
- [ ] Missing tile/source/glyph/sprite produces a controlled diagnostic rather than an application crash.

### Visual acceptance cameras

- [ ] CONUS
- [ ] Texas
- [ ] San Antonio–Austin corridor
- [ ] South-Central Texas / EWX-style regional frame
- [ ] San Antonio metro
- [ ] West Bexar / Castroville–Hondo local frame

### Acceptance rule

Only after all required boxes are checked and the user visually accepts the cartography should the tested commit be tagged as the accepted 0.1.0 foundation.

### V4 user runtime report / V5 visual correction (2026-09-10)

User confirmed V4 launches, reaches MAP READY, zooms, and independently toggles cities, counties, and roads. Cities were acceptable. State toggle, other acceptance cameras, and failure diagnostics were not confirmed. V4 visual acceptance failed: Interstate shields appeared white with unreadable white route numbers, and land shading looked degraded.

V5 replaces Interstate artwork with owned full-color, high-DPI shields, moves route numbers into the blue field, enlarges U.S. Highway markers, and reduces landcover/urban patch contrast. Source ownership, camera behavior, and layer toggles retain their existing contracts. V5 remains pending Windows runtime and user visual acceptance.
