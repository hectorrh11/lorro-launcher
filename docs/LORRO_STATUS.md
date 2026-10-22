# Lorro Launcher — Status

Lorro Launcher is an independent desktop game launcher built on the open-source
**Hydra Launcher** codebase (MIT, © Los Broxas / Hydra Launcher contributors).
It keeps the original architecture where useful and ships its own identity,
release channel, installer and data folder. This document tracks what has been
completed, what has been verified, what is still pending, and what is required
to distribute the app.

**Current status (estado tras 1.83.0):** **1.83.0** is the latest
public release for Windows, Ubuntu/Debian and Arch Linux. It expands the
LorroPoints store with avatar frames, profile titles and animated wallpapers,
adds home customization to hide the hero and catalogue for a clean background,
and keeps the image/video background picker with validation, plus everything
from 1.77.0-1.82.0:
real playtime on library cards, LorroPoints based on achievement points, the
Golden/Esmeralda/Ruby theme store with real window transparency, a dedicated
Clips page with global hotkey and system audio, automatic executable detection,
default collections, Linux packaging, and the removal of the last commercial
surface and the launch-profile system.

---

## 1. Completed changes

### 1.1 Brand identity and assets

- Lorro's mark is generated from the user-provided image
  `resources/lorro/lorro-logo-source.jpg`, converted to a violet duotone,
  center-cropped, and framed in a rounded square with a violet glow
  (`scripts/generate-lorro-brand.mjs`, run with `yarn brand`).
- Generated assets under `resources/lorro/`:
  - `lorro-mark-master.png` — 1024×1024 master mark.
  - `lorro-mark-256.png` — UI/PNG mark.
  - `lorro-logo-horizontal.svg` — mark + `LORRO` / `LAUNCHER` wordmark.
  - `lorro.ico` — Windows icon (multi-size).
- In-app glyph `src/renderer/src/assets/icons/lorro.svg` (55×49 viewBox, embedded
  256 px raster) replaces the old Hydra mark across all 14 renderer usages
  (achievements, chat, game-launcher, notifications, etc.).
- Horizontal logo copied to `src/renderer/src/assets/brand/lorro-logo-horizontal.svg`
  for the About screen.
- `scripts/generate-lorro-icons.mjs` (run with `yarn icons`, which first runs
  `yarn brand`) renders from the master PNG: `resources/icon.png`, `build/icon.png`,
  `build/icons/*`, `build/icon.ico`, `build/icon.icns`,
  `build/installerSidebar.bmp`, `resources/tray-icon(-dark).png`,
  `resources/lorro/lorro-mark-256.png`, `resources/lorro/lorro.ico`.

### 1.2 Theme and GUI

- `src/renderer/src/scss/globals.scss` rewritten to a dark, premium gaming palette
  (violet `#8b5cf6`, indigo `#4f46e5`, cyan `#22d3ee`) with new surfaces, borders,
  states, shadows, gradients and mixins (`lorro-gradient`, `lorro-text-gradient`,
  `lorro-surface`). Legacy variables (`$brand-teal`, `$brand-blue`, `$platinum-cyan`,
  …) are aliased so existing component SCSS keeps working.
- `src/renderer/src/app.scss` rewritten: animated layered background, refined
  scrollbars, Space Grotesk display headings, Noto Sans body, focus/selection
  states, 38px title bar with the Lorro brand block.
- Space Grotesk display font imported in `src/renderer/src/main.tsx`.
- Title bar rebranded in `src/renderer/src/app.tsx` and
  `src/renderer/src/components/window-title-bar/window-title-bar.tsx`.
- Bottom panel cloud gradient re-tinted; big-picture accent changed from red to
  violet; game-launcher logo badge adapted to the gradient glyph.
- HTML titles updated (`Lorro Launcher`, `Lorro Big Picture`), theme-editor window
  title updated.
- Download speed chart: hovering a bar now shows a tooltip with the speed (MB/s)
  and how long ago it was sampled; an "Average" stat was added with a selector for
  total / last hour / last 30 / 15 / 5 minutes. The chart now redraws on demand
  (removed the continuous `requestAnimationFrame` loop and per-frame canvas
  reallocation, added a ResizeObserver), reducing idle CPU/GPU use while a download
  runs. Timestamped speed samples are kept in the download slice (1 h window,
  capped) — see `download-slice.ts`, `constants.ts` and `download-group.tsx`.

### 1.3 Product name and metadata

