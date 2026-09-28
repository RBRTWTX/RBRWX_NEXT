# Broadcast bar style library

Base: a3eaecb1330143b806c12ee731e4ea23435f9341 — Application button added.

Open PALETTES → BAR LIBRARY. The collapsible thumbnail gallery follows the Keys
library interaction. Select the bar target, then choose Current Steel, CP3A Original,
Studio Edge, or RBRTW Classic. Customize top/background, bottom/background, accent
and text colors, font family, and weight. Changes apply immediately to the program
scene and are included in capture snapshots. Gallery cards show the default presets;
the program canvas displays your custom colors.

Current Steel uses the compact steel frame. CP3A Original recovers the original
candidate's navy/steel gradient and metallic trim, with heavier silver rails. Studio
Edge has a graphite body, colored left edge and inset bottom rule. RBRTW Classic
retains the rounded workstation look. Designs are original project graphics and do
not use third-party logos. The original candidate's obsolete source strip and exposed
playback controls are not reintroduced: valid time and keys remain in the title bar.

Targets:
- Integrated graphics: title bar, lower third, ticker.
- CP3A scenes: title bar, lower third, existing status/alert message bar.

The status target styles the existing CP3A unavailable/status message; it does not
create a separate alert crawl or restyle weather warning polygons. Weather key bin
colors remain data-driven. Font selection affects title/time/key text together, while
bar targets retain independent styles. Windows fonts use local fallback fonts when
unavailable; no remote font download is required.

Styles are saved per rundown scene. Integrated graphics use a new isolated
rbrwx-graphic-bar-styles-v1 key; CP3A styles extend the existing scene settings. Older
scenes and capture snapshots without styles render unchanged. Restore original
appearance removes only the selected target's style override. Selecting a preset
resets that target's color/font customization; text, size, position, visibility,
weather data and other bar targets remain unchanged.

Existing text editing and size/position controls continue to work. Title corners,
valid-time placement, optional blank subtitle, title keys, no source footer, operator
playback beside TAKE, and hidden-menu playback are preserved. The launcher update is
part of the required base and is retained.

Implementation: a pure style model, reusable gallery, and scoped CSS are shared by
integrated graphics and CP3A. CP3A's boundary validator allows exactly these two
presentation modules; it continues prohibiting unrelated host/provider coupling.
Live and static capture renderers use the same style resolver. Runtime dependencies
and native code are unchanged.

Verification includes style fallback/override tests, older-scene compatibility,
JSON snapshot round trips, full repository verification, and browser interaction
checks for the gallery, colors/fonts, target independence, scene persistence,
text editing, corner scaling and both playback locations. Weather network requests
are blocked during UI tests so temporary provider outages do not affect results.
Windows native popout behavior still requires the usual workstation acceptance;
the installer retains all Cargo/Tauri gates before promotion.
