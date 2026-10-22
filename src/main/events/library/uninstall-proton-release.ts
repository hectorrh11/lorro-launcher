import { registerEvent } from "../register-event";
import { ProtonManager } from "@main/services";

const uninstallProtonRelease = async (
  _event: Electron.IpcMainInvokeEvent,
  tag: string
) => {
  return ProtonManager.uninstall(tag);
};

registerEvent("uninstallProtonRelease", uninstallProtonRelease);
