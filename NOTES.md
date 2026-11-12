# Lorro Launcher — Notes

## v1.95.0 — Custom links are now game download sources

### What changed

- The game page button **Add custom link** no longer creates a separate library
  game. It saves the URL and an optional label as a source tied to the current
  catalogue game (`shop` + `objectId`).
- A game can now have its built-in repacks plus any number of custom sources.
  They are listed together in the repacks modal, with custom sources first.
  When a game has no built-in sources, its custom links are the download
  options.
- Custom sources can be edited (URL/label) and deleted with confirmation.
  They are persisted in Level DB and survive restarts.
- Installing from a custom source uses the existing `Downloader.Custom`
  pipeline: normal download record, extraction, executable detection and the
  usual "choose the .exe" prompt if needed.
- Legacy custom links that were stored as standalone `shop: "custom"` games are
  migrated to the matching catalogue game only when the normalized title match
  is unique and the URL is available in `custom-downloads.json`. Ambiguous or
  unmatched entries are left untouched. No user data is deleted; migrated legacy
  records are only hidden with `isDeleted: true`.
- The standalone custom-download launcher on the Downloads page is unchanged.

### Implementation map

- `src/main/services/custom-game-sources.ts` — list/add/update/delete,
  URL validation, de-duplication, legacy migration.
- `src/main/level/sublevels/custom-game-sources.ts` — `customGameSources`
  sublevel, keyed by `levelKeys.game(shop, objectId)`.
- `src/main/events/library/custom-game-sources.ts` — IPC handlers
  `getCustomGameSources`, `addCustomGameSource`, `updateCustomGameSource`,
  `deleteCustomGameSource`.
- `src/preload/index.ts` and `src/renderer/src/declaration.d.ts` — renderer
  bridge and types.
- `src/renderer/src/pages/game-details/modals/repacks-modal.tsx` — merges
  persisted sources with built-in repacks, edit/delete UI and the add/edit form.
- `src/types/custom-download.types.ts` — `CustomGameSource` and mutation result
  types.
- `src/main/index.ts` — runs `migrateLegacyCustomGames()` after `loadState()`.

### Verification

- `yarn typecheck` — node and web pass.
- `npx electron-vite build` — must pass before publishing.
- Manual check: add a link, restart, edit it, install from it, delete it, and
  confirm that no new library card is created.
