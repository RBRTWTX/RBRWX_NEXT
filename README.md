# RBRWX NEXT

RBRWX NEXT is a clean rebuild of the broadcast weather workstation, beginning with a dedicated broadcast-cartography foundation rather than a generic consumer basemap.

## Current release work

`0.1.0` — Broadcast Map Foundation

This release intentionally focuses on the application shell and geographic rendering contract. Radar, satellite, models, alerts, and other weather products are not part of this checkpoint.

## Runtime stack

- Rust 1.98.1 (repository-pinned toolchain)
- Tauri 2.11.5 (Rust crate)
- `@tauri-apps/api` 2.11.1
- `@tauri-apps/cli` 2.11.4
- React 19.2.8
- MapLibre GL JS 6.8.0
- Vite 8.2.2
- TypeScript 7.0.2

Frontend/Tauri package versions are exact in `package.json`, and Rust is pinned by `rust-toolchain.toml`; do not casually upgrade foundational dependencies inside an unrelated feature release.

## Development

```powershell
npm install
npm run verify
npm run tauri dev
```

## Broadcast-map principles

- OpenMapTiles-format vector data is consumed through a RBRWX-owned style.
- No generic OpenFreeMap/OSM finished style is imported.
- Road geometry is below the weather insertion slot.
- County/state boundaries, route shields, road labels, and city labels are broadcast-reference layers above weather.
- Roads, cities, counties, and states have independent visibility ownership.
- Interstate and U.S. Highway shields use network-aware route sprites. Texas State Highway/FM/RM/Loop/Spur identities are read from preserved OpenMapTiles route-relation fields and rendered with a RBRWX-owned black/white guide-route badge; RBRWX never substitutes OpenFreeMap’s generic `us-state` marker.
- City density is zoom/rank controlled rather than displaying every settlement at every scale.
- County boundaries use the U.S. Census Bureau TIGERweb January 1, 2026 county layer; county labels use Census interior points.

See `ACCEPTANCE.md` and `docs/BROADCAST_MAP_FOUNDATION.md` before advancing this release.
