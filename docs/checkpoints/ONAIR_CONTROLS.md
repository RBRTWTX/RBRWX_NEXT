# Broadcast on-air controls

Based on b622254987a2d90f13607e4336bde35017ef66a5 (Broadcast title bar updates).

## Operator controls

Open the hidden canvas menu below the title. Playback remains both beside TAKE and inside this menu. Add/show title restores a hidden title; Refresh title restores the scene title. PALETTES retains the three bar designs and color/font controls.

Drag a bar body to move it. Resize handles are invisible: drag a corner for proportional bar/text sizing; drag a side midpoint for independent width or height. Hold Alt while dragging an edge to resize text alone. A selected bar design also offers a text-only resizing switch. Title, lower third, manual ticker, CP3A status bar, and EWX crawl use these controls. Text stays the same size during width-only adjustments; narrow bars may clip long text, so adjust text size separately.

## EWX scroll

Enable NWS EWX in the hidden menu or PALETTES. It defaults off on each application start. The feed polls the NWS active Texas alerts endpoint every minute and filters the issuing office to KEWX / NWS Austin/San Antonio TX. Test, cancelled, expired, invalid-time and duplicate alerts are excluded. Failed refresh clears the previous results; a five-minute hard cutoff prevents stale capture snapshots from continuing to crawl. Empty and unavailable feeds have distinct messages. Customize the bar label, colors, font and geometry in PALETTES; official alert wording is retained.

The crawl finds a free vertical band to avoid title/lower/ticker bars. If the canvas has no free band, the crawl hides until space is available. Leave room for the alert bar when arranging graphics.

## Weather and drawing tools

Radar offers provider-advertised site reflectivity, radial velocity and hydrometeor classification. Velocity/classification require their exact products and cannot silently use reflectivity as backup. MRMS products have their own selection and labels. Satellite offers longwave, shortwave, visible, water vapor and snow/ice imagery. Satellite frames expire after 30 minutes. Provider availability and site coverage still apply.

Warnings, GLM lightning, and tropical cones use separate map layers alongside the active product. The menu includes overlay refresh, radar sweep display, pen color, undo/clear, and operator track speed. Select pen or track to close the menu and draw on the operator map; Escape exits drawing. Capture windows receive drawings and expose remote weather/playback switches; create new drawings on the operator canvas.

A track takes an origin and direction click plus a speed of 1–150 mph. City times are geometric estimates for currently mapped city labels within 15 km of the path and up to two hours ahead, limited to five cities. They are not automatic storm detection or official warning arrival times. Drawings are geographic and saved per scene.

## Verification and boundaries

JavaScript/TypeScript, repository-integrity, deterministic weather and broadcast tests must pass. Browser interaction checks use controlled weather fixtures; they do not certify live meteorological accuracy. Native Rust/Tauri and actual live feeds require Windows workstation validation. The installer retains the standard native build gates before promotion and does not commit or push.

Official endpoints: https://api.weather.gov/alerts/active?area=TX ; https://opengeo.ncep.noaa.gov/geoserver/ ; https://nowcoast.noaa.gov/geoserver/satellite/wms .
