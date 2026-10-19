export const APP_NAME = "Lorro Launcher";
export const APP_SHORT_NAME = "Lorro";
export const APP_ID = "com.lorro.launcher";

export const APP_PROTOCOL = "lorro";

/**
 * Hydra protocol kept for backwards compatibility with shortcuts and deep
 * links created by previous versions. It is accepted on input but never
 * generated for new links.
 */
export const LEGACY_APP_PROTOCOL = "hydralauncher";

export const isLorroDeepLink = (value: string) =>
  value.startsWith(`${APP_PROTOCOL}://`) ||
  value.startsWith(`${LEGACY_APP_PROTOCOL}://`);

export const buildAppDeepLink = (host: string, params?: URLSearchParams) => {
  const query = params?.toString();
  return `${APP_PROTOCOL}://${host}${query ? `?${query}` : ""}`;
};

export const normalizeDeepLinkProtocol = (value: string) =>
  value.startsWith(`${LEGACY_APP_PROTOCOL}://`)
    ? `${APP_PROTOCOL}://${value.slice(LEGACY_APP_PROTOCOL.length + 3)}`
    : value;
