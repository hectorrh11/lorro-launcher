# Lorro Launcher — contexto completo para agentes

Launcher de escritorio **independiente** (Electron + React + TypeScript + Vite)
basado en el código abierto de Hydra. Repo: `hectorrh11/lorro-launcher`.
Versión publicada actual: **1.80.0** (incluye 1.77.0, 1.78.0 y 1.79.0).

Este documento es la fuente de verdad para retomar el proyecto en una sesión
nueva. Léelo entero antes de tocar código.

---

## 1. Reglas no negociables

- **No** implementar ni facilitar evasión de servicios de pago, DRM, ni
  catálogos de piratería.
- **No** commitear `.env`, tokens ni credenciales. `.env` está en `.gitignore`.
- **No** escribir `package.json` con `Set-Content -Encoding utf8`: el BOM rompe
  `electron-vite` (`vite-plugin-svgr ... Unexpected token '\ufeff'`). Usar la
  herramienta de edición o `.NET UTF8Encoding($false)`.
- Los JSON de idiomas son UTF-8; editarlos con la herramienta de edición. La
  consola de PowerShell puede destrozar acentos.
- **NSIS no compila desde una ruta que contenga `$`**. El workspace
  (`C:\Windows\System32\$HOME\source\hydra-personal`) contiene un `$` literal.
  Compilar siempre desde el espejo `%TEMP%\opencode\lorro-src`.
- `gh` está en `C:\Program Files\GitHub CLI\gh.exe` y **no** está en el PATH.
- No commitear, publicar ni hacer push sin que el usuario lo pida explícitamente.
- No declarar terminada una función sin typecheck + build correctos.

---

## 2. Identidad y estado del producto

- Nombre visible: **Lorro Launcher**. appId `com.lorro.launcher`.
- Protocolo `lorro://` (se mantiene compatibilidad con `hydralauncher://`).
- Paleta violeta propia; logo generado por `scripts/generate-lorro-brand.mjs`
  e iconos por `scripts/generate-lorro-icons.mjs` (`yarn icons`).
- Atribución al proyecto original solo en el repositorio (README), no en la UI.
- La UI ya no muestra la marca "Hydra"; ~2.500 cadenas en 42 idiomas fueron
  sustituidas por "Lorro".
- El login, el catálogo y las descargas siguen usando la API/auth de Hydra
  porque no hay backend propio. Es una dependencia funcional conocida.

### Datos de usuario

- `%APPDATA%\Lorro Launcher` (migración opcional desde Hydra al primer arranque).
- Clips: `Videos\Lorro Launcher\Clips`.
- Logs: carpeta de logs de electron-log dentro de los datos de usuario.

---

## 3. Estructura del repositorio

```
src/
  main/                     proceso principal (Node)
    index.ts                bootstrap, ventanas, protocolos
    services/               lógica de negocio
    events/                 handlers IPC agrupados por dominio
    constants.ts            rutas, URLs, appId
  preload/index.ts          API expuesta a renderer (contextBridge)
  renderer/src/
    app.tsx                 shell principal (sidebar, rutas, widgets)
    main.tsx                bootstrap React + instaladores globales
    pages/                  library, game-details, settings, downloads, ...
    components/             UI reutilizable (Button, SelectField, ...)
    context/                providers (settings, library, game-details, ...)
    hooks/                  hooks de datos y UI
    lib/                    utilidades sin React
    locales/<lang>/*.json   traducciones
    scss/                   estilos globales y temas
  big-picture/              app/renderer de modo Big Picture (#/big-picture)
  shared/                   utilidades compartidas main/renderer
  types/                    tipos compartidos (+ advanced.types.ts)
resources/                  iconos, artefactos, assets empaquetados
build/                      configuración de electron-builder (NSIS)
scripts/                    generación de marca/iconos, utilidades
docs/LORRO_STATUS.md        estado funcional resumido
update.txt                  changelog acumulativo = notas de release
AGENTS.md                   este documento
```

Puntos calientes:

- `src/main/services/process-watcher.ts`: detecta juegos en ejecución
  (`onOpenGame` / `onCloseGame`), alimenta estadísticas y backups automáticos.
