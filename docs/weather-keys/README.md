# Weather color keys

Graphics → Keys lists 16 NOAA/NWS palettes with thumbnails. Select a key to add it to the current Program scene and show its title bar. Match scene restores automatic selection. None removes only the key. Each rundown item retains its selection for the current application session; duplicate scenes are independent. Existing graphics settings are also session-only.

The key is inside the existing 108-pixel title envelope. It inherits the title font and moves/scales with the title; double-click title editing and blank titles still work. There are no graphic handles or remove icons. All graphics start off. Colors inside keys retain the source meteorological meaning; surrounding UI retains RBR TW colors.

## Product contract

Set `weatherKeyId` on a `BroadcastSceneDefinition` to the exact catalog ID used by its map renderer. The host forwards this field to Graphics. A new rundown item defaults to automatic matching. Titles are never parsed to guess a product. Unknown IDs and geographic basemaps have no automatic key. Preview does not alter Program graphics; TAKE changes the Program scene and key together.

| ID | Intended renderer |
|---|---|
| nws.ndfd.temperature | NDFD TempF, layer 4 |
| nws.ndfd.apparent-temperature | NDFD AptTempF, layer 45 |
| nws.ndfd.maximum-temperature | NDFD MaxTempF, layer 127 |
| nws.ndfd.minimum-temperature | NDFD MinTempF, layer 140 |
| nws.ndfd.relative-humidity | NDFD RHPct, layer 86 |
| nws.rfc.rainfall | RFC QPE observed rainfall, layer 4 |
| nws.wpc.qpf | WPC QPF, layer 1 |
| nws.spc.categorical | SPC Day 1 categorical, layer 1 |
| nws.spc.tornado | SPC Day 1 tornado probability, layer 3 |
| nws.spc.hail | SPC Day 1 hail probability, layer 5 |
| nws.spc.wind | SPC Day 1 severe wind probability, layer 7 |
| nws.spc.day3-probability | SPC Day 3 severe probability, layer 19 |
| nws.spc.day4-probability | SPC Day 4 severe probability, layer 21 |
| nws.spc.fire | SPC Day 1 fire outlook, layer 1 |
| nws.spc.dry-thunderstorms | SPC Day 1 dry thunderstorms, layer 2 |
| nws.wpc.wssi | WPC overall winter impacts, layer 1 |

Example (only when that renderer is actually implemented):

```ts
{ id: 'forecast-temperature', title: 'Temperature', subtitle: 'NDFD',
  category: 'WEATHER', contentKey: 'weather.ndfd.temperature',
  weatherKeyId: 'nws.ndfd.temperature', defaultHoldMs: 8000 }
```

This package does not add weather data renderers. The current geographic map and satellite basemap must remain without automatic meteorological scales. Manual selection is available for operator-controlled scenes.

## Source fidelity

Catalog colors and original labels were extracted from NOAA's published ArcGIS renderers and legend PNGs on 2026-09-12. Source URLs and SHA-256 hashes are in `sources/manifest.json`; the exact responses are bundled for offline verification. Runtime needs no network calls for keys. `node scripts/graphics/verify.mjs` checks every original bin and RGBA value, including transparency, using the package's existing private compiler API.

Official sources:

- [NDFD temperature and humidity](https://mapservices.weather.noaa.gov/raster/rest/services/NDFD/NDFD_temp/MapServer)
- [RFC observed precipitation](https://mapservices.weather.noaa.gov/raster/rest/services/obs/rfc_qpe/MapServer)
- [WPC precipitation forecast](https://mapservices.weather.noaa.gov/vector/rest/services/precip/wpc_qpf/MapServer)
- [SPC severe outlooks](https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer)
- [SPC fire outlooks](https://mapservices.weather.noaa.gov/vector/rest/services/fire_weather/SPC_firewx/MapServer)
- [WPC winter impacts](https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/wpc_wssi/MapServer)

These are service-specific palettes, not a universal NWS palette. SPC probability keys represent the solid probability fills; conditional-intensity hatching is a separate product and is not represented by those keys. Temperature/humidity preserve every discrete source bin but show selected numeric labels for readability. The first/last temperature bins retain the service's extreme-value ranges. Rainfall retains the transparent below-threshold class and Missing data class. QPF labels are the source contour values in inches.

Radar reflectivity/velocity, infrared enhancements, dewpoint, wind speed, AQI, smoke, tropical wind probabilities, and surge are not assigned approximate palettes. Their precise provider/renderer must be established before adding their keys. The examined NOAA radar MapServer exposes an RGB-band legend, which is not a dBZ scale. Satellite basemap imagery is not infrared satellite weather data.

No live forecast or warning data are included in this static legend library. Source responses should be rechecked when changing weather providers or renderer versions.
