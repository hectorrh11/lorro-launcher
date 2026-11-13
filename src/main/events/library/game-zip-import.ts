import { gameZipImportManager } from "@main/services/game-zip-import";
import type { GameShop, GameZipImportOptions } from "@types";
import { registerEvent } from "../register-event";

registerEvent(
  "inspectGameZipImport",
  (
    _event: Electron.IpcMainInvokeEvent,
    shop: GameShop,
    objectId: string,
    zipPath: string
  ) => gameZipImportManager.inspect(shop, objectId, zipPath)
);

registerEvent(
  "importGameFromZip",
  (_event: Electron.IpcMainInvokeEvent, options: GameZipImportOptions) =>
    gameZipImportManager.import(options)
);

registerEvent(
  "cancelGameZipImport",
  (_event: Electron.IpcMainInvokeEvent, operationId: string) =>
    gameZipImportManager.cancel(operationId)
);