- `package.json`: `name` `lorro-launcher`, `description`, `author`
  `Lorro Launcher contributors`, contributor credit to the original project,
  `license` MIT, `icons` script, `--publish never` on the build scripts.
- `electron-builder.yml`: `appId` `com.lorro.launcher`, `productName`
  `Lorro Launcher`, `copyright`, `win.executableName` `Lorro Launcher`,
  NSIS `artifactName`/`shortcutName`/`uninstallDisplayName`, installer resources
  (icon + sidebar), portable artifact name, Windows icon, `x-scheme-handler/lorro`,
  and `publish: null`.
- `build/installer.nsh` rewritten: uninstall removes only the updater cache and
  never deletes personal user data.

### 1.4 Data isolation and migration

- `src/main/constants.ts`: user data now lives in `%APPDATA%\Lorro Launcher`
  (dev override via `MAIN_VITE_USER_DATA_PATH`); level DB renamed to `lorro-db`.
- `src/main/helpers/lorro-data-migration.ts`: optional, explicit migration from a
  legacy `%APPDATA%\hydralauncher` folder (only when Lorro data is empty), with a
  clear dialog, a marker file, non-destructive copy, and a "keep both separate"
  default. The original Hydra data is never modified.

### 1.5 Protocol, updater and distribution safety

- `src/shared/brand.ts` centralizes `APP_NAME`, `APP_ID`, `APP_PROTOCOL`
  (`lorro`) and the legacy protocol (`hydralauncher`).
- Deep links: Lorro registers and accepts `lorro://` **and** the legacy
  `hydralauncher://` for backwards compatibility (auth, run, steam-connected,
  run/install-source/profile/install-theme).
- Auto-update is **disabled** unless `MAIN_VITE_UPDATE_REPOSITORY` (`owner/repo`)
  is configured; the app never identifies as a Hydra update and never contacts the
  original repository. `src/main/services/update-manager.ts` exposes
  `isUpdateChannelConfigured`; a friendly header notice replaces silent failure.
- New IPC `getAppInfo` returns app name, protocol, version, update-channel state
  and the user data path for the About screen.

### 1.6 Settings / About

- New Settings → **About** category (`settings-about.tsx` + styles + i18n keys in
  en/es): Lorro logotype, version, product description, attribution to the
  original project, data folder with "open folder" action, update-channel status
  and license/third-party notices.

### 1.7 Documentation

- `README.md` rewritten for Lorro Launcher (identity, features, data location,
  attribution, dev/build instructions, distribution variables).

### 1.8 Runtime fixes (from user testing)

- **Backend endpoints required.** Lorro reuses the upstream API for the
  catalogue, accounts/login, download sources, reviews and cloud saves.
  Those URLs were previously supplied only by CI, so without them the app showed
  axios `Invalid URL` errors and the login/sources features did nothing. A repo
  `.env` (gitignored) now provides the documented public production endpoints, and
  `.env.example` documents every variable. Without these, login, catalogue and
  sources do **not** work (a compatible self-hosted backend can be substituted).
- **Startup crash fixed.** `src/main/constants.ts` computed
  `import.meta.env.MAIN_VITE_API_URL.includes("staging")`; when the variable was
  undefined this threw before logging and produced the
  `Cannot read properties of undefined (reading 'includes')` main-process error.
  Now guarded with `(… ?? "")`. `getCloudIframeUrl` also guards a missing checkout
  URL.
- **Button contrast fixed.** The base `.button` used a near-white background with
  no explicit text color (white-on-white); it now sets
  `color: globals.$background-color`.

### 1.9 Custom-link downloads

- New general-purpose download manager (`src/main/services/custom-download-manager.ts`)
  accepts any direct `http`/`https` link, independent of the repack/Hydra-Cloud
  pipeline. It never bypasses access controls: it only fetches a URL the user
  supplies.
- Features: sequential queue (one active transfer to stay lightweight), HTTP
  Range resume, pause/resume/cancel/remove, persisted state in
  `<userData>/custom-downloads.json`, sanitized and de-duplicated file names,
  destination folder selection, speed/byte progress, and graceful handling of
  HTML error pages / interrupted transfers.
- Link validation before starting: it probes the URL (HEAD, then a ranged GET),
  rejects unreachable links, HTTP errors, JSON and HTML error pages, and reports
  empty (0 byte) or stalled transfers instead of showing false hope. Distinct
  messages for timeouts, unreachable hosts and servers that stop sending data.
