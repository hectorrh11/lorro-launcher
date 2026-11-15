# Lorro Launcher — Notes

## v1.98.0 — Collection styles in the sidebar and library

### What changed

- Each game now shows the collections it belongs to. A collection can set a
  title colour, an emblem and a dimmed grey title, and the game uses the first
  collection that has any of those set.
- New `src/shared/collection-styles.ts`: `CollectionStyleMap`,
  `CollectionVisualStyle`, `CollectionStyleEmblem`, `COLLECTION_STYLE_EMBLEMS`
  (none, trophy, gem, star, check, clock, abandoned, package),
  `COLLECTION_STYLE_COLOR_PRESETS`, `getDefaultCollectionStyle` (name-based
  defaults), `resolveCollectionStyle`, `resolveGameCollectionStyle`,
  `updateCollectionStyle` and `clearCollectionStyle`.
- Defaults by collection name: `Terminado`/`Finished`/`100%` → green trophy,
  `En proceso`/`In progress` → ochre clock, `Abandonado` → crossed-out grey,
  `No instalado` → grey gem.
- Style persisted in `userPreferences.collectionStyles` and resolved through the
  new `useGameCollectionStyle` hook (redux `state.collections.items` +
  `state.userPreferences.value.collectionStyles`).
- Sidebar (`sidebar-game-item.tsx`): emblem before the title, title colour and a
  dimmed variant. The label keeps its ellipsis behaviour.
- Library `large` view (`library-game-card-large.tsx`): chip with the collection
  name + emblem next to the achievements row and a coloured title when there is
  no logo image.
- Library `compact`/`grid` view (`library-game-card.tsx`): emblem badge over the
  cover, a 3px colour stripe on the left edge and a gray/darkened cover when the
  collection is dimmed.
- Settings → Collections (`settings-collections.tsx`): per-collection colour
  (Auto, palette or free `input[type=color]`), emblem select, dimmed checkbox
  and a reset button. New `collections` settings category and
  `SettingsCategoryId`.
- i18n: new `settings.collections*` and `settings.collection_emblem_*` keys in
  `en` and `es`.

### Verified

- `tsc --noEmit` with `tsconfig.node.json` and `tsconfig.web.json` both clean.
- `electron-vite build` + `scripts/verify-main-bundle.mjs` clean.
- No IPC, API or backend schema changes: everything is a user preference.

### Known limits

- Only the first decorated collection is shown per game (no stacked emblems).
- Big Picture cards still show logos only; no collection decoration there.
- The collection chip appears only in the `large` library view.

## v1.97.2 — Visual restyle: quiet, tool-like interface

### What changed (visual only)

- Design tokens rewritten in `scss/globals.scss`: warm neutral surfaces
  (`#151311` bg, `#100e0d` deep, `#1b1917` panel, `#211e1b` raised, `#272320`
  hover), text `#ece7df` / `#bcb5aa` / `#8d857a`, borders
  `rgba(255,255,255,.09)` and `.16`, one ochre accent `#c08b52`
  (`#d7a878` soft, `#a9743f` secondary, `#9a938a` tertiary), all glows
  transparent. New radius tokens `$radius-xs/sm/md/lg` (4/6/8/10px) and a
  single system font stack for both `$font-body` and `$font-display`.
  `lorro-gradient`, `lorro-text-gradient`, `lorro-surface` and
  `platinum-gradient` now output flat fills.
- `scss/themes.scss`: default accent, background overlay, light theme, glass
  and title-bar tints moved to the neutral palette; Golden/Esmeralda/Rubí keep
  their hues with transparent glows; `--color-primary` now maps to the accent.
- Shared components restyled flat: button, badge, game card, hero, fields,
  checkbox/radio, sidebar, header, toast, dropdown/context menu,
  vertical cover card, window title bar. Hover is a small background/border
  shift, transitions 0.14s, focus is a 2px accent outline, no scale or glow.
- Page sweeps removed decorative gradients from home, catalogue, library,
  downloads, achievements, settings (incl. store, appearance, advanced),
  game details, launcher, custom download launcher and error fallback.
  Kept only functional scrims under text, skeleton shimmers, the image-crop
  checkerboard, the classics ring and the profile metal disc; purchased
  animated wallpapers in `lorro-cosmetics.scss` are untouched.
