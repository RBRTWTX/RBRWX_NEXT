# CP3A UI V2 — title-bar editing and hidden playback

Requested presentation correction to the CP3A integration candidate.

- Removes the exposed CP3A playback strip and the duplicate transport buttons under the map. The RBRTW hidden menu holds weather play/pause, step, loop and refresh; rundown transport remains available inside that menu.
- The main title row contains the title and valid time. No source or scene subtitle is inserted automatically. An optional subtitle appears only when the operator supplies text.
- Removes the bottom source bar. Provider and actual data-time diagnostics remain in the operator properties.
- Moves all CP3A legend keys inside the title bar. The title, time and keys share its scale and position.
- Four corner handles scale the title bar proportionally; dragging the bar repositions it. Handles appear on hover/selection in the editor and never in clean capture.
- Double-click title, time, subtitle, key labels, lower-third, status, storm-panel and feature-detail text to edit. Enter saves, Escape cancels. Empty edits are preserved. Text and layout persist per rundown item; reset controls restore automatic copy/time and default layout.
- Both Properties and Palettes tabs use the actual CP3A controls. The legacy graphics editor no longer appears as the editor for a separate, invisible title on these scenes.
- Clean popout uses the same saved copy/layout. Its hidden playback actions now control CP3A frames when a CP3A scene is active.

Editing time or status copy changes presentation only; source timestamps, expiration cutoffs, provider data and radar fallback behavior remain unchanged.

The pre-existing CP3A scope limitations remain. Native WebView2/build acceptance must run on Windows; this environment verifies frontend behavior and repository gates.
