# Current Weather — public NOAA/NWS sources

CURRENT uses actual NWS station observations through api.weather.gov. The operator can switch the same live Current Conditions view among Temperature, Humidity and Heat Index without creating a second observation request or changing the underlying viewport. The map draws value-only labels — no station identifiers — and increases the number of displayed station observations as the operator zooms in. Wide views query multiple points across the viewport so discovery is not limited to the forecast office serving the map center. Each colored field is a local interpolation of those current station observations. Temperature colors come from the project's verified official NWS NDFD temperature palette; the interpolated field itself is not NDFD forecast or analysis data and must not be described as such.

RADAR is site-first. The application loads the official NWS radar-site catalog from opengeo.ncep.noaa.gov, filters out TDWR/other sites that do not advertise the WSR-88D SR_BREF product family, defaults to KEWX (San Antonio / Austin), and discovers the selected WSR-88D site's actual site-qualified Super Resolution Base Reflectivity WMS layer from that site's live GetCapabilities document before requesting imagery. `SR_BREF` is treated as the NWS product family name, not assumed to be the literal GeoServer `<Name>` value. The operator can select a primary radar from a city/radar menu or click tower markers on the map. Up to three site radars may be active at one time. Their visible sweep wedges are operator visualization overlays; they do not claim to represent the radar antenna's measured real-time azimuth.

The supplied `src/current-weather/RadarScope1.pal` is retained verbatim. Its two-RGB `color:` entries are preserved as a gradient from that breakpoint's first RGB to that same breakpoint's optional second RGB immediately before the next dBZ threshold, matching the GR/RadarScope palette convention. Site reflectivity requests attempt to apply that palette through an OGC SLD color map. If a NWS site rejects the custom SLD request, the application explicitly reports `NWS palette fallback` and requests the same SR_BREF frame with the site's published service style rather than silently presenting the wrong palette. NOAA nowCOAST CONUS MRMS base reflectivity remains available only as an operator-enabled backup mosaic and is off by default. Enabling or disabling MRMS does not rebuild the site-radar manager or discard the operator's selected WSR-88D sites. When MRMS is enabled it follows the primary site's playback time using the nearest MRMS frame advertised by nowCOAST.

SATELLITE continues to use NOAA nowCOAST GOES East/West longwave infrared Band 14 (11.2 micrometers). NOAA's published satellite legend is an image-level grayscale ramp, not a calibrated Celsius legend, so it must not be labeled degrees Celsius without a documented calibration.

Site-radar and satellite requests use explicit timestamps advertised by their WMS capabilities. The most recent frames are available to Previous/Next, Play/Pause, Loop, Latest and the frame slider. For multiple radar sites, the primary radar owns the playback timeline; the other active sites and optional MRMS backup are matched to their nearest available frame times. The displayed timestamp changes only after a replacement frame is loaded. Map movement requests imagery for the visible bounds; prior frames remain visible until their replacement succeeds.

NWS station observations and WSR-88D products can be delayed upstream. A missing or transparent radar area is not an all-clear. Station coverage also varies by location and reporting schedule. The application retains timestamps and stale/unavailable status rather than fabricating missing weather values.

The Windows/Tauri content-security policy permits only the required NOAA/NWS hosts used here, including api.weather.gov, nowcoast.noaa.gov and opengeo.ncep.noaa.gov. No general-purpose network proxy is introduced.

References reviewed:

- https://www.weather.gov/documentation/services-web-api
- https://opengeo.ncep.noaa.gov/geoserver/nws/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=nws:radar_sites&outputFormat=application%2Fjson
- https://opengeo.ncep.noaa.gov/geoserver/kewx/ows?SERVICE=WMS&REQUEST=GetCapabilities
- https://nowcoast.noaa.gov/geoserver/observations/weather_radar/wms?SERVICE=WMS&REQUEST=GetCapabilities
- https://nowcoast.noaa.gov/geoserver/satellite/wms?SERVICE=WMS&REQUEST=GetCapabilities
- The verified NDFD temperature key already bundled under Graphics → Keys
- `RadarScope1.pal`, supplied by the application owner for this radar renderer

