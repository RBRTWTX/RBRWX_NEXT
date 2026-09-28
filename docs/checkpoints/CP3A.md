# CP3A — Broadcast Synoptic & Hazard Pack

Candidate built on CP2A V4 commit `9320762a127ba78c188f096c7649bf2bed71ef00`.

## Scope and operation

All six scene families share title/subtitle/valid-time chrome, source and legend trays, optional feature details, lower third, opacity, operator objects, and per-rundown-item settings. Double-click a scene to add it, then TAKE. National/Atlantic/Gulf/Pacific buttons change the view. Existing map controls retain local zoom, cities, boundaries and counties. Styles use original steel-blue and tropical-maroon chrome; no third-party logos or branding are supplied.

Play/step/loop operates on available grid or lightning frames. Official current vector products display their latest issuance rather than synthesizing historical frames. Playback controls are operator-only in the clean popout. Popout receives the same payload, settings, valid time and objects, without requesting a different weather frame.

| Family | Implemented scenes / sources | Truth boundary |
| --- | --- | --- |
| Surface | National, regional, fronts + precipitation, fronts + infrared cloud imagery; WPC CODSUS through NWS Products API | Current analyzed fronts. Six-hour hard limit. Copy WPC objects to enable manual replacement. Annotations otherwise supplement analysis. |
| Editorial | Futurecast Surface Setup; air-mass/moisture/cold/warm objects | Operator objects and operator-entered forecast time; never labeled as an official future-front forecast. |
| Alerts/SPC | NWS active alerts and warnings, severe thunderstorm/tornado watch areas, SPC Day 1 categorical/tornado/hail/wind, Day 2/3 categorical, Day 4–8 probabilities, mesoscale discussions | Alerts retain individual expiration; watch areas are NWS alert geometry, not SPC watch-box geometry. Missing geometry is disclosed. |
| Tropical | Atlantic, Gulf/Caribbean, eastern Pacific, track, cone/points, warnings, wind radii, outlook, impacts, summary | NHC GIS geometry; advisory time distinct from forecast-point labels; knots and hPa shown explicitly. Storm selector and summary panel. |
| RTMA/URMA | Temperature, dewpoint, wind speed, surface pressure | Official 2.5-km GRIB analysis; labels/contour toggles. Surface pressure is not sea-level pressure. URMA is delayed, not live. |
| Expanded MRMS | Seamless reflectivity, composite, QPE 1/24-hour, rate, precipitation flags, 18-dBZ echo tops, MESH, low-level azimuthal shear, QPE/FFG context | Product-specific units and palettes; categorical flag colors; missing/unsupported data is unavailable. MESH is an estimate, azimuthal shear is not a tornado confirmation. |
| GLM | Flashes, centroid density, recent activity, radar blend, satellite blend | GOES-19 quality-zero flash centroids; 1–30-minute windows, time fade, counts per 0.1-degree cell. This is not flash-extent density or a ground-strike network. |

## Radar foundation

Site imagery checks the newest fresh candidate and falls back to older fresh candidates when decoding/rendering fails. The displayed timestamp advances only after a successful frame. Site imagery older than 15 minutes is removed even without another request; MRMS has a separate 20-minute cutoff. Fallback labels explicitly say MRMS. Sweeps require a current site frame. Synoptic backgrounds and products are independently removed at expiration; timestamps are never replaced with the fetch clock.

## Data source list

- WPC coded analysis: `https://api.weather.gov/products/types/COD`, ASUS01 KWBC product text.
- Alerts: `https://api.weather.gov/alerts/active`; affected-zone geometry from the same origin.
- SPC: `https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer` and `spc_mesoscale_discussion/MapServer`.
- NHC: `https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer`.
- RTMA: `https://noaa-rtma-pds.s3.amazonaws.com/`, hourly `2dvaranl_ndfd.grb2_wexp` plus index; bounded HTTP byte ranges.
- URMA: `https://noaa-urma-pds.s3.amazonaws.com/`, corresponding URMA analysis/index.
- MRMS: `https://noaa-mrms-pds.s3.amazonaws.com/CONUS/`; GRIB2 gzip products.
- GLM: `https://noaa-goes19.s3.amazonaws.com/GLM-L2-LCFA/`; NetCDF4 flash data.
- MRMS metadata: NOAA-NSSL `mrms-support/GRIB2_TABLES`, version 12.2 and precipitation flags.
- Background images reuse the baseline NOAA imagery adapter and retain their own observation times.

## Must not break

Existing scene/rundown transport, graphics, current-weather controls, forecast graphics, QPF, popout/capture, map layer toggles and baseline provider diagnostics remain in place. OBS-IDW-SURFACE is not globally removed: existing station-interpolated scenes still require that warning. The new official analysis scenes provide an alternative, not a silent substitution.

No Rust/Cargo dependency, native command, map-provider contract, API credential, automatic repository commit or push is introduced. Installer uses the baseline transactional framework and preserves single-owner manifests.

## Acceptance / verification

1. Deterministic tests: bad newest radar, stale hard limit, unchanged timestamp on failed promotion, explicit fallback source; WPC coordinates and wrapped positions; NHC/SPC time parsing; precipitation flags; signed shear; refusal of unbounded analysis download; watch expiration/filtering; contour geography.
2. Repository gates: installer tests, canonical integrity, existing module contracts, TypeScript, production Vite build.
3. Browser: scene TAKE, editable chrome and controls; actual MRMS PNG-packed GRIB and actual GLM NetCDF fixtures decoded in Web Workers. Fixture dates are historical and are not injected into live scenes.
4. Native acceptance on Windows: `cargo check --locked`, Tauri no-bundle release build, local network/CORS, all six families, popout geometry/time equality, loop and stale-expiry behavior. Installer runs native gates before promoting payload.

## Explicit remaining acceptance boundaries

This is an integration candidate, not an on-air-certified release. Native Windows/WebView2 verification is required. Complete live-source and visual acceptance must be performed on the target workstation. Public feeds may be absent, late or blocked; the scenes must show unavailable rather than invented data.

Dedicated SPC watch-box ingestion, official GLM flash-extent density, forecast-model-backed future-front editing, an impact-calculation engine and richer temporal vector transitions are not implemented here. Isobars, visibility/ceiling, feels-like, wind barbs and streamlines remain later scope. No frozen precipitation subtype is inferred beyond MRMS's published flag categories. Contours are presentation contours of the sampled official grid, not additional observations.
