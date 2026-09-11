# RBRWX NEXT Standalone Broadcast Graphics

This package owns only three graphics:

- title bar
- lower third
- ticker

It is isolated from the RBRWX NEXT application, Broadcast Base, maps, providers, Tauri, and every other current module. Installing it adds one self-contained package directory and does not change the repository entry point or root package files.

## Current contract

- All graphics are off at startup.
- The Graphics menu has independent Title bar, Lower third, and Ticker switches.
- Every registered scene automatically receives a scene-title binding.
- The title bar can show the active scene name or a blank/manual title.
- Title bar size is controlled in the Graphics menu from 50% through 100%.
- RBR TW navy, purple, magenta, dark-panel, and white text colors are built in.
- The rendered graphics contain no drag marker, resize handle, remove icon, or selection outline.
- The title-bar hidden menu and PNG export are explicitly deferred.

## Standalone verification

```powershell
cd C:\Projects\RBRWX_NEXT\packages\rbrwx-broadcast-graphics
npm run verify
```

## Standalone visual preview

```powershell
cd C:\Projects\RBRWX_NEXT\packages\rbrwx-broadcast-graphics
npm run dev
```

Open the local URL printed by Vite. The title bar is initially off. Turn it on from the Graphics menu, switch scenes, try Blank / add text, and change Title bar size.
