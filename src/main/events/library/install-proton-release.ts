import { registerEvent } from "../register-event";
import { ProtonManager } from "@main/services";
import type { ProtonInstallProgress } from "@types";

const installProtonRelease = async (
  event: Electron.IpcMainInvokeEvent,
  tag: string
) => {
  return ProtonManager.install(tag, (progress: ProtonInstallProgress) => {
    if (event.sender.isDestroyed()) return;
    event.sender.send("on-proton-install-progress", progress);
  });
};

registerEvent("installProtonRelease", installProtonRelease);
