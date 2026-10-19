!macro customUnInstall
  ; Lorro Launcher keeps user data (library, settings, downloads) on uninstall.
  ; The user data directory is documented in docs/LORRO_STATUS.md and can be
  ; removed manually from %APPDATA%\Lorro Launcher if desired.
  ${ifNot} ${isUpdated}
    RMDir /r "$LOCALAPPDATA\lorro-launcher-updater"
  ${endIf}
!macroend

!macro customRemoveFiles
  ; Never remove personal data as part of the uninstall flow.
!macroend
