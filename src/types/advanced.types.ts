export interface LaunchToolStep {
  path: string;
  arguments: string;
}

export type LaunchWindowMode = "windowed" | "fullscreen" | "borderless";

export interface LaunchProfile {
  id: string;
  name: string;
  executablePath: string;
  workingDirectory: string;
  arguments: string;
  environment: Record<string, string>;
  windowMode: LaunchWindowMode;
  externalTools: LaunchToolStep[];
  preLaunch: LaunchToolStep[];
  isDefault: boolean;
}

export interface LaunchProfileValidation {
  valid: boolean;
  executableExists: boolean;
  workingDirectoryExists: boolean;
  messages: string[];
}

export interface SaveBackupConfig {
  destinationDir: string | null;
  maxCount: number;
  maxAgeDays: number;
  autoOnClose: boolean;
}

export interface SaveBackupEntry {
  id: string;
  gameKey: string;
  gameTitle: string;
  createdAt: string;
  reason: string;
  sizeBytes: number;
  files: string[];
  path: string;
  skippedDuplicate?: boolean;
}

export interface SaveBackupGameConfig {
  savePaths: string[];
}

export interface GameSession {
  id: string;
  start: string;
  end: string | null;
  durationMs: number;
  recovered?: boolean;
  corrected?: boolean;
}

export interface LorroGameStats {
  gameKey: string;
  gameTitle: string;
  sessions: GameSession[];
}

export interface LorroStatsSummary {
  totalPlaytimeMs: number;
  totalSessions: number;
  gamesPlayed: number;
  mostUsed: { gameKey: string; gameTitle: string; playtimeMs: number }[];
  byDay: { date: string; playtimeMs: number }[];
  byWeek: { week: string; playtimeMs: number }[];
  byMonth: { month: string; playtimeMs: number }[];
}

export type DiagnosticStatus = "ok" | "warning" | "error" | "unknown";

export interface DiagnosticCheck {
  id: string;
  label: string;
  status: DiagnosticStatus;
  message: string;
  fixable?: boolean;
}

export interface DiagnosticReport {
  gameKey: string;
  checkedAt: string;
  checks: DiagnosticCheck[];
}

export interface StorageGameEntry {
  gameKey: string;
  title: string;
  shop: string;
  installPath: string | null;
  sizeBytes: number;
  possibleDuplicateOf?: string | null;
}

export interface StorageDrive {
  path: string;
  label: string;
  total: number;
  free: number;
}

export interface StorageCacheEntry {
  id: string;
  label: string;
  path: string;
  sizeBytes: number;
  safeToClean: boolean;
}

export interface StorageReport {
  drives: StorageDrive[];
  games: StorageGameEntry[];
  caches: StorageCacheEntry[];
  totalGamesBytes: number;
}
