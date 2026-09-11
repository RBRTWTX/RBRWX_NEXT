# RBRWX NEXT Standalone Broadcast Base

## Purpose

This package adds the broadcast operator layer without owning or modifying the map engine. The Broadcast core owns Scene Library, rundown instances, Preview, Program, transport state, loop state, and transition commands. The RBRWX host adapter translates generic scene `contentKey` values into existing application content.

## Independence rule

`src/broadcast/` may import only React and its own local files. It must not import MapLibre, Tauri, map source code, provider code, graphics code, radar code, satellite-weather code, or future weather modules.

`src/broadcast-host/` is the explicit integration boundary. It may consume public Broadcast APIs and existing map APIs. Existing `src/app/App.tsx`, `src/map/`, `src/styles.css`, provider code, and native/Tauri source remain untouched by the package.

The package does not require or validate any Git commit SHA. Installation is based on current host capabilities, not repository history.

## Runtime surfaces

- Scene Library: master scene presets.
- Rundown: ordered instances selected for the current broadcast.
- Preview: the rundown item prepared for TAKE.
- Program: the rundown item considered on air.

Selecting a Library scene never changes Program. Adding a scene creates a new rundown instance. TAKE moves Preview to Program. Program cannot be removed while on air.

## Transport

Previous, Play, Pause, Next/Skip, TAKE, and Loop are owned by Broadcast. Automatic playback advances using the current Program item's hold duration and does not restart merely because a future rundown item is added, removed, or reordered.

## Transitions

Cut, Dissolve, and Fade are represented as transition commands in the Broadcast Base. Renderer-specific visual compositing is intentionally deferred to the next Broadcast Base checkpoint and must consume this public contract rather than being embedded in the Broadcast state engine.

## Host integration

The current host catalog registers Broadcast Map and Satellite Map as opaque `contentKey` values. The host adapter interprets those keys and updates the existing map basemap mode. Broadcast itself never knows what a basemap, weather layer, or provider is.

## Recovery

The original working `src/app/App.tsx` remains intact. The package changes only the entry point used to launch the standalone Broadcast workspace plus the foundation manifest hash for that entry point. Removing or replacing the Broadcast package does not require rewriting map source.
