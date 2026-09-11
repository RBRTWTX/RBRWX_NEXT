# PRE-0.3.0 Broadcast Graphics Acceptance

This is a standalone package checkpoint. It is not connected to the RBRWX NEXT runtime.

## Automated

- package structural contract passes
- package-local TypeScript typecheck passes
- package-local library build passes
- scene-title and blank-title state tests pass
- independent visibility-toggle tests pass
- title scaling tests pass
- render output contains no editor marker, resize handle, or remove icon
- standalone Vite preview build passes

## Manual preview

1. Start `npm run dev` inside `packages\rbrwx-broadcast-graphics`.
2. Confirm no title bar, lower third, or ticker appears on startup.
3. Turn on Title bar and confirm it says `Local Radar`.
4. Select `Satellite` and confirm the title changes to `Satellite`.
5. Add a new scene and confirm its title automatically appears.
6. Select `Blank / add text`, first leave it empty, and then enter custom text.
7. Change Title bar size and confirm the bar scales from the Graphics menu.
8. Turn Lower third and Ticker on and off independently.
9. Confirm no bar displays drag, resize, remove, or selection markers.

The hidden title-bar menu and PNG export are not part of this checkpoint.