- Optional "add to my library" on completion creates a `custom` library entry
  (and prefills the executable for `.exe`/`.bat`/`.cmd` files).
- UI: `CustomDownloadLauncher` (button + modal + progress list) is shown on the
  Downloads page and inside the game's download-options modal. Starting from the
  game page now shows the live progress card (percent, bytes/total, speed, ETA)
  right in the modal plus a "View in Downloads" shortcut, instead of only a
  toast; the Downloads page groups transfers into "In progress" and "Completed".
  i18n keys added in English and Spanish.
- IPC: `startCustomDownload`, `getCustomDownloads`, `pauseCustomDownload`,
  `resumeCustomDownload`, `cancelCustomDownload`, `removeCustomDownload`,
  `on-custom-download-progress`, `getExternalDownloadManager`,
  `openDownloadInExternalManager`.
- Multi-connection (segmented) downloads: when the server supports HTTP Range
  requests and the file is large, the transfer is split across up to 16 parallel
  connections (default 8, configurable per download), each writing to its own
  offset of a pre-allocated file. This mirrors the "dynamic segmentation" that
  makes dedicated download managers faster on throttled hosts. Servers that do
  not support ranges transparently fall back to a single connection, and
  interrupted segmented transfers resume from the saved segment map. Implemented
  in `custom-download-manager.ts` (`downloadSegmented`, `writeAt`,
  `supportsRanges`); verified end-to-end: a 6 MiB file was fetched with 6 parallel
  range requests that completed at the exact byte size.
- External download-manager handoff: `src/main/helpers/external-download-manager.ts`
  detects an installed download manager (Internet Download Manager via its
  `/d URL /p DIR /f NAME /n` command line; Neat Download Manager and Free Download
  Manager via a clipboard-then-launch fallback) and hands the link over. Neat
  Download Manager has no documented command-line interface, so it is started and
  the link is placed on the clipboard for its own capture; IDM is passed directly.
  The UI shows "Copy link" always and "Open in <manager>" when one is detected.
  No access control is bypassed: it only forwards a URL the user already has.

### 1.10 Resource usage

- Main window uses explicit `backgroundThrottling` and disabled spellcheck.
- Windows occlusion calculations are disabled to avoid unnecessary renderer
  wake-ups while the window is hidden.
- Custom downloads use a single active transfer, throttled 500 ms progress IPC
  and no idle timers; interrupted transfers are saved as paused instead of
  restarting on launch.
- Added a global `prefers-reduced-motion` rule that disables animations and
  transitions.
- Chromium switches: `enable-low-end-device-mode` and a capped V8 heap
  (`--max-old-space-size=512 --max-semi-space-size=8`).
- The old cloud checkout modal/iframe was removed together with the commercial
  surface; `window.electron.openCheckout()` now opens the user's GitHub profile.
- The WorkWonders widgets (help/changelog/feedback iframes) are initialized only
  on real interaction (or after a fallback timer) instead of at startup, so an
  idle launcher does not keep their renderer processes alive.
- Lazy/async image decoding for library, home, download cards and thumbnails.
- Measured (idle, `dist/win-unpacked`, Working Set across all Lorro processes):
  **~1.26 GB / 7 processes before** → **~0.92 GB / 5 processes after**. An
  Electron app is multi-process (browser + renderer + GPU + network + crashpad);
  a total under 500 MB is not achievable while keeping the full feature set, but
  the idle footprint is now roughly a quarter lower, and stays lower while the
  help/cloud extras are unused.

### 1.11 Publication repository and auto-update activation

- Publication target: **`github.com/hectorrh11/lorro-launcher`** (public).
  Configured in `electron-builder.yml` (`publish: provider: github, owner:
hectorrh11, repo: lorro-launcher`) and in `.env`
  (`MAIN_VITE_UPDATE_REPOSITORY=hectorrh11/lorro-launcher`,
  `RENDERER_VITE_RELEASES_URL=https://github.com/hectorrh11/lorro-launcher/releases/latest`).
- The packaged app contains `resources/app-update.yml` with the same provider, so
  installed clients check this repository for new versions.
- Latest public version is **1.82.0**; `update.txt` at the repository root is the
  detailed, user-facing changelog and must be updated with every release.
