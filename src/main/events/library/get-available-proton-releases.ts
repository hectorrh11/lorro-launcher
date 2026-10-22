import { registerEvent } from "../register-event";
import { ProtonManager } from "@main/services";

const getAvailableProtonReleases = async () => {
  return ProtonManager.listAvailable();
};

registerEvent("getAvailableProtonReleases", getAvailableProtonReleases);
