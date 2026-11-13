import type { GameShop } from "./game.types";

export type GameZipImportPhase =
  | "preparing"
  | "copying"
  | "moving"
  | "extracting"
  | "verifying"
  | "detecting-executable"
  | "done";

export type GameZipImportError =
  | "file-not-found"
  | "invalid-zip"
  | "encrypted-zip"
  | "unsafe-archive"
  | "no-space"
  | "permission-denied"
  | "destination-conflict"
  | "already-installed"
  | "game-not-found"
  | "extract-failed"
  | "verify-failed"
  | "cancelled"
  | "unknown";

export interface GameZipImportInspection {
  sourcePath: string;
  fileName: string;
  fileSize: number;
  entryCount: number;
  extractedBytes: number;
  destinationRoot: string;
  destinationZipPath: string;
  extractionPath: string;
  conflicts: ("zip" | "folder")[];
  freeBytes: number | null;
}

export interface GameZipInspectionResult {
  ok: boolean;
  error?: GameZipImportError;
  inspection?: GameZipImportInspection;
  message?: string;
}

export interface GameZipImportOptions {
  operationId: string;
  shop: GameShop;
  objectId: string;
  zipPath: string;
  mode: "copy" | "move";
  extractAutomatically: boolean;
  deleteZipAfterExtraction: boolean;
  overwrite?: boolean;
}

export interface GameZipImportProgress {
  operationId: string;
  shop: GameShop;
  objectId: string;
  phase: GameZipImportPhase;
  progress: number;
  detail?: string | null;
}

export interface GameZipImportResult {
  ok: boolean;
  error?: GameZipImportError;
  message?: string;
  destinationPath?: string;
  installed?: boolean;
}

export interface GameZipExtractResult {
  ok: boolean;
  error?: GameZipImportError;
  message?: string;
  installed?: boolean;
}