- `src/main/services/custom-download-manager.ts`: descargador propio
  (validación de enlace, multi-conexión 8 por defecto / máx. 16, watchdog,
  persistencia, handoff a IDM/NDM/FDM).
- `src/main/services/advanced-store.ts`: almacén JSON de las funciones avanzadas.
- `src/main/services/session-stats.ts`: sesiones de juego (inicio/fin,
  recuperación tras cierre inesperado, corrección manual).
- `src/main/services/save-backup-manager.ts`: copias de partidas.
- `src/main/services/game-diagnostics.ts`: comprobaciones y arreglos seguros.
- `src/main/services/storage-manager.ts`: informe de discos, cachés y mover
  instalaciones con verificación + rollback.
- `src/main/services/clip-manager.ts`: ajustes de clips (duración 5–90 s,
  atajo global, audio de sistema/micrófono), registro de `globalShortcut`,
  listado/borrado/guardado en `Videos\Lorro Launcher\Clips`.
- `src/renderer/src/lib/clip-buffer.ts`: buffer circular configurable con
  MediaRecorder (webm/vp9), audio loopback del sistema y micrófono mezclado.
- `src/renderer/src/pages/clips/`: página Clips (listado, reproductor, borrado).
- `src/renderer/src/lib/performance-mode.ts`: clase en `<body>` y persistencia.
- `src/renderer/src/lib/lorro-feedback.ts`: botón flotante que abre GitHub.
- `src/renderer/src/lib/gamepad-navigation.ts`: mando en Big Picture.
- `src/renderer/src/pages/settings/settings-advanced.tsx`: pestañas Backups,
  Statistics, Storage, Diagnostics y Extras.

---

## 4. Arquitectura e IPC

- Renderer **nunca** accede a Node directamente: todo pasa por
  `src/preload/index.ts` → `ipcRenderer.invoke(canal, ...)`.
- Cada canal se registra en `src/main/events/<dominio>/index.ts` con
  `registerEvent(nombre, handler)`.
- Los módulos de eventos se importan en `src/main/events/index.ts`.
- Toda función nueva debe añadirse en **tres** sitios:
  1. `src/main/events/...` (handler real),
  2. `src/preload/index.ts` (puente),
  3. `src/renderer/src/declaration.d.ts` (tipos de `window.electron`).
- Los tipos compartidos viven en `src/types/` y se reexportan desde
  `src/types/index.ts`.
- Convención de nombres: `getX`, `listX`, `createX`, `updateX`, `deleteX`.
- Evitar colisiones con canales existentes del catálogo. Ejemplo real: el canal
  del catálogo es `getGameStats`; el de estadísticas avanzadas es
  `getPlaytimeStats`. Renombrar en bloque rompió ambos.

### Persistencia

- Base de datos tipo Level (`level`/`sublevel`) con `levelKeys` y
  `valueEncoding: "json"` para preferencias y juegos.
- Las funciones avanzadas usan JSON propio en `advanced-store.ts`.
- Nunca guardar rutas o datos de usuario fuera de `%APPDATA%` salvo clips,
  backups o instalaciones movidas por decisión explícita del usuario.

### Autenticación

- URLs en `.env`: `MAIN_VITE_API_URL`, `MAIN_VITE_AUTH_URL`,
  `MAIN_VITE_CHECKOUT_URL`, `MAIN_VITE_EXTERNAL_RESOURCES_URL`,
  `RENDERER_VITE_EXTERNAL_RESOURCES_URL`, `MAIN_VITE_UPDATE_REPOSITORY`,
  `RENDERER_VITE_RELEASES_URL`.
- El token de sesión lo emite Hydra; Lorro solo lo consume.
- `open-checkout.ts` ya NO abre el checkout de Hydra: abre GitHub del usuario.
- WorkWonders: se mantienen changelog/ayuda, pero el widget de feedback se
  eliminó (enviaba a la organización "hydra"). No reactivarlo.

---

## 5. Flujo de publicación (obligatorio)

1. Editar código y ejecutar `yarn typecheck` (node + web).
2. Subir versión en `package.json` (herramienta de edición, nunca Set-Content).
3. Añadir sección al principio de `update.txt` (detallada y honesta).
4. Sincronizar al espejo:

