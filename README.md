# WebOS

A desktop operating system simulated in the browser: draggable/resizable windows, a virtual filesystem, and switchable shells (Modern, Retro, macOS-style).

```sh
npm install
npm run dev     # http://localhost:5173  (add ?theme=retro or ?theme=mac)
npm test        # Vitest: filesystem, terminal, calculator
npm run build
```

## Layout

- `src/core/`: OS kernel. `vfs.ts` (in-memory filesystem behind a `StorageAdapter`), `windowManager.ts`, `appRegistry.ts`, `themeManager.ts`, `os.ts`, `seed.ts`
- `src/shells/`: swappable looks. Each provides a desktop, launcher, window chrome and screen insets
- `src/apps/`: Files, Text Editor, Terminal, Calculator, Paint, Settings. Apps only use `AppContext` and never depend on a shell
- `src/ui/`: shared DOM helper, icons, menus, dialogs, desktop icon surface
- `src/styles/tokens.css`: per-theme CSS variables

## Extending

- **New app:** export an `AppDefinition` and register it in `src/main.ts`.
- **New shell (e.g. iOS):** implement `Shell` in `src/shells/shell.ts`, add tokens for its `[data-theme]`, register it in `main.ts`.
- **Persistence:** implement `StorageAdapter` (`load`/`save` of the node list, e.g. with localStorage) and pass it instead of `MemoryAdapter`.
