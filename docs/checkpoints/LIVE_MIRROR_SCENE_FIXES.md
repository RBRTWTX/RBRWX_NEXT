# Live program mirror and scene polish

Based on clean checkpoint 84a824dea5a20de89ad10116e1ed5d972ea38435 (on air controls 1). Includes the compact on-air menu changes from the previous package.

## Program output

The popout receives the main program's rendered map pixels and passive overlay markup through the local native bridge. It no longer independently requests weather or rebuilds a separate map. Publications are capped at 20 per second, with one in flight at a time; the latest main-canvas state is used after each send. The popout preserves the source aspect ratio and letterboxes when necessary. Its optional hidden control menu remains local to that window. A feed-interrupted banner appears after three seconds without a new frame.

The RBRTW trigger follows the title position, with a gap beside the title and a fallback above/below when no side space exists. Main transport controls beside TAKE remain available.

## Scene fixes

- TOOLS > Reset scene edits restores titles, bars, objects and forecast defaults. It keeps imported asset files. Edits otherwise persist deliberately; startup does not silently discard saved work.
- Forecast text fits its object bounds. Seven-day cards have more caption space, and the generic map title no longer covers their built-in header.
- Canvas selection outlines, drag dots and resize marks are invisible; dragging, edge resizing and text editing still work.
- Front palette uses small recognizable icons; pending fronts use the same colored symbols as completed fronts.
- Futurecast Surface Setup supports editable operator fronts and an optional copy of current WPC analysis. Air Mass includes COLD, WARM and MOISTURE labels. These are editorial scenes, not automated forecasts of front positions.
- NWS severe watches use a supported request and distinguish no active features from unavailable data.
- Tropical feature ingestion recognizes NHC advisory time zones, normalizes storm names across point/cone products, and rejects stale features. Official cone/track geometry is retained.
- Tropical summary panel supports side resizing, corner scaling, and Alt-drag text sizing independently.
- Hidden menu Surge toggles official NWS storm-surge watches/warnings. It does not depict inundation depth or replace an evacuation map.

## Verification boundary

Browser checks use a simulated native bridge and deterministic weather fixtures. They cover live title/geometry changes while dragging, scene switching, no independent popout provider requests, forecast text fitting, invisible editing marks and reset recovery. Surface checks cover front drafting, labels, watch empty state, panel/text resizing and surge toggle. Contract tests cover watch requests and NHC parsing/geometry.

Windows WebView2, actual dual-window native performance and OBS recording still require a local smoke check. The transactional installer runs npm verification, locked Cargo check and Tauri build before promoting files. No files are deleted; no commit or push is performed.