```powershell
$ws = "C:\Windows\System32\`$HOME\source\hydra-personal"
$src = "$env:TEMP\opencode\lorro-src"
foreach ($d in @("src","resources","build","scripts","docs")) {
  robocopy "$ws\$d" "$src\$d" /MIR /NFL /NDL /NJH /NJS /NP /MT:16 | Out-Null
}
foreach ($f in @("package.json","electron-builder.yml","update.txt","README.md",".env")) {
  Copy-Item -LiteralPath "$ws\$f" -Destination "$src\$f" -Force
}
```

5. En el espejo: `npx electron-vite build`.
6. `$env:GH_TOKEN = & "C:\Program Files\GitHub CLI\gh.exe" auth token`
   y `npx electron-builder --win --publish always`.
7. Publicar la release (electron-builder la crea en borrador):

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" release edit vX.Y.Z `
  --repo hectorrh11/lorro-launcher --draft=false --latest `
  --notes-file "$ws\update.txt"
```

8. Verificar `https://github.com/hectorrh11/lorro-launcher/releases/latest/download/latest.yml`
   devuelve **200** y `latest` apunta a la versión nueva.
9. Copiar `*-setup.exe`, `*-portable.exe`, `.blockmap` y `latest.yml` a `dist/`
   y los instaladores al Escritorio; borrar los de versiones anteriores.
10. `git add -A; git commit -m "..."; git push lorro HEAD:main`.

Notas:

- El remoto `lorro` apunta a `https://github.com/hectorrh11/lorro-launcher.git`;
  se publica `HEAD:main`. `origin` sigue siendo el repo original de Hydra.
- Auto-update funciona desde cualquier versión ≥ 1.0.0. Clientes anteriores a
  1.0.0 necesitan una instalación manual una vez.
- Si se republica la **misma** versión (por ejemplo 1.69.0), hay que borrar la
  release y el tag antes:
  `gh release delete vX.Y.Z --yes --cleanup-tag`.
- Una versión ya instalada no se autoactualiza a sí misma: reinstalar a mano.

---

## 6. Funciones implementadas (estado real)

### Descargador propio
Validación del enlace antes de descargar, multi-conexión segmentada,
reintentos y watchdog de estancamiento, persistencia entre reinicios,
entrega a gestor externo (IDM por CLI, NDM/FDM por portapapeles), gráfico de
velocidad con tooltip y media seleccionable (total/1h/30m/15m/5m).

### Lanzamiento
`useLaunchLibraryGame` abre el selector de `.exe` si falta y guarda la ruta
(`updateExecutablePath`), luego `openGame`. Doble clic en la tarjeta y botón de
play usan el mismo hook. Si el juego está instalado sin `.exe`, la tarjeta
muestra "Seleccionar ejecutable".
Al terminar la extracción de una descarga, `searchAndBindExecutable`
(`game-files-manager.ts`) busca el ejecutable con los nombres del catálogo
(`findGameExecutableInFolder`) y, si no hay coincidencia, elige el `.exe` más
probable (`findLikelyGameExecutableInFolder`). El resultado se guarda y se avisa
al renderer con `on-executable-detected` (pop-up para cambiarlo).

### Colecciones
Las colecciones viven en el perfil (API `/profile/games/collections`). Al
cargarlas, `useGameCollections` crea una sola vez las cuatro predeterminadas
si faltan: **Terminado**, **En proceso**, **Abandonado** y **No instalado**.
No duplica nombres existentes ni sobrescribe las del usuario.

### Temas y fondo
Claro y oscuro. La tienda de temas incluye los acentos de pago **Golden** (300
LorroPoints), **Esmeralda** (600) y **Rubí** (900), definidos en
`src/shared/lorro-themes.ts` y comprados con el IPC `purchaseLorroTheme`. Los
identificadores internos son `golden`, `esmeralda` y `ruby`; las compras
antiguas (`gold`, `emerald`) se migran con `normalizeLorroThemeId`. El
tema transparente usa transparencia **real** de ventana en Windows:
`WindowManager.setRealWindowTransparency` recrea la `BrowserWindow` con
`transparent: true` y `backgroundColor: "#00000000"` porque Electron no permite
cambiarlo en caliente; la preferencia persistida es `realTransparentWindow`.
Fondo personalizado con imagen o vídeo, recorte inteligente 1920×1080 con
`sharp`, desenfoque y atenuación configurables.

