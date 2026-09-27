# RBRWX NEXT — Weather Data Audit (CP2A V4)

CP2A adds diagnostics only. It does not change on-air weather rendering or runtime weather behavior.

## Commands

- `npm run weather:audit:test` — deterministic regression tests. This is part of normal `npm run verify` and does not require live NOAA/NWS availability.
- `npm run weather:audit:contracts` — prints the deterministic source/ingestion/expression audit, including known correctness warnings and the not-yet-implemented Baron-parity roadmap.
- `npm run weather:audit` — performs the live provider audit. It verifies the currently implemented weather providers through the same Windows/Tauri-origin CORS assumptions used by RBRWX NEXT.
- `npm run verify:live` — preserves the map-provider live check and then runs the complete weather audit.

## Live audit coverage

The live audit checks:

1. NWS station discovery and latest observation through `api.weather.gov`.
2. NWS point metadata, forecast, hourly forecast, observation-station collection and a current observation for the Forecast Graphics pipeline.
3. NWS/NCEP radar-site discovery, dynamic KEWX site-qualified Super Resolution Base Reflectivity layer discovery, up to 12 advertised recent frame probes, current-age enforcement, PNG imagery, Windows/Tauri CORS and RadarScope SLD acceptance/fallback when the newest current frame is usable.
4. NOAA nowCOAST CONUS MRMS base-reflectivity mosaic capabilities, timestamp and PNG rendering.
5. NOAA nowCOAST GOES longwave infrared imagery capabilities, timestamp and PNG rendering.
6. WPC QPF service metadata, layer identity, fields, GeoJSON samples and official renderer signatures for Day 1, Day 2, Day 3 and Day 1–7.
7. Tauri `connect-src` coverage for every currently implemented NOAA/NWS weather host.

## Status meanings

- `PASS` — the implemented pipeline met the tested provider/schema/timestamp/image/network contract.
- `WARN` — data is available, but a known fallback or correctness limitation remains. WARN is intentionally nonzero-risk information for the operator/developer; it does not fail the live command.
- `FAIL` — an implemented pipeline did not satisfy its live provider contract. The live command exits nonzero when any FAIL occurs.
- `ROADMAP` — the product family is not implemented yet and therefore is not treated as a failure of an existing pipeline.

## Known correctness warnings tracked by CP2A

CP2A intentionally records these existing issues until later weather-correction checkpoints remove them:

- Current Conditions colored background is RBRWX inverse-distance interpolation of station observations rather than an authoritative analyzed grid.
- Radar sweep wedge is simulated operator visualization, not measured live antenna azimuth.
- Site radar currently attempts the newest advertised WMS frame and does not skip a corrupt/unrenderable GeoServer granule.
- Site radar freshness is currently status-only; stale renderable imagery is not hard-rejected before display.
- Forecast Graphics is hard-coded to one San Antonio-area coordinate.
- Forecast Graphics labels local fetch completion as `UPDATED` instead of retaining NWS generation/update metadata.
- Forecast Graphics observation quantity parsing is less strict than Current Conditions and does not validate NWS unit/QC metadata.
- Forecast Graphics may substitute forecast condition/icon text for a missing observation.
- Forecast Graphics stores `temperatureUnit` but displays the raw forecast number without unit-aware conversion.
- Forecast probability of precipitation is always labeled `RAIN`.
- QPF has manual refresh but no automatic issuance polling while an open scene remains active.
- QPF ingests issue/start/end/valid metadata but does not currently expose those timestamps in the operator status surface.

## KEWX outage finding captured during CP2A validation

On 2026-09-27 the official OpenGeo KEWX `kewx_sr_bref` capabilities advertised frames through 05:59:29Z, but the newest advertised GeoServer granules returned OGC ServiceException responses instead of PNG imagery. Of 12 advertised frames tested, only two older frames (04:56:08Z and 04:49:05Z) rendered. Those renderable frames were already many hours stale while the nowCOAST MRMS mosaic remained current.

CP2A V4 therefore treats a site-radar frame as usable only when it both renders successfully and is within the 15-minute current-radar age contract. It also reports the actual assertion/service exception instead of allowing a trailing `Node.js v...` line to hide the provider error. This checkpoint still does not alter runtime radar behavior; runtime bad-frame skipping and hard stale rejection belong to the next weather-correction checkpoint.

## Not-yet-implemented Baron-parity product families

These are roadmap items, not current-pipeline failures:

- WPC fronts/surface analysis.
- NWS alerts and SPC outlooks/watches/mesoscale discussions.
- NHC tropical/hurricane tracks, cones, wind radii, probabilities and surge.
- WPC snow/ice probabilities and winter-impact products.
- GOES GLM lightning.
- RTMA/URMA analyzed current weather fields.
- Expanded MRMS QPE, precipitation type, hail and rotation diagnostics.
- Full GOES visible/water-vapor/derived satellite products.
- Dual-pol and velocity Level II/III radar products.
- HRRR, RAP, NAM, GFS, GEFS, NBM, ECMWF and HAFS guidance.
- Upper-air/soundings, hydrology/flood, fire weather, marine/coastal and climatology products.

CP2A is the baseline. Later weather checkpoints should remove a WARN only when the underlying pipeline or expression problem is actually corrected and regression-tested.
