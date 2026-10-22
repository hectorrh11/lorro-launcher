import { registerEvent } from "../register-event";
import { ProtonManager } from "@main/services";
import type { ProtonOfficialChannel } from "@types";

const installOfficialProton = async (
  _event: Electron.IpcMainInvokeEvent,
  channel: ProtonOfficialChannel
) => {
  return ProtonManager.installOfficial(channel);
};

registerEvent("installOfficialProton", installOfficialProton);