- Publishing a new version:
  1. Make the changes and bump `version` in `package.json` (e.g. `1.1.0`).
  2. Update `update.txt` with a detailed changelog entry.
  3. Build + publish Windows (must run from a path without `$`, see section 3
     item 1):
     `$env:GH_TOKEN = gh auth token; npx electron-builder --win --publish always`
  4. Build + publish Linux from WSL: `npx electron-builder --linux --publish always`
     (AppImage, `.deb`, `.pacman` and `latest-linux.yml` are attached to the same
     draft release).
  5. **Publish the release** (it is created as a draft):
     `gh release edit v1.1.0 --repo hectorrh11/lorro-launcher --draft=false --latest`.
  6. Verify `latest.yml` and `latest-linux.yml` under
     `releases/latest/download/` return HTTP 200 and point to the new version.
- Verified for 1.0.0: release `v1.0.0` is public (`draft:false`, `latest`), assets
  include `latest.yml`, and `https://github.com/hectorrh11/lorro-launcher/releases/latest/download/latest.yml`
  returns HTTP 200.
- Note on version numbers: clients only accept updates whose version is **greater**
  than the installed one. Any installation older than `1.0.0` must install the
  current setup once; from `1.0.0` onward in-app auto-update works.

### 1.12 Current feature state (1.83.0)

- **Real playtime on library cards**: `LibraryGame.lorroPlaytimeMs` is computed
  from `src/main/services/session-stats.ts` when the library is listed, shown on
  the cards and refreshed when a game session ends.
- **LorroPoints**: `src/main/services/lorro-points.ts` adds the real
  `achievement.points` value of each unlocked achievement. The summary
  (`earned`, `spent`, `balance`, `exact`) is exposed via
  `getLorroPoints`. Because `AchievementMemoryStore` lives in memory, the balance
  can show as estimated (`exact: false`) after a restart until achievements sync.
- **Theme store**: **1.82.0** adds a dedicated `store` category in Settings
  (`settings-store.tsx`) with the balance, earned/spent totals and the
  purchasable **Golden** (300), **Esmeralda** (600) and **Rubí** (900) accents
  defined in `src/shared/lorro-themes.ts`, bought through `purchaseLorroTheme`
  and applied immediately. Locked themes in Appearance and the "LorroPoints
  store" button navigate to this category. Real window transparency on Windows
  is implemented by `WindowManager.setRealWindowTransparency`, which recreates
  the `BrowserWindow` with `transparent: true` and
  `backgroundColor: "#00000000"` and persists `realTransparentWindow`.
- **Background picker**: separate image and video buttons call
  `importBackgroundFile("image" | "video")`, videos are validated with
  `canPlayVideoSource` (`lib/media-support.ts`) and unsupported files are
  removed with a clear toast. Supported: JPG/PNG/WebP/AVIF images and MP4
  (H.264)/WebM/MOV/M4V videos; `.mkv` is no longer offered.
- **Expanded store (1.83.0)**: `src/shared/lorro-cosmetics.ts` defines 7 avatar
  frames, 6 profile titles and 6 animated wallpapers. Purchases go through
  `purchaseLorroItem`, ownership persists in `ownedLorroCosmetics`, and frames
  and titles are equipped in `lorroFrame`/`lorroTitle` and rendered in the
  sidebar and own profile. Wallpapers are applied as an appearance `preset`
  without copying files.
- **Home customization (1.83.0)**: the home page exposes a "Customize home"
  panel backed by `homeHideHero`, `homeHideCatalogue`, `homeHideCategories` and
  `homeHideRandom`. Hiding the catalogue also stops its catalogue and random
  game requests.
- **Commercial surface removed**: subscription modal, paywall banners, achievement
  and profile upsells, gift modal, cloud-ring, subscription slice and
  `allow_cloud_gifts` are gone. `openCheckout()` opens the user's GitHub profile
  and "support the project" links there; no Hydra/Lorro Cloud ads remain.
- **Launch profiles removed**: the profile service, IPC, types and UI were
  deleted. Per-profile save/config isolation is discarded and must not return.
- **Independent README**: presents Lorro Launcher as an independent launcher with
  a Releases section; attribution to the original project is kept at the end.

---

## 2. Tests and verification performed

> The rows below record the initial rebrand/1.0.0 verification cycle. Version
> strings, artifact names and sizes are historical; the current public release is
> 1.82.0.