### Copias de seguridad de partidas
Rutas por juego (detección + manual), copia manual/al cerrar/antes de restaurar,
historial, restaurar/exportar/importar/eliminar, destino y retención
configurables, snapshot previo a restaurar, nunca borra archivos del usuario.

### Estadísticas
Sesiones reales desde el monitor de procesos, recuperación tras cierre
inesperado, totales, juegos más usados, actividad por día/semana/mes,
corrección y borrado manual. Todo local. Las tarjetas de la biblioteca muestran
el tiempo real por juego (`LibraryGame.lorroPlaytimeMs`, calculado desde
`session-stats` al listar la biblioteca) y se refrescan al cerrar el juego.

### Diagnóstico
Ejecutable, ruta, permisos, espacio, rutas de guardado, perfiles y errores del
log. Estados ok/warning/error/unknown, reejecutar, copiar informe, arreglos
seguros únicamente.

### Almacenamiento
Discos, tamaño/ubicación de juegos, duplicados, cachés con vista previa,
limpieza segura, mover instalación con verificación y rollback.

### Big Picture
Modo existente + navegación con mando (stick/cruceta, A, B/Start, LB/RB) con
`gamepad-navigation.ts`.

### LorroPoints
Puntos locales calculados en `src/main/services/lorro-points.ts` sumando el
valor real (`achievement.points`) de cada logro desbloqueado, con
`AchievementMemoryStore` como fuente. El saldo se expone con `getLorroPoints`
(`{ earned, spent, balance, exact }`) y se gasta en la tienda de temas. Si se
reinicia la app, el almacén de logros está vacío hasta que se sincronizan: el
saldo puede mostrarse como **estimado** (`exact: false`) y recalcularse después.

### Clips (1.78.0)
Página propia en la barra lateral (`/clips`): listado, reproducción con el
protocolo `local:`, mostrar en carpeta y borrado con confirmación. Grabación en
segundo plano mediante `globalShortcut` registrado en el proceso principal
(`clip-manager.ts`), atajo configurable y persistente. Audio loopback del
sistema vía `setDisplayMediaRequestHandler` con `audio: "loopback"` (Windows) y
micrófono opcional mezclado con `AudioContext`. Duración 5–90 s en pasos de 5;
el buffer vive en RAM y solo se escribe al guardar. Tras actualizar hay que
volver a activar los clips.

### Extras
Modo rendimiento (desactiva animaciones, transiciones, blur y vídeo de fondo) y
tienda de temas/LorroPoints. Los clips ya no viven aquí.

### Superficie comercial
Eliminada por completo: no quedan modal de suscripción, banners paywall, upsells
de logros/perfil/vikingfile, modal de regalos, cloud-ring, slice de suscripción
ni `allow_cloud_gifts`. `window.electron.openCheckout()` abre el GitHub del
usuario y "apoya el proyecto" enlaza a ese GitHub. No reintroducir anuncios ni
enlaces de Hydra/Lorro Cloud.

---

## 7. Trabajo pendiente acordado

### 1.77.0 (implementado; build/release hechos en local)

- Estadísticas reales en las tarjetas de la biblioteca (lorroPlaytimeMs,
  refresco al cerrar juego).
- LorroPoints según los puntos reales de cada logro desbloqueado.
- Tienda de temas: Golden, Esmeralda y Rubí (300/600/900 pts) y transparencia
  real recreando la BrowserWindow.
- Rediseño de Ajustes, fuera sistema de perfiles y superficie Cloud.
- "Más versiones" junto a Play cuando hay ejecutable; README independiente.

### 1.78.0 (implementado; build/release hechos en local)

