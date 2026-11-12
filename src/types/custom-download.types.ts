export type CustomDownloadStatus =
  | "queued"
  | "active"
  | "paused"
  | "complete"
  | "error"
  | "canceled";

export interface CustomDownloadSegment {
  start: number;
  end: number;
  downloaded: number;
}

export interface CustomDownload {
  id: string;
  url: string;
  title: string;
  fileName: string;
  destinationDir: string;
  filePath: string;
  totalBytes: number;
  bytesDownloaded: number;
  status: CustomDownloadStatus;
  speed: number;
  error: string | null;
  createdAt: number;
  completedAt: number | null;
  addToLibrary: boolean;
  libraryGameId: string | null;
  connections: number;
  segments: CustomDownloadSegment[] | null;
}

export interface StartCustomDownloadPayload {
  url: string;
  title?: string;
  destinationDir?: string;
  addToLibrary?: boolean;
  connections?: number;
}

export interface CustomGameSource {
  id: string;
  url: string;
  label: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CustomGameSourceError =
  | "invalid-url"
  | "duplicate"
  | "not-found"
  | "unknown";

export interface CustomGameSourceMutationResult {
  ok: boolean;
  error?: CustomGameSourceError;
  source?: CustomGameSource;
}

export interface ExternalDownloadManagerInfo {
  available: boolean;
  name: string | null;
  path: string | null;
  mode: "command" | "clipboard" | "none";
}