| Check                           | Command                                                                                            | Result                                                                                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node typecheck                  | `yarn typecheck:node`                                                                              | PASS                                                                                                                                                |
| Web typecheck                   | `yarn typecheck:web`                                                                               | PASS                                                                                                                                                |
| Unit tests                      | `yarn test`                                                                                        | 2215/2244 pass — 29 pre-existing Windows/path failures, none related to the rebrand (path separators, EPERM temp cleanup, etc.)                     |
| Production build                | `yarn build`                                                                                       | PASS (`out/` generated)                                                                                                                             |
| Icon generation                 | `yarn icons`                                                                                       | PASS (ico/icns/bmp/png generated from the SVG source)                                                                                               |
| Windows packaging               | `npx electron-builder --win --publish never`                                                       | PASS — `lorro-launcher-4.1.6-setup.exe`, `lorro-launcher-4.1.6-portable.exe`                                                                        |
| Installer metadata              | version info inspection                                                                            | `ProductName` = `Lorro Launcher`, `CompanyName` = `Lorro Launcher contributors`, `ProductVersion` = 4.1.6, copyright present, custom icon + sidebar |
| Launch smoke test               | start `win-unpacked\Lorro Launcher.exe`                                                            | Process started and stayed alive (no crash)                                                                                                         |
| Custom-link download            | IPC call in the running packaged app (local HTTP server, 3 MB file)                                | Completed, file size matched exactly (3,145,728 bytes)                                                                                              |
| Link validation                 | Probe of empty/HTML/JSON/unreachable links                                                         | Rejected with clear messages (no false "started")                                                                                                   |
| Memory footprint                | Working Set of all `Lorro Launcher` processes (idle)                                               | ~1263 MB / 7 procs before → ~924 MB / 5 procs after                                                                                                 |
| Segmented download              | IPC call in the running packaged app (local HTTP server, 6 MiB file, 8 connections, Range support) | Completed; 6 parallel range requests; exact 6,291,456 bytes                                                                                         |
| External manager IPC            | `getExternalDownloadManager()` in the packaged app                                                 | Returns the detection object; `openDownloadInExternalManager` exposed (no manager installed on the test PC)                                         |
| Installers rebuilt              | `npx electron-builder --win --publish never` (clean path)                                          | PASS — `lorro-launcher-4.1.6-setup.exe` (195.9 MB), `-portable.exe` (195.3 MB)                                                                      |
| Linux packaging (1.81.0)        | `yarn build:linux` in WSL Ubuntu                                                                   | PASS — AppImage, `.deb` and `.pacman` x86_64 with `hydra-native.node`, legendary, umu-run, 7zzs and the Epic prerequisite runner                    |
| Linux package metadata (1.81.0) | `dpkg-deb -I`, `.PKGINFO`                                                                          | PASS — package `lorro-launcher`, maintainer `hectorrh11`, homepage and description point to Lorro                                                   |
| Linux AppImage entry (1.81.0)   | `--appimage-extract`                                                                               | PASS — `.desktop` with `Exec=AppRun --no-sandbox %U` and `x-scheme-handler/lorro`                                                                   |

Artifacts after a successful build:

- `dist/lorro-launcher-4.1.6-setup.exe` (NSIS, assisted, changeable install dir)
- `dist/lorro-launcher-4.1.6-portable.exe`
- `dist/lorro-launcher-4.1.6-setup.exe.blockmap`

Installer defines verified: `APP_ID=com.lorro.launcher`, `PRODUCT_NAME=Lorro Launcher`,
`SHORTCUT_NAME=Lorro Launcher`, `UNINSTALL_DISPLAY_NAME=Lorro Launcher`,
`APP_INSTALLER_STORE_FILE=lorro-launcher-updater\installer.exe`,
`MUI_ICON/MUI_UNICON/UNINSTALLER_ICON=build/icon.ico`,
`MUI_*_BITMAP=build/installerSidebar.bmp`.

---

## 3. Pending / known limitations

1. **Build path with `$HOME` (environment-specific).**
   NSIS expands `$HOME` inside include paths, so `electron-builder` cannot finish
   the NSIS step when the repository lives in a path that literally contains
   `$HOME`. Workaround used for verification: build from a clean path (e.g.
   `%TEMP%\lorro-src`) with the source tree + installed `node_modules`. For normal
   use, clone/build from a path without `$`, e.g. `C:\dev\lorro-launcher`.
2. **14 pre-existing unit-test failures** are Windows path/cleanup issues in the
   original project and are unrelated to the rebrand.