- Página **Clips** en la barra lateral con listado, reproducción y borrado.
- Atajo **global** configurable y persistente (globalShortcut en main).
- Audio de sistema (loopback de Windows) y micrófono opcional mezclado.
- Duración 5–90 s en pasos de 5 y ajustes persistentes en preferencias.
- Los clips ya no viven en Ajustes → Extras.
### 1.79.0 (implementado; build/release hechos en local)

- Detección automática del `.exe` dentro de la carpeta instalada.
- Pop-up al terminar la descarga: "Se ha seleccionado X.exe como ejecutable,
  ¿quieres cambiarlo?".
- Ficha del juego: ejecutable junto a los botones; sin "Descargar" si ya existe.
- "Más versiones" abre el historial de versiones del juego.

### 1.80.0 (publicada)

- Ficha del juego: Play y "Más versiones" en la misma fila, con el ejecutable
  al lado (antes se apilaban y se salían de la barra).
- Temas renombrados a Golden, Esmeralda y Rubí con migración de compras.
- Cuatro colecciones creadas automáticamente en el perfil: Terminado,
  En proceso, Abandonado y No instalado.
- Textos de Extras (modo rendimiento y tienda) traducidos; sin claves visibles.

---

## 8. Limitaciones y riesgos conocidos

- **Aislamiento de partidas/config por perfil**: descartado. Los juegos guardan
  en `Documentos`, `%APPDATA%`, `%LOCALAPPDATA%` o el registro, y aislarlos exige
  redirección por juego (variables de entorno o junctions) con backup y
  rollback; muy pocos juegos lo permiten de forma total. El sistema de perfiles
  se eliminó del código y no debe reintroducirse.
- **Transparencia real**: implementada recreando la `BrowserWindow` con
  `transparent: true`, porque Electron no permite cambiar `transparent` en
  caliente. Riesgo de parpadeo y de perder el estado de la UI al activar o
  desactivar; probar en Windows 10 y 11.
- **Audio loopback**: `getDisplayMedia` captura el audio del sistema solo si el
  usuario comparte audio y la plataforma lo permite; para "todo el audio"
  (Discord incluido) hace falta captura nativa (WASAPI) o `setDisplayMediaRequestHandler`
  con `audio: "loopback"` en Windows. Probar en Windows 10 y 11.
- **Hotkey global**: `globalShortcut` puede chocar con atajos del juego; validar
  el registro y avisar si falla. No funciona si otro proceso lo captura.
- **Clips en memoria**: el buffer completo vive en RAM (hasta 90 s). Subir la
  duración o la resolución dispara el consumo; mantener el bitrate limitado y
  descartar los blobs fuera de la ventana.
- **Hydra API**: cambios en el servidor pueden romper login/catálogo. No hay
  control sobre ellos.
- El log de arranque `ENOENT ... resources\ludusavi\ludusavi.exe` es inocuo.
- Los temas personalizados con vídeo consumen GPU; el modo rendimiento debe
  desactivarlos.

---

## 9. Rendimiento

- Evitar renders innecesarios en la biblioteca (memoizar tarjetas y selectores).
- Cargar widgets/iframes solo tras interacción (ya implementado para WorkWonders).
- Imágenes con `loading="lazy"` y `decoding="async"` cuando sea posible.
- No mantener `MediaRecorder`, `requestAnimationFrame` ni `setInterval` activos
  si la función está desactivada.
- El modo rendimiento debe: desactivar animaciones/transiciones, blur, vídeo de
  fondo, arte animado y sondeos periódicos no esenciales.
- Medir con la app abierta en reposo y durante una descarga; comparar RAM/CPU.

---

## 10. Convenciones de código

- TypeScript estricto; no usar `any` si se puede tipar.
- Componentes funcionales + hooks; nada de clases.
- Estilos en SCSS junto al componente, clases BEM (`bloque__elemento--modificador`).
- Textos siempre vía `t("clave", "Valor por defecto")`; añadir la clave a
  `src/locales/en` y `src/locales/es` como mínimo.
- Sin comentarios salvo que aporten contexto no obvio.
- Errores al usuario con `showErrorToast`; nunca `alert`.
- Fechas/tamaños: reutilizar `formatBytes`, `formatDate`, `formatDuration` de
  `settings-advanced.tsx` o moverlos a `lib/`.
