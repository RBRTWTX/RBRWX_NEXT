# RBRWX NEXT

RBRWX NEXT is a clean rebuild of the broadcast weather workstation, beginning with a dedicated broadcast-cartography foundation rather than a generic consumer basemap.

## Start the application on Windows

Double-click **Launch RBRWX.cmd** in this folder. No manually entered PowerShell command is needed.
For a desktop button, double-click **Create Desktop Shortcut.cmd** once, then use **RBRWX NEXT** on your desktop.

The first launch (and the first launch after source changes) installs the pinned dependencies,
runs verification, and builds the native application. Keep the progress window open until it
finishes. Later launches open the compiled app and close the launcher window automatically.
The app does not require a running Vite development server.

The existing Node 22–24, pinned Rust toolchain, Windows C++ build tools, and WebView2 setup
are still required. A failed build leaves the previous executable intact and reports the error;
it does not silently launch an outdated version. Close the app before updating its source.
Move the project? Run Create Desktop Shortcut.cmd again after removing the old shortcut.

## Current checkpoint

CP3A UI V3 includes the integrated broadcast workstation and the CP3A synoptic/hazard
candidate. See docs/checkpoints/CP3A.md for provider scope and remaining acceptance work.
The package version remains 0.1.0; older foundation documents describe their original checkpoints.

See docs/checkpoints/PROJECT_CLEANUP_LAUNCHER.md for this maintenance audit and launch behavior.

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