Validation for this release covers temperature-only station labels, wide/regional/local viewport discovery and zoom-driven station density, temperature-palette lookup, radar-site catalog parsing, the KEWX default, a maximum of three active radar sites, dynamic site-qualified reflectivity-layer discovery, radar request construction, exact two-RGB RadarScope gradient semantics, per-site palette-fallback state, MRMS-off-by-default behavior, synchronized nearest-frame MRMS playback, in-place MRMS toggling, MapLibre source-load gating before frame swaps, playback state, stale async cancellation, TypeScript compilation and the existing broadcast-map build gates. The installer does not make source installation or rollback depend on a momentary external NOAA/NWS response. A separate installed provider diagnostic verifies NWS station observations, the official radar-site WFS, dynamic KEWX reflectivity-layer discovery, Windows/Tauri CORS, PNG rendering and RadarScope SLD acceptance/fallback. Windows/Tauri live rendering remains the final acceptance test on the target workstation.

## Humidity and Heat Index current-condition layers

The CURRENT scene now keeps Temperature, Humidity and Heat Index as switchable data layers inside the existing operator controls rather than creating three unrelated broadcast modes. This follows the publicly documented interaction model of professional broadcast systems: Baron Lynx exposes weather parameters as data layers/views within its analysis and storytelling workflow, while The Weather Company Max Studio emphasizes interactive controls that let on-air talent change visualizations and scenes without leaving the presentation. The implementation reproduces that public operator behavior only; it does not use proprietary Baron or Max source code, palettes, or internal algorithms.

HUMIDITY uses the NWS station observation `relativeHumidity` value when present and quality-controlled. If relative humidity is unavailable but both air temperature and dew point are valid, the application derives RH from the NOAA/NWS vapor-pressure relationship rather than inventing a value. Humidity is displayed as integer percent labels with a continuous, absolute 0-100% broadcast palette. The palette never re-normalizes to the current viewport, so the same percentage has the same color at every zoom and location.

HEAT INDEX uses the NWS station observation `heatIndex` value when present and quality-controlled. If the station feed does not provide a heat-index value, the application derives one from the observed air temperature and RH using the NWS procedure: the Steadman/simple formula is evaluated first, the result is averaged with air temperature, and when that preliminary value is at least 80°F the Rothfusz regression and the published low-humidity/high-humidity adjustments are applied. This is Heat Index only; it is not a generic "feels like" layer and does not substitute wind chill. Heat Index values remain in Fahrenheit for the scientific calculation and color breakpoints, then labels convert to Celsius only when the operator selects metric units.

The Heat Index color surface uses fixed absolute breakpoints based on the public NWS heat-safety bands: 80°F, 90°F, 103°F and 125°F. The colors between those thresholds are a local broadcast visualization design and are not represented as an official NWS, Baron Lynx, or The Weather Company palette. As with Temperature, Humidity and Heat Index render as one continuous MapLibre image/raster field with linear resampling, not visible GeoJSON grid squares. Station labels remain value-only; station identifiers and source/status telemetry stay off the live map.

Additional references reviewed for this phase:

- https://www.weather.gov/tbw/heatindex
- https://www.wpc.ncep.noaa.gov/html/heatindex_equationbody.html
- https://www.weather.gov/tsa/met_calc
- https://www.weather.gov/media/epz/wxcalc/rhTdFromWetBulb.pdf
- https://www.weather.gov/documentation/services-web-api
- https://baronweather.com/baron-lynx-for-broadcast
- https://baronweather.com/weather-insights/how-our-team-uses-baron-tools
- https://baronweather.com/weather-insights/display/optimizing-weather-prep-for-broadcast-meteorologists
- https://www.weathercompany.com/media/max-studio/
- https://www.weathercompany.com/wp-content/uploads/2024/01/Max-Differentiation-Techniques-1.pdf

Validation for the Humidity / Heat Index phase covers NWS observation parsing, RH fallback math, the published NWS Heat Index procedure and adjustments, direct-NWS heat-index preference, unit conversion, absolute field palettes, value-only station labels, in-place field switching without an observation refetch, continuous raster rendering, preservation of temperature behavior, and the existing radar/satellite/broadcast regression gates.