- Antes de renombrar un identificador en bloque, buscar colisiones
  (`getGameStats` vs `getPlaytimeStats` fue un fallo real).

---

## 11. Verificación mínima antes de publicar

```powershell
yarn typecheck          # node + web, debe terminar en "Done"
npx electron-vite build # en el espejo, exit 0
```

Comprobar además:

- La app abre, inicia sesión y carga la biblioteca.
- Doble clic en un juego y botón de play lanzan el `.exe` correcto.
- Ajustes → cada pestaña abre sin errores en consola.
- Copia de seguridad: crear, restaurar y que no borre archivos del usuario.
- Estadísticas: jugar, cerrar y ver que la sesión aparece.
- Clips: activar, esperar, guardar y abrir el archivo.
- Modo rendimiento: activar/desactivar y reiniciar la app.
- `latest.yml` = 200 tras publicar.

---

## 12. Historial de versiones

- **1.0.0** — identidad Lorro, instalador, datos propios, migración opcional,
  descargador propio, auto-update.
- **1.1.0** — lanzar desde la tarjeta de la biblioteca.
- **1.2.0** — gráfico de velocidad con tooltip y medias.
- **1.3.0** — temas y fondo personalizado.
- **1.67.0** — backups, estadísticas, diagnóstico, almacenamiento, Big Picture
  con mando, feedback por GitHub, marca independiente.
- **1.69.0** — selector de ejecutable en tarjeta, LorroPoints cosméticos
  iniciales, clips de 35 s, modo rendimiento, fuera enlaces de Hydra.
- **1.77.0** — estadísticas reales en biblioteca,
  LorroPoints por puntos de logro + tienda de temas (transparencia real,
  Golden/Esmeralda/Rubí), fuera superficie comercial Cloud, fuera sistema de
  perfiles, rediseño de Ajustes, README independiente.
- **1.78.0** — página Clips, atajo global configurable,
  audio de sistema (loopback) + micrófono opcional, duración 5–90 s,
  activación persistente y clips fuera de Ajustes → Extras.
- **1.79.0** — detección automática del `.exe` con aviso
  para cambiarlo, ejecutable visible en la ficha y "Más versiones".
- **1.80.0** — Play y "Más versiones" en la misma fila, temas Golden,
  Esmeralda y Rubí con migración, colecciones por defecto y textos de Extras.

---

## 13. Recetas para añadir cosas correctamente

### Nueva función IPC (checklist obligatoria)

1. **Tipos**: añadir la interfaz en `src/types/advanced.types.ts` (o el archivo
   del dominio) y reexportarla en `src/types/index.ts`.
2. **Servicio**: implementar la lógica en `src/main/services/<nombre>.ts` como
   singleton (`export const xManager = new XManager()`), con `logger` y sin
   lanzar errores crudos al renderer (devolver `{ ok, message }` o `null`).
3. **Handler**: registrar en `src/main/events/<dominio>/index.ts`:
   `registerEvent("nombreCanal", (_event, ...args) => servicio.metodo(...))`.
4. **Importar el dominio** en `src/main/events/index.ts` si es nuevo.
5. **Preload**: añadir el método en `src/preload/index.ts` con
   `ipcRenderer.invoke("nombreCanal", ...)`.
6. **Tipos del renderer**: añadir la firma en
   `src/renderer/src/declaration.d.ts` dentro de `window.electron`.
7. **UI**: consumir desde un hook o componente; nunca `ipcRenderer` directo.
8. **Colisiones**: `rg -n "nombreCanal" src` antes de registrar. Los canales del
   catálogo ya usan nombres como `getGameStats`; no reutilizar.
9. Verificar con `yarn typecheck` (node + web).

### Nueva preferencia de usuario

- Leer con `db.get(levelKeys.userPreferences, { valueEncoding: "json" })` y
  guardar fusionando el objeto completo (nunca sobrescribir con `{}`).
- Exponer `getUserPreferences`/`updateUserPreferences` si aún no existe.
- Añadir el campo a los tipos de preferencias y al contexto de settings.
- Aplicarla al arrancar en `src/renderer/src/main.tsx` (clases del body,
  overrides) o en `app.tsx` si depende de React.

