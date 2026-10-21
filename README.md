<div align="center">

<img src="./resources/lorro/lorro-logo-horizontal.svg" width="360" alt="Lorro Launcher"/>

  <p align="center">
    <strong>Lorro Launcher is an independent desktop game launcher for Windows. It brings your library, downloads, installations, playtime, achievements and backups together in one place, with its own identity, updater and data folder.</strong>
  </p>

</div>

## Features

- **Library** — add the games you own, detect existing installations, choose a custom install path and launch any executable.
- **Real playtime** — the library cards show the actual time played per game, updated when a session ends. Statistics include totals, most-played games and activity by day, week and month.
- **Downloads** — a built-in download manager with link validation, segmented multi-connection transfers, pause/resume, retries, stall detection and persistence across restarts. Hand off a transfer to IDM, NDM or FDM when one is installed.
- **Achievements and LorroPoints** — unlock achievements and earn LorroPoints based on each achievement's real point value. Spend them on cosmetic themes.
- **Theme store** — light and dark themes plus purchasable gold, emerald and ruby accents. The transparent theme uses real window transparency on Windows.
- **Custom backgrounds** — image or video backgrounds with smart 1920×1080 cropping, blur and dimming controls.
- **Save backups** — per-game save paths (detected or manual), automatic backups on exit and before restoring, history, export/import and a configurable destination and retention policy. Lorro never deletes your files.
- **Game diagnostics** — checks the executable, path, permissions, free space, save locations and log errors, with safe one-click fixes.
- **Storage tools** — disk usage report, per-game location and size, duplicate detection, cache preview and safe cleanup, and moving an installation with verification and rollback.
- **Big Picture** — a controller-friendly mode with gamepad navigation.
- **Clips** — buffer the last 35 seconds of gameplay and save it as a local video file.
- **Performance mode** — disables animations, transitions, blur and video backgrounds on demand.
- **Cloud saves and accounts** — sign-in, catalogue and cloud saves are supported through the account service the launcher already uses. There are no subscription upsells, paywalls or commercial banners in the UI.
- **In-app updates** — Lorro Launcher updates itself from its own GitHub releases.

All personal data stays in a dedicated `Lorro Launcher` folder (`%APPDATA%\Lorro Launcher`). Clips are saved to `Videos\Lorro Launcher\Clips`.

## Releases

Download the latest installers from the [Releases page](https://github.com/hectorrh11/lorro-launcher/releases/latest):

- `lorro-launcher-<version>-setup.exe` — NSIS installer (`appId: com.lorro.launcher`, product name `Lorro Launcher`, custom install directory, Start Menu and desktop shortcuts, uninstall entry).
- `lorro-launcher-<version>-portable.exe` — portable build.

Both builds keep your personal data in the dedicated Lorro Launcher data folder, and the uninstaller never deletes it.

Automatic updates are integrated with `electron-updater`: installed clients check the Lorro Launcher GitHub releases and update in place. Clients on versions **older than 1.0.0** must install the current setup manually **once**; from 1.0.0 onward in-app updates work normally. A version never updates to itself, so reinstalling the same version requires a manual install.

## Build from source

### Requirements

- Node.js + Yarn
- Rust toolchain (for `hydra-native`)
- Git and a C++ toolchain (Visual Studio C++ Build Tools on Windows, GCC/Clang on Linux, Xcode command-line tools on macOS). The native build obtains CMake and CTest automatically through vcpkg.

After installing dependencies, `postinstall` builds the Rust native addon automatically (`hydra-native/hydra-native.node`). The native build includes a Rust wrapper around pinned libtorrent, and development and packaged torrenting no longer require Python.

On Windows x64 and Linux x64, the libtorrent bridge comes prebuilt from `native/torrent-bridge/prebuilt`, so installs skip compiling libtorrent through vcpkg. Other platforms build it from source. Set `HYDRA_TORRENT_BRIDGE_FROM_SOURCE=1` to always build it from source.

### Run in development

```bash
yarn install
yarn dev
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

- `lorro-launcher-<version>-setup.exe` — NSIS installer.
- `lorro-launcher-<version>-portable.exe` — portable build.

> **Build path note:** the NSIS packaging step fails when the source path contains special characters such as `$` (for example `C:\Windows\System32\$HOME\...`). Copy the source tree to a plain path (such as `%TEMP%\lorro-build`) before packaging.

### Distribution and updates

Auto-update is configured through `MAIN_VITE_UPDATE_REPOSITORY` (`owner/repo`) and points to the Lorro Launcher release repository. `RENDERER_VITE_RELEASES_URL` sets the public releases page. See `.env.example` for every variable. Without these, the app still runs but does not check for updates.

## License

Lorro Launcher is distributed under the [MIT License](LICENSE).

## Attribution

Lorro Launcher is an independent project built on the open-source [Hydra Launcher](https://github.com/hydralauncher/hydra) codebase. The original code is licensed under the MIT License, © Los Broxas and the Hydra Launcher contributors. Original copyright notices and third-party licences are preserved. See [LICENSE](LICENSE) for details.
