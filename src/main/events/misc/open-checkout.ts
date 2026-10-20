import { shell } from "electron";
import { registerEvent } from "../register-event";

const LORRO_URL = "https://github.com/hectorrh11/lorro-launcher";

const openCheckout = async (
  _event: Electron.IpcMainInvokeEvent,
  _options?: unknown
) => {
  await shell.openExternal(LORRO_URL);
};

registerEvent("openCheckout", openCheckout);