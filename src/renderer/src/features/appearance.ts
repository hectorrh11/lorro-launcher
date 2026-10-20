import { useSyncExternalStore } from "react";

export type LorroTheme = "dark" | "light" | "transparent";

export interface LorroBackground {
  kind: "image" | "video";
  path: string;
}

export interface AppearanceState {
  theme: LorroTheme;
  background: LorroBackground | null;
  blur: number;
  dim: number;
}

const STORAGE_KEY = "lorro.appearance.v1";

const DEFAULT_STATE: AppearanceState = {
  theme: "dark",
  background: null,
  blur: 0,
  dim: 0,
};

function isTheme(value: unknown): value is LorroTheme {
  return value === "dark" || value === "light" || value === "transparent";
}

function loadState(): AppearanceState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;

    const parsed = JSON.parse(raw) as Partial<AppearanceState>;

    const background =
      parsed.background &&
      typeof parsed.background.path === "string" &&
      (parsed.background.kind === "image" || parsed.background.kind === "video")
        ? { kind: parsed.background.kind, path: parsed.background.path }
        : null;

    return {
      theme: isTheme(parsed.theme) ? parsed.theme : DEFAULT_STATE.theme,
      background,
      blur: typeof parsed.blur === "number" ? parsed.blur : 0,
      dim: typeof parsed.dim === "number" ? parsed.dim : 0,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

let state: AppearanceState = loadState();
const listeners = new Set<() => void>();

export function toLocalUrl(filePath: string) {
  return `local:${filePath.replaceAll("\\", "/")}`;
}

function applyToDocument(next: AppearanceState) {
  const root = document.documentElement;

  root.dataset.lorroTheme = next.theme;
  root.dataset.lorroBackground = next.background ? next.background.kind : "none";
  root.style.setProperty("--lorro-bg-blur", `${next.blur}px`);
  root.style.setProperty("--lorro-bg-dim", `${next.dim}`);

  window.electron
    ?.setTitlebarTheme?.(next.theme)
    .catch(() => undefined);
}

function persist(next: AppearanceState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota errors */
  }
}

function commit(next: AppearanceState) {
  state = next;
  persist(next);
  applyToDocument(next);
  listeners.forEach((listener) => listener());
}

export function initializeAppearance() {
  applyToDocument(state);
}

export function getAppearance() {
  return state;
}

export function subscribeAppearance(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setAppearance(patch: Partial<AppearanceState>) {
  commit({ ...state, ...patch });
}

export function setTheme(theme: LorroTheme) {
  commit({ ...state, theme });
}

export function setBackground(background: LorroBackground | null) {
  commit({ ...state, background });
}

export function useAppearance() {
  return useSyncExternalStore(subscribeAppearance, getAppearance, getAppearance);
}