- `#lorro-feedback-button` (inline styles in `lib/lorro-feedback.ts`) is flat,
  uses the system font and sits at `bottom: 56px` so it no longer overlaps the
  bottom bar; `.home__customize` lost its `-28px` margin so the hero no longer
  covers "Personalizar inicio".

### Verification

- `yarn typecheck` — node and web pass.
- `npx electron-vite build` — passes (main/preload/renderer).
- `node scripts/verify-main-bundle.mjs` — 12 chunks verified.
- `git diff --stat` — 65 files, +480/-718; renderer changes are SCSS plus the
  inline styles in `lorro-feedback.ts`; no TSX, hooks, IPC, routes or strings
  changed. Manual visual review on Windows is still pending.

## v1.97.1 — Custom-link downloads failed with "Invalid parallel download limits"

### Root cause

- 1.95.0 turned custom links into persisted download sources and made the
  custom downloader request `parallelRangeConnections: 32`, but the segmented
  HTTP engine (`parallel-range-download.ts`) still capped connections at 16 and
  threw `Invalid parallel download limits` for anything above it.
- Every custom-link game download therefore failed before the first byte:
  `[JsHttpDownloader] Download error: Error: Invalid parallel download limits`
  → `[DownloadManager] Download failed for <game>: Invalid parallel download
  limits`. With no bytes transferred nothing populated the download record
  (size, speed, progress), so the download page showed an empty/error entry.

### Fix

- `MAX_PARALLEL_CONNECTIONS` is now exported and raised to 32, matching the
  custom downloader, the documented limit and the 1.96.0 notes.
- Added `normalizeParallelConnectionCount()`: non-finite counts fall back to the
  default 4, and any other value is clamped to 1–32. `downloadParallelRanges`
  clamps instead of throwing, so a bad value from settings or a remote service
  can no longer kill a download. The worker pool uses the clamped value.
- `download-manager.ts` now references `MAX_PARALLEL_CONNECTIONS` instead of the
  duplicated literal `32`, so the two limits cannot drift again.

### Verification

- `node --test scripts/parallel-range.test.mjs` — 4/4 pass with a real local
  HTTP server serving 1.5 MB in 256 KB ranges: 32 connections completes and the
  file is byte-identical, 4096 connections is clamped instead of failing, a
  single connection works and the range metadata is cleaned up.
- `yarn typecheck`, `npx electron-vite build` and
  `node scripts/verify-main-bundle.mjs` pass.
- Manual check: add a custom link to a catalogue game, start the download and
  confirm size/speed/progress appear and the file completes.

## v1.97.0 — Fix the black window shipped in 1.96.0

### Root cause

- `electron-vite` (4.0.1) injects a "CommonJS Shims" banner into ESM chunks
  with a regex that finds the *last* occurrence that looks like
  `import … from "…"`. A log message introduced in 1.96.0,
  `"[GameZipImport] The moved ZIP was kept after a failed import"`, ends with
  the word `import` right before the closing quote, so the regex matched
  `import");` and inserted the shim **inside** the following string literal.
- The broken chunk is the dynamic `./events` chunk. `loadState()` does
  `await import("./events")` and threw `SyntaxError: Invalid or unexpected
  token`, so `loadState()` aborted before registering any IPC handler. The
  renderer never mounted and only the imperative feedback button (created
  outside React) stayed visible: the reported black window with the comments
  button.

### Fix

- Reworded the log message to `"[GameZipImport] The moved ZIP was kept because
  the import failed"`, so no string ends with `import` before a quote.
- Added `scripts/verify-main-bundle.mjs` (`yarn verify:bundle`, also part of
  `yarn build`): it runs `node --check` on every `out/main/*.js` chunk and fails
  if a chunk has more than one CommonJS shim or its shim sits beyond the import
  block. This catches the same class of packaging corruption before shipping.

### Verification

- `yarn typecheck` passes; `yarn build` builds and `verify:bundle` reports
  `Verified 12 main chunks.`
- `node --check` on all main chunks passes (before the fix
  `index-CppkQbkR.js` failed at line 7345).
- Dev launch of the built app shows the renderer booting normally
  (`Initializing ... Resources`, profile `put /profile/games/...` 200) and no
  `No handler registered for 'getVersion'` error.
- Users on 1.96.0 must install 1.97.0 manually once: the broken version cannot
  self-update because its main process never finishes starting.

