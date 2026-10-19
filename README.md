<div align="center">

<img src="./resources/lorro/lorro-logo-horizontal.svg" width="360" alt="Lorro Launcher"/>

  <p align="center">
    <strong>Lorro Launcher is a premium, independent game launcher built to manage your gaming library, downloads, installations and achievements from a single place. It is a customized distribution based on the open-source <a href="https://github.com/hydralauncher/hydra">Hydra Launcher</a> project (Node.js, Electron, React, TypeScript and Rust).</strong>
  </p>

</div>

## Features

- Add the games you own to your library
- A personal profile that shows what you are playing to your friends
- Save your game progress in the cloud (Hydra Cloud backend)
- Unlock achievements
- Navigate a rich catalogue with powerful suggestions
- Configurable, legitimate game sources and download management
- Detecting existing installations, custom install paths and game launching

## Identity

Lorro Launcher ships its own visual identity (logo, colour system, typography, installer and data directory) while preserving the functionality, integrations and assets required by the original project. Your settings, cache and personal data are stored in a dedicated `Lorro Launcher` folder, separate from any other launcher.

## Attribution

Lorro Launcher is a customized distribution derived from [Hydra Launcher](https://github.com/hydralauncher/hydra). The original code is licensed under the MIT License, © Los Broxas and the Hydra Launcher contributors. Original copyright notices and third-party licences are preserved. See [LICENSE](LICENSE) for details.

## Build from source

### Local development requirements

- Node.js + Yarn
- Rust toolchain (for `hydra-native`)
- Git and a C++ toolchain (Visual Studio C++ Build Tools on Windows, GCC/Clang on Linux, Xcode command-line tools on macOS). The native build obtains CMake and CTest automatically through vcpkg.

After installing dependencies, `postinstall` builds the Rust native addon automatically (`hydra-native/hydra-native.node`).

The native build includes a Rust wrapper around pinned libtorrent. Development and packaged torrenting no longer require Python.

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

- `lorro-launcher-<version>-setup.exe` — NSIS installer (`appId: com.lorro.launcher`, product name `Lorro Launcher`, custom install directory, Start Menu and desktop shortcuts, uninstall entry).
- `lorro-launcher-<version>-portable.exe` — portable build.

Both builds keep your personal data in the dedicated Lorro Launcher data folder. The uninstaller never deletes your personal data.

### Distribution and updates

Automatic updates are disabled unless `MAIN_VITE_UPDATE_REPOSITORY` (`owner/repo`) is configured, so Lorro Launcher never downloads updates from the original Hydra repository. Set `RENDERER_VITE_RELEASES_URL` to the public download page for Lorro releases. See `.env.example`.

## License

Lorro Launcher is distributed under the [MIT License](LICENSE). Portions of the code were created by the Hydra Launcher project and are used under the terms of that license.