### Nueva página + entrada en la barra lateral

1. Crear `src/renderer/src/pages/<nombre>/` con `index.tsx` y `.scss` junto al
   componente (BEM).
2. Registrar la ruta en el `HashRouter` de `src/renderer/src/main.tsx`.
3. Añadir la entrada en `src/renderer/src/components/sidebar/sidebar.tsx` con
   icono de `@primer/octicons-react`.
4. Añadir la clave i18n (`sidebar_<nombre>`) en `en` y `es`.
5. Si aplica a Big Picture, crear también la vista en `src/big-picture/`
   (app y rutas separadas, `#/big-picture/...`).

### Nuevo tema

- Definir variables en `src/renderer/src/scss/themes.scss` bajo una clase de
  `<body>` (`theme-<nombre>`).
- Los componentes deben usar variables (`globals.$...`), nunca colores fijos.
- Registrar el tema en Ajustes → Apariencia y persistirlo en preferencias.
- **Acento de pago**: añadirlo a `LORRO_PURCHASABLE_THEMES` y
  `LORRO_THEME_PRICES` en `src/shared/lorro-themes.ts`; la compra pasa por el IPC
  `purchaseLorroTheme` y el saldo por `getLorroPoints`. Precios actuales:
  golden 300, esmeralda 600, ruby 900.
- **Transparente real**: no basta CSS. Requiere `transparent: true` y
  `backgroundColor: "#00000000"` en la `BrowserWindow`; Electron no lo cambia en
  caliente, así que hay que recrear la ventana (ver `window-manager.ts`) y
  restaurar el estado al desactivar. Probar en Windows 10 y 11.

### Nueva cadena de texto

- Usar siempre `t("clave", "Texto por defecto")`.
- Añadir la clave a `src/locales/en/translation.json` y
  `src/locales/es/translation.json` como mínimo.
- Mantener el JSON válido (coma final prohibida) y UTF-8 sin BOM.
- No introducir "Hydra" en textos visibles; el producto es Lorro.

### Nuevo servicio en el proceso principal

- Un archivo por responsabilidad en `src/main/services/`.
- Persistencia: `advanced-store.ts` (JSON) para funciones avanzadas; Level para
  datos de juegos/preferencias.
- Registrar efectos secundarios (watchdog, intervalos, listeners) y limpiarlos
  en `app.on("before-quit")` o al desactivar la función.
- No bloquear el arranque: inicialización perezosa cuando sea posible.

### Nuevo atajo global

- `globalShortcut.register(acelerador, callback)` en `src/main/index.ts` tras
  `app.whenReady()`.
- Comprobar el booleano de retorno; si es `false`, avisar al usuario de que otro
  programa lo ocupa.
- Persistir la combinación en preferencias y re-registrar al cambiarla;
  `globalShortcut.unregisterAll()` en `before-quit`.
- Para avisar al renderer: `mainWindow.webContents.send("evento", payload)`.

### Cambios de arranque o ventanas

- `src/main/index.ts` (bootstrap, protocolos, single instance) y
  `src/main/services/window-manager.ts` (creación, tamaño, transparencia,
  Big Picture).
- No crear ventanas antes de `app.whenReady()`.

### Depuración

- Desarrollo: `yarn dev` (electron-vite) y DevTools.
- Logs: electron-log en los datos de usuario; `logger.info/warn/error`.
- Problemas típicos: BOM en `package.json`; ruta con `$` al compilar NSIS;
  `gh` fuera del PATH; variables de `.env` sin `MAIN_VITE_`/`RENDERER_VITE_`.
- Si el build falla por un import, comprobar primero rutas y exports.

### Definition of done

- `yarn typecheck` termina en "Done".
- `npx electron-vite build` en el espejo termina con exit 0.
- Prueba manual del flujo afectado (y de que no rompe login/biblioteca).
- `update.txt` actualizado si hay release; versión subida solo si se pide.
- Commit descriptivo y push a `lorro HEAD:main` solo cuando el usuario lo pida.