## v1.96.0 — Import a catalogue game from a ZIP

### What changed

- A catalogue game that is not installed now shows **Import from ZIP** on its
  game page. The native file picker accepts ZIP files; cancelling is a no-op.
- The import is attached to that same catalogue game (`shop` + `objectId`).
  It does not create a second library entry. If the catalogue game is not in
  the library yet, the normal `addGameToLibrary` call runs first.
- The options dialog shows the archive name, size, entry count, estimated
  extracted size, free space and destination root. The user chooses **Copy**
  or **Move** and can toggle **Extract automatically** and **Delete ZIP after
  extracting** (the second is disabled when extraction is off).
- Copy never touches the original file. Move first transfers the ZIP and only
  removes the source after the transfer succeeds; a failed transfer keeps the
  original. A conflicting destination ZIP is renamed to a temporary backup and
  restored if the transfer fails.
- If extraction is disabled, the ZIP is kept, the game is not marked as
  installed, and **Extract downloaded ZIP** appears on the game page. The same
  ZIP can be extracted later from the Downloads page.
- The ZIP is deleted after extraction only if the option was enabled and the
  extraction was verified. Default preference still applies to extraction
  started later from the Downloads page.
- Real progress is emitted through `on-game-zip-import-progress`: preparing,
  copying/moving, extracting (with the current file), verifying, detecting the
  executable and done. The operation is asynchronous and cancellable.

### Safety and error handling

- `inspectGameZipImport` lists the archive with 7-Zip before importing and
  rejects empty/corrupt archives, password-protected archives and entry names
  that are absolute, contain a drive letter or contain a `..` segment.
- Disk space is checked when `statfs` is available, including the ZIP copy when
  the file is copied or moved across volumes.
- Existing destination ZIP/folder conflicts require explicit confirmation
  before overwrite.
- After extraction every archive entry is checked inside the extraction root
  and must be a regular file. Symbolic links created by the archive are
  rejected as unsafe.
- Redundant nesting (`Game/Game/Game.exe`) is flattened only while the folder
  contains exactly one directory and no files, so layouts such as
  `Game.exe` + `data/` are never rearranged.
- A failed or cancelled import removes the partial extraction folder, resets
  `extracting` to `false`, keeps the downloaded ZIP, and never sets an
  `executablePath` unless executable detection actually succeeded.
- Executable detection, binding, the "choose another .exe" prompt, shortcuts
  and installed size all reuse `GameFilesManager.setExtractionComplete`.

### Implementation map

- `src/types/zip-import.types.ts` — inspection, options, progress, result and
  error types.
- `src/main/services/game-zip-import.ts` — validation, copy/move, extraction,
  verification, flattening, download record and cancellation.
- `src/main/helpers/flatten-directory.ts` — safe redundant-folder flattening.
- `src/main/events/library/game-zip-import.ts` — `inspectGameZipImport`,
  `importGameFromZip`, `cancelGameZipImport`.
- `src/main/services/7zip.ts` — `extractFile` accepts an optional
  `AbortSignal`; cancelling kills the 7-Zip child process.
- `src/main/services/game-files-manager.ts` — deferred ZIP extraction also
  flattens redundant nesting.
- `src/renderer/src/pages/game-details/modals/zip-import-modal.tsx` and
  `.scss` — options dialog, progress UI and the game-page buttons.
- `src/renderer/src/pages/game-details/hero/hero-panel-actions.tsx` — adds the
  import action for games without an executable.
- `src/preload/index.ts` and `src/renderer/src/declaration.d.ts` — IPC bridge
  and renderer types.

### Verification

- `yarn typecheck` — node and web pass.
- `npx electron-vite build` — passes.
- `node --test scripts/zip-import.test.mjs` — 10/10 pass. The integration test
  bundles the real import service with stubbed Level DB/window services and the
  real 7-Zip binary, then covers Copy/Move × extract/keep, corrupt ZIP,
  `../` ZIP Slip rejection, overwrite confirmation, cancellation and the
  absence of a second game entry.
- Manual check: import with Copy and Move, extract automatically on and off,
  cancel during transfer and extraction, import a corrupt ZIP and a ZIP with a
  conflicting folder, then extract a deferred ZIP from the game page and from
  Downloads.

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
