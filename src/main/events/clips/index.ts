import { registerEvent } from "../register-event";
import { clipManager } from "@main/services/clip-manager";
import type { LorroClipSettings } from "@types";

registerEvent("getClipSettings", () => clipManager.getSettings());
registerEvent("updateClipSettings", (_e, patch: Partial<LorroClipSettings>) =>
  clipManager.updateSettings(patch)
);
registerEvent("listClips", () => clipManager.listClips());
registerEvent("deleteClip", (_e, name: string) => clipManager.deleteClip(name));
registerEvent("revealClip", (_e, name: string) => clipManager.revealClip(name));
registerEvent("openClipsFolder", () => clipManager.openFolder());
registerEvent("saveClip", (_e, data: ArrayBuffer, extension: string) =>
  clipManager.saveClip(data, extension)
);
