# Current Weather — public NOAA sources

CURRENT uses actual NWS station observations through api.weather.gov. RADAR uses NOAA nowCOAST's CONUS MRMS base reflectivity mosaic (about 1 km resolution, roughly four-minute updates). SATELLITE uses nowCOAST GOES East/West longwave infrared Band 14 (11.2 micrometers, about 2 km resolution, five-minute updates). These scenes require no account or API key. Geographic basemaps, map styles, roads, city labels and county/state references are unchanged.

The satellite product differs from the previous Aguacero C13 selection. NOAA's published default satellite legend is a grayscale ramp with image levels 0–255, not a calibrated Celsius legend. The title key therefore says image level. It must not be labeled degrees Celsius without a documented calibration. The radar key uses NOAA's published dBZ color/opacity stops. Both are available under Graphics → Keys, use the title font, and follow their scenes automatically. Existing NOAA keys remain available.

Each imagery request uses an explicit timestamp from that layer's WMS capabilities. The most recent 12 advertised frames are available to Previous/Next, Play/Pause, Loop, Latest and the frame slider. The original displayed timestamp remains until the replacement PNG loads into MapLibre and renders. Failed requests do not become blank success frames or advance the displayed timestamp. Geographic movement and resizing request a new image for the visible bounds. Requests are cancelled on replacement and scene changes. Only the last complete frame and one incoming frame are retained; no entire animation is prefetched.

WMS images use EPSG:3857 and matching image-source geographic corners. They are capped at 1536 pixels on the longest side, so this release is a viewport-rendered public service implementation, not a native Level II radar decoder. Zooming does not create finer source resolution. Radar coverage is CONUS; outside that area an otherwise valid PNG may be transparent. A transparent radar area means no rendered returns, not a general all-clear. NWS station coverage and upstream reporting delays vary. Original timestamps and stale labels remain visible.

The public provider replaces the Aguacero imports, npm packages, API-key UI, bundled decoder assets and worker transform. The supplied MapTiler key is not needed and is not inserted. CSP permits NOAA nowCOAST requests and local data-URL image reads by MapLibre; JavaScript unsafe-eval is removed. No general-purpose network proxy is introduced.

References reviewed:

- https://www.weather.gov/documentation/services-web-api
- https://nowcoast.noaa.gov/geoserver/observations/weather_radar/wms?SERVICE=WMS&REQUEST=GetCapabilities
- https://nowcoast.noaa.gov/geoserver/satellite/wms?SERVICE=WMS&REQUEST=GetCapabilities
- Both layers' GetLegendGraphic responses, format application/json, are retained in scripts/current-weather/fixtures.
- https://github.com/weather-mcp/weather-mcp — weather-service client reference; no source copied.
- https://github.com/JoshuaKimsey/LibreWXR — self-hosted tile-server reference; no server added and no source copied.
- https://github.com/dpaulat/supercell-wx — native NEXRAD application reference; no source copied.

Validation: live NOAA PNG responses and NWS discovery, browser rendering of captured live NOAA responses under the application CSP, per-scene units and automatic keys, playback, resize, and scene cleanup. Unit checks cover freshness, missing data, units/QC, cache isolation, stale async completion and keyless initialization. Windows/Tauri runtime remains an acceptance check on the user's machine.
