# RBRWX NEXT Broadcast Base Acceptance

Status: IN DEVELOPMENT — NOT ACCEPTED

## Isolation

- [x] Package has no Git SHA/base-commit requirement.
- [x] Existing `src/app/App.tsx` is not modified.
- [x] Existing `src/map/` is not modified.
- [x] Existing `src/styles.css` is not modified.
- [x] Existing `src-tauri/` is not modified.
- [x] Existing provider code is not modified.
- [x] Broadcast core imports only React and local Broadcast files.
- [x] RBRWX-specific map integration is isolated in `src/broadcast-host/`.
- [x] Broadcast has its own payload manifest, contract validator, state tests, and CI workflow.

## Broadcast state

- [x] Scene Library and Rundown are distinct.
- [x] Preview and Program are distinct.
- [x] Library selection does not alter Program.
- [x] Duplicate scene presets create distinct rundown instances.
- [x] Program item cannot be removed while on air.
- [x] Rundown supports reorder to beginning, middle, and true end.
- [x] Previous / Next respect bounds and Loop.
- [x] Play cannot enter a false playing state at a non-looping endpoint.
- [x] Editing future rundown items does not restart the current Program hold timer.

## Windows runtime / visual acceptance

- [ ] Existing MAP / SATELLITE rendering still works.
- [ ] Existing Roads / Cities / Counties / States controls still work.
- [ ] Scene Library appears on the left.
- [ ] Selected Scenes rundown appears across the bottom.
- [ ] Scenes can be added more than once.
- [ ] Rundown cards can be reordered to any position.
- [ ] Preview selection does not change Program.
- [ ] TAKE changes Program.
- [ ] Previous and Next/Skip work.
- [ ] Play / Pause work.
- [ ] Loop works.
- [ ] Cut / Dissolve / Fade command selections work without crashing.
- [ ] Repeated MAP/SATELLITE TAKES do not recreate the map or duplicate layers.
- [ ] Window resizing keeps Scene Library, map, controls, and rundown aligned.

Do not mark this Broadcast Base accepted until all Windows runtime/visual checks above pass.
