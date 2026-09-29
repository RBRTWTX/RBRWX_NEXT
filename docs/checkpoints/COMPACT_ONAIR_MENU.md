# Compact on-air menu

Base: 84a824dea5a20de89ad10116e1ed5d972ea38435 (on air controls 1).

The hidden canvas menu uses SVG icons, short labels, hover descriptions and accessible button names. Playback is a compact icon strip; weather frame scrubbing remains available. Radar, satellite, drawing and track controls open small submenus. Weather status and the radar-site selector are available through Status / site. Both operator and capture windows use the compact controls. Existing playback beside TAKE is unchanged.

The right-side OBJECT LIST is removed, including its reserved grid row. PALETTES, PROPERTIES and TOOLS use the full remaining panel height. Forecast graphic properties and tools remain available.

This update changes presentation and control layout. It retains the prior weather adapters, alert expiry handling, bar scaling, drawing, track estimates, capture command bridge and launcher. The installer requires a clean exact-base checkout and runs the existing transactional validation/build gates before promotion. It does not commit or push.
