import { customGameSourceManager } from "@main/services/custom-game-sources";
import type { GameShop } from "@types";

import { registerEvent } from "../register-event";

registerEvent(
  "getCustomGameSources",
  (_event, shop: GameShop, objectId: string) =>
    customGameSourceManager.list(shop, objectId)
);

registerEvent(
  "addCustomGameSource",
  (
    _event,
    shop: GameShop,
    objectId: string,
    url: string,
    label?: string | null
  ) => customGameSourceManager.add(shop, objectId, url, label)
);

registerEvent(
  "updateCustomGameSource",
  (
    _event,
    shop: GameShop,
    objectId: string,
    id: string,
    url: string,
    label?: string | null
  ) => customGameSourceManager.update(shop, objectId, id, url, label)
);

registerEvent(
  "deleteCustomGameSource",
  (_event, shop: GameShop, objectId: string, id: string) =>
    customGameSourceManager.remove(shop, objectId, id)
);