3. **Code signing** is not configured; installers are unsigned. Windows SmartScreen
   may warn until a certificate is provided.
4. **Full install → update → uninstall cycle** on a physical machine has not been
   executed in CI; it should be validated manually before release.
5. **Running the NSIS setup/portable from inside `C:\Windows\System32`.**
   NSIS stubs cannot relaunch themselves when executed from `System32` (a known
   NSIS/Windows limitation, unrelated to Lorro); doing so shows
   `NSIS error: Error launching installer`. The installers themselves are valid.
   Always run `lorro-launcher-*-setup.exe` / `-portable.exe` from a normal path
   (Desktop, Downloads, `C:\dev\...`). Verification: copied to
   `%TEMP%\opencode\lorro-test`, `setup.exe /S` exited with code `0`, installed to
   `%LOCALAPPDATA%\Programs\Lorro Launcher`, created a Desktop and Start Menu
   shortcut named `Lorro Launcher`, registered the uninstall entry
   (`Lorro Launcher | 4.1.6`), and the installed app launched successfully.
   Final verification after the runtime fixes: the rebuilt `setup.exe` installed
   to `C:\Program Files\Lorro Launcher`, the installed `app.asar` contains the
   configured API endpoint, and `Lorro Launcher.exe` starts with window title
   `Lorro Launcher` (no `Error` dialog, no `Invalid URL`, no uncaught exception).
6. **No preconfigured download sources.** Lorro deliberately ships **no** default
   source catalogues. Requests to bundle catalogues of unauthorized/pirated copies
   are out of scope: it would mean redistributing other people's copyrighted games
   and bypassing the access controls those catalogues and hosts rely on. The
   source manager is fully functional and lives in Settings → Download sources, so
   users can add, validate, enable/disable and remove their own compliant sources
   (free/open-source/authorized catalogues such as GOG, itch.io or Epic).

---

## 4. Requirements to distribute

Set these environment variables (see `.env.example`) before building releases:

- **Backend (required for login / catalogue / sources / cloud saves):**
  - `MAIN_VITE_API_URL` — e.g. `https://hydra-api-us-east-1.losbroxas.org`
  - `MAIN_VITE_AUTH_URL` — e.g. `https://auth.hydralauncher.gg`
  - `MAIN_VITE_CHECKOUT_URL` — legacy value; the cloud checkout modal was removed
    and the UI no longer opens it.
  - `MAIN_VITE_EXTERNAL_RESOURCES_URL` / `RENDERER_VITE_EXTERNAL_RESOURCES_URL` —
    e.g. `https://assets.hydralauncher.gg`
- `MAIN_VITE_UPDATE_REPOSITORY` — `hectorrh11/lorro-launcher` in release builds.
  Leave empty only when auto-update must be disabled.
- `RENDERER_VITE_RELEASES_URL` — public releases page URL shown to users.
- `MAIN_VITE_USER_DATA_PATH` — only for development (custom user-data directory).
- Optional: `MAIN_VITE_LAUNCHER_SUBDOMAIN`, referral IDs, Sentry DSN — keep the
  values required by the services you use.

A ready-to-use `.env` with the public upstream endpoints is included locally
(gitignored) so the app works out of the box in development.

No publishing URL, API key or endpoint is hardcoded. Auto-update points to
`hectorrh11/lorro-launcher`; do not redirect it to another repository.

---

## 5. Development and build instructions

```bash
yarn install          # install dependencies (also builds the native addon)
yarn dev              # run the app in development
yarn icons            # regenerate all Lorro icons from resources/lorro/*.svg
yarn typecheck        # typecheck main + renderer
yarn test             # run unit tests
yarn build            # typecheck + production build (out/)
yarn build:win        # package Windows NSIS + portable installers
```

Output installers are written to `dist/`:
`lorro-launcher-<version>-setup.exe` and `lorro-launcher-<version>-portable.exe`.

---

## 6. Attribution and license

- Original project: **Hydra Launcher** — MIT License, © Los Broxas / Hydra
  Launcher contributors. License and copyright notices are preserved.
- Lorro Launcher is an independent launcher built on the original codebase, not
  a from-scratch rewrite.
- Third-party components (Electron, React, legendary, ludusavi, sharp, Space
  Grotesk/Noto Sans fonts, icon sets, etc.) keep their own licenses; see the
  About screen and package manifests for details.
- The Lorro identity (logo, palette, name) is original and does not reuse Hydra
  visual assets beyond what is technically required.
