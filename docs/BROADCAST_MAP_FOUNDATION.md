# Broadcast Map Foundation Contract — v1

## Purpose

The map is a weather-broadcast geographic reference system, not a consumer navigation map. Geographic data and labels must remain legible beneath and around weather graphics while avoiding street/POI clutter.

## Source contract

Development source: OpenFreeMap OpenMapTiles-compatible vector TileJSON.

Required source layers:

- `transportation`
- `transportation_name`
- `place`
- `boundary`
- `water`
- `waterway`
- `landcover`
- `landuse`

The application owns the style and layer order. It does not load `styles/liberty`, `styles/bright`, or another finished third-party basemap style.

## Rendering planes

### Under weather

- land / water
- environmental landcover
- road geometry and casings

### Weather insertion slot

All future weather rendering must insert before `rbrwx-county-boundary` unless a product contract explicitly states otherwise.

### Broadcast reference above weather

- county lines
- state lines
- road names
- Interstate / U.S. Highway shields
- RBRWX-owned Texas guide-route badges for SH/FM/RM/Loop/Spur families from preserved route relations
- cities / towns / communities
- state labels

## Road hierarchy

- Motorway: visible from national/regional zooms.
- Trunk: visible from regional zooms.
- Primary: appears as the map approaches state/metro scale.
- Secondary/tertiary: metro/local scale.
- Minor/service: local/street scale only.

Road geometry visibility does not own city or county visibility.

## Shields

`transportation_name.network` controls the standard shield families used in this foundation:

- `us-interstate` → Interstate shield sprite
- `us-highway` → U.S. Route shield sprite

`ref` supplies the displayed route reference and `ref_length` selects only sprite sizes that actually exist in the provider sprite index.

OpenMapTiles normalizes the top-level state network to `us-state`, which is not specific enough to draw correct Texas route-family markers. The schema also preserves the original OSM relation identity in `route_1_network` / `route_1_ref` (and additional concurrency fields). RBRWX consumes those preserved fields and supplies its own stretchable black/white guide-route marker for Texas `State Highway`, `FM`, `RM`, `Loop`, `Spur`, `Park`, recreational, NASA, PA, Beltway, and business families. The label text follows the route family (`TEXAS`, `FM`, `RM`, `LOOP`, `SPUR`, etc.) and the real route reference. The generic OpenFreeMap `us-state` sprite is intentionally not rendered for these routes.

## Cities

- `place.class=city` is the major city layer.
- `place.class=town` is a secondary broadcast layer.
- village/hamlet/suburb labels begin only at closer zooms.
- `rank` drives placement priority.
- market anchors may receive explicit priority without replacing source geography.
- cities are independent of Roads.

## Boundaries

- State boundaries use OpenMapTiles `boundary.admin_level=4`.
- County boundaries use the U.S. Census Bureau TIGERweb Counties feature layer, January 1, 2026 vintage.
- County labels are generated from Census `INTPTLAT` / `INTPTLON` interior points, not polygon label heuristics.
- County boundary polygons and county label points are separate GeoJSON sources but remain one independent Counties visibility group.
- County boundaries are independent of Roads and Cities.

## Failure behavior

Map source/tile/glyph/sprite failures surface as map health messages. Missing required RBRWX sources are hard failures. Missing sprites are degraded-state diagnostics rather than silent disappearance.

V5 cartography: Interstate shields use local full-color canvas artwork at 3x pixel density with white route numbers in the blue field. U.S. Highway shields retain their black/white sprite artwork at a larger display size. Texas guide-route badges retain black/white styling. Landcover and urban fill opacity are reduced to soften polygon patchwork.
