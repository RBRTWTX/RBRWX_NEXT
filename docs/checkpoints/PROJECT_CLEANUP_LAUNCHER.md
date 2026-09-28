# Project maintenance and desktop launcher

Audit base: 593a025cee0e78e1fd7c64cd07933ece9c9eb317 (ui v3), September 28, 2026.

## Scope and findings

The audit inventoried all 187 tracked files (13,026,356 bytes), checked exact-byte
duplicates, traced application imports/re-exports and worker URL entry points from
src/main.tsx, reviewed native entry/configuration/assets, both CI workflows,
package scripts/dependencies, integrity ownership and installer contracts.
No exact duplicate files or unresolved relative application imports were found.
All runtime dependencies have reachable consumers; no dependency versions changed.
This is a repository audit, not a scan of the operator's Windows Downloads directory.

| Area | Files at audit base | Disposition |
| --- | ---: | --- |
| Frontend | 59 | Remove one orphan config; retain runtime modules and contract/palette fixtures |
| Native | 11 | Retain; suppress release console window through the native entry point |
| Validation/tooling | 46 | Retain tests, installer, manifests and vendored parser with notices |
| Standalone graphics | 31 | Retain independent package, demo, lockfile and tests |
| Documentation | 23 | Retain acceptance/source provenance and checkpoint history |
| Operator asset instructions | 2 | Retain; never clear operator PNG/SVG folders |
| Root/configuration/CI | 15 | Retain; correct outdated root README and add launcher commands |

## Confirmed cleanup

- Delete src/current-weather/public-config.ts: its sole export has no import or
  other consumer anywhere in the repository. Its only external reference was its
  integrity entry. NOAA/NWS provider tests already verify keyless operation. The
  installer removes that entry through the existing manifest migration.
- Remove the unused sourceVisible setting/default and unreachable Source tray label
  from CP3A. Stored scenes remain compatible: unknown old JSON fields are harmless;
  no scene data or storage keys are reset.
- Remove the obsolete synoptic-touch-playback adjacent-panel CSS selector; UI V3 no
  longer renders that class. Playback beside TAKE and in the hidden menu is retained.
- Correct README's obsolete assertion that weather modules are not present.

## Items deliberately retained

- src/app/App.tsx is not the active entry, but two foundation/broadcast contract
  validators require this independent fallback. Removing it would weaken acceptance.
- src/broadcast/broadcastContract.json is consumed by validation.
- RadarScope1.pal is the owner's source palette and is compared against the embedded
  runtime palette by tests. It is not redundant disposable data.
- packages/rbrwx-broadcast-graphics is an independent documented package, not an
  accidental copy in the active import graph. Its retirement would be a separate
  product decision; this cleanup does not break that supported surface.
- The vendored TypeScript parser supports dependency-independent contract checks.
  Its license, provenance and notices must stay with it.
- docs/weather-keys/sources contains source evidence used by legend checks.
- Installer backups, Git history, user-created graphics, local application storage,
  scenes and operator settings are not deleted.

Generated node_modules, dist, target, gen and tsbuildinfo files are already ignored.
They are rebuildable caches, not obsolete source. This package avoids bulk deletion
of caches, which would prolong builds without improving application behavior.
No disk-space saving beyond the small confirmed orphan is claimed.

## Launch behavior

Launch RBRWX.cmd runs scripts/desktop/launcher.mjs. Create Desktop Shortcut.cmd
creates a per-user desktop shortcut with the existing app icon (including redirected
Windows Desktop folders). It uses PowerShell internally for shortcut creation only;
there is no command for the operator to type and no administrator requirement.
An existing differently targeted shortcut is not overwritten.

The launcher fingerprints application source, native inputs, tooling, configuration
and lockfiles, excluding generated native output. A matching executable with the
recorded SHA-256 is launched directly. First launch, changed source, missing or damaged
executable triggers npm ci, npm run verify, cargo check --locked and Tauri's no-bundle
release build. Build errors keep the window open and do not launch stale weather UI.
Source changes during a build prevent publication. A build lock prevents concurrent
launcher builds. Completed executables are copied to ignored .rbrwx-launcher and an
atomic current.json update selects the new one; prior copies remain available for
manual recovery. No previous version is launched automatically after an error.

Release builds now use the Windows GUI subsystem, avoiding a persistent console
behind the native window. Debug development behavior remains unchanged. Subsequent
normal launches may briefly show the command launcher while checking source hashes;
no terminal or development server stays running with the application.

The shortcut depends on the repository staying at the same path and Node remaining
installed. This is a local developer-workstation launcher, not a standalone MSI.
Build dependencies are unchanged. Application identifier and WebView storage origin
are unchanged, preserving local scenes/settings.

## Verification and limits

Four executable-state tests cover source/new-file/lockfile changes, CRLF equivalence,
ignored output and operator assets, missing/damaged executable, failed publication,
concurrent source edits, malformed state and path traversal. Run them as part of
npm run verify. Existing UI, weather, installer, integrity, TypeScript and production
build checks remain enabled. The Windows phase installer still requires its real
Cargo/Tauri gates before source promotion; no gate is bypassed.

This Linux environment cannot validate Windows shortcut COM or run the Windows
executable. On the workstation: install the package, create the shortcut, launch once,
then close and relaunch. Confirm the second launch needs no server; preview/TAKE,
both playback locations, hidden-menu controls and saved titles/settings still work.
