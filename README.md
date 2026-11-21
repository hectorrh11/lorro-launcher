<div align="center">

<h1>Lorro Launcher</h1>

  <p align="center">
    <strong>Lorro Launcher is an independent desktop game launcher for Windows. It brings your library, downloads, installations, playtime, achievements and backups together in one place, with its own identity, updater and data folder.</strong>
  </p>

</div>

## Features

- **Library** — add the games you own, detect existing installations, choose a custom install path and launch any executable. Double-clicking a card or pressing play starts the game; if the executable is missing, the launcher asks for it once and remembers the choice.
- **Real playtime** — library cards show the actual time played per game and refresh when a session ends. Statistics include totals, most-played games and activity by day, week and month.
- **Downloads** — a built-in download manager with link validation, segmented multi-connection transfers (up to 32 connections on custom links), pause/resume, automatic retries that keep the bytes already downloaded, stall detection and persistence across restarts. Speed graphs show the average and the last 60 samples, and a transfer can be handed off to IDM, NDM or FDM when one is installed.
- **Automatic executable detection** — when a download finishes extracting, the launcher finds the game executable, binds it and offers to change it.
- **Achievements and LorroPoints** — unlock achievements and earn LorroPoints based on each achievement's real point value, then spend them in the store.
- **Store** — light and dark themes plus purchasable Golden, Esmeralda and Ruby accents, avatar frames, profile titles and animated backgrounds. The transparent theme uses real window transparency on Windows.
- **Custom backgrounds** — image or video backgrounds with smart 1920×1080 cropping, blur and dimming controls.
- **Home customisation** — hide the hero banner, the catalogue, the filters or the random game picker.
- **Save backups** — per-game save paths (detected or manual), automatic backups on exit and before restoring, history, export/import and a configurable destination and retention policy. Lorro never deletes your files.
- **Game diagnostics** — checks the executable, path, permissions, free space, save locations and log errors, with safe one-click fixes.
- **Storage tools** — disk usage report, per-game location and size, duplicate detection, cache preview and safe cleanup, and moving an installation with verification and rollback.
- **Big Picture** — a controller-friendly mode with full gamepad navigation.
- **Clips** — keeps a rolling buffer of gameplay (5 to 90 seconds, configurable) and saves it with a global hotkey. Optional system audio and microphone.
- **Performance mode** — disables animations, transitions, blur and video backgrounds on demand.
- **Optional desktop shortcuts** — off by default. Turn them on in Settings → General if you want a desktop shortcut created when a game finishes downloading; Start Menu shortcuts keep working as before.
- **In-app updates** — Lorro Launcher updates itself from its own releases.

All personal data stays in a dedicated `Lorro Launcher` folder (`%APPDATA%\Lorro Launcher`). Clips are saved to `Videos\Lorro Launcher\Clips`.

## Requirements

- Windows 10 or Windows 11, 64-bit.

## Releases

Download the latest build from the [Releases page](https://github.com/hectorrh11/lorro-launcher/releases/latest).

- `lorro-launcher-<version>-windows-setup.exe` — NSIS installer (`appId: com.lorro.launcher`, product name `Lorro Launcher`, custom install directory, Start Menu shortcut, uninstall entry).
- `lorro-launcher-<version>-windows-portable.exe` — portable build.

Both builds keep your personal data in the dedicated Lorro Launcher data folder, and the uninstaller never deletes it.

Automatic updates use `electron-updater`: installed clients check the Lorro Launcher releases and update in place through `latest.yml`. Clients older than **1.0.0** must install the current setup manually **once**; from 1.0.0 onward in-app updates work normally. A version never updates to itself, so reinstalling the same version requires a manual install.

## Build from source

### Requirements

- Node.js 22 + Yarn
- Rust toolchain (for the native addon)
- Visual Studio C++ Build Tools

`postinstall` builds the Rust native addon automatically. On Windows x64 the libtorrent bridge comes prebuilt from `native/torrent-bridge/prebuilt`, so installs do not compile libtorrent through vcpkg.

### Run in development

```bash
yarn install
yarn dev
```

### Typecheck and build

```bash
yarn typecheck
npx electron-vite build
```

### Regenerate the Lorro brand icons

The icon set (`.ico`, `.icns`, PNG sizes, tray icons, installer sidebar) is generated from the Lorro SVG sources in `resources/lorro/`:

```bash
yarn icons
```

### Build the Windows installer and portable version

```bash
yarn build:win
```

The output is written to `dist/`:

- `lorro-launcher-<version>-windows-setup.exe` — NSIS installer.
- `lorro-launcher-<version>-windows-portable.exe` — portable build.

> **Build path note:** the NSIS packaging step fails when the source path contains special characters such as `$` (for example `C:\Windows\System32\$HOME\...`). Copy the source tree to a plain path (such as `%TEMP%\lorro-build`) before packaging.

### Distribution and updates

Auto-update is configured through `MAIN_VITE_UPDATE_REPOSITORY` (`owner/repo`) and points to the Lorro Launcher release repository. `RENDERER_VITE_RELEASES_URL` sets the public releases page. `MAIN_VITE_API_URL`, `MAIN_VITE_AUTH_URL` and `RENDERER_VITE_EXTERNAL_RESOURCES_URL` configure the account and catalogue endpoints. Without these the app still runs, but it cannot sign in or check for updates.

## Notes

- Sign-in and the game catalogue are provided by the account service the launcher already uses; an account is required for the store, achievements and cloud saves.
- There are no subscription upsells, paywalls or commercial banners in the interface.
- Lorro Launcher is an independent project. It is not affiliated with, endorsed by or derived from any other launcher.
