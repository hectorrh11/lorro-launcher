import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type { DownloadProgress, GameShop } from "@types";

import {
  DOWNLOAD_SPEED_SAMPLE_MAX_AGE_MS,
  MAX_DOWNLOAD_SPEED_HISTORY,
  MAX_DOWNLOAD_SPEED_SAMPLES,
} from "@renderer/constants";

export interface ExtractionInfo {
  visibleId: string;
  progress: number;
}

export interface DownloadSpeedSample {
  t: number;
  v: number;
}

export interface DownloadState {
  lastPacket: DownloadProgress | null;
  gameId: string | null;
  gamesWithDeletionInProgress: string[];
  extraction: ExtractionInfo | null;
  peakSpeeds: Record<string, number>;
  speedHistory: Record<string, number[]>;
  speedSamples: Record<string, DownloadSpeedSample[]>;
}

const initialState: DownloadState = {
  lastPacket: null,
  gameId: null,
  gamesWithDeletionInProgress: [],
  extraction: null,
  peakSpeeds: {},
  speedHistory: {},
  speedSamples: {},
};

function pushSpeedSample(
  samples: DownloadSpeedSample[],
  downloadSpeed: number
): void {
  const now = Date.now();
  samples.push({ t: now, v: downloadSpeed });

  const cutoff = now - DOWNLOAD_SPEED_SAMPLE_MAX_AGE_MS;
  let expired = 0;
  while (expired < samples.length && samples[expired].t < cutoff) {
    expired++;
  }
  if (expired > 0) samples.splice(0, expired);

  const excess = samples.length - MAX_DOWNLOAD_SPEED_SAMPLES;
  if (excess > 0) samples.splice(0, excess);
}

export const downloadSlice = createSlice({
  name: "download",
  initialState,
  reducers: {
    setLastPacket: (state, action: PayloadAction<DownloadProgress | null>) => {
      state.lastPacket = action.payload;
      const payload = action.payload;
      if (!state.gameId && payload?.gameId) {
        state.gameId = payload.gameId;
      }
      if (
        payload?.gameId &&
        payload.downloadSpeed != null &&
        !payload.isCheckingFiles &&
        !payload.isDownloadingMetadata
      ) {
        const { gameId, downloadSpeed } = payload;
        const currentPeak = state.peakSpeeds[gameId] || 0;
        if (downloadSpeed > currentPeak) {
          state.peakSpeeds[gameId] = downloadSpeed;
        }
        if (!state.speedHistory[gameId]) {
          state.speedHistory[gameId] = [];
        }
        state.speedHistory[gameId].push(downloadSpeed);

        const excess =
          state.speedHistory[gameId].length - MAX_DOWNLOAD_SPEED_HISTORY;
        if (excess > 0) {
          state.speedHistory[gameId].splice(0, excess);
        }

        if (!state.speedSamples[gameId]) {
          state.speedSamples[gameId] = [];
        }
        pushSpeedSample(state.speedSamples[gameId], downloadSpeed);
      }
    },
    clearDownload: (state) => {
      state.lastPacket = null;
      state.gameId = null;
    },
    setGameDeleting: (state, action: PayloadAction<string>) => {
      if (
        !state.gamesWithDeletionInProgress.includes(action.payload) &&
        action.payload
      ) {
        state.gamesWithDeletionInProgress.push(action.payload);
      }
    },
    removeGameFromDeleting: (state, action: PayloadAction<string>) => {
      const index = state.gamesWithDeletionInProgress.indexOf(action.payload);
      if (index >= 0) state.gamesWithDeletionInProgress.splice(index, 1);
    },
    setExtractionProgress: (
      state,
      action: PayloadAction<{
        shop: GameShop;
        objectId: string;
        progress: number;
      }>
    ) => {
      const { shop, objectId, progress } = action.payload;
      state.extraction = {
        visibleId: `${shop}:${objectId}`,
        progress,
      };
    },
    clearExtraction: (state) => {
      state.extraction = null;
    },
    updatePeakSpeed: (
      state,
      action: PayloadAction<{ gameId: string; speed: number }>
    ) => {
      const { gameId, speed } = action.payload;
      const currentPeak = state.peakSpeeds[gameId] || 0;
      if (speed > currentPeak) {
        state.peakSpeeds[gameId] = speed;
      }
    },
    clearPeakSpeed: (state, action: PayloadAction<string>) => {
      state.peakSpeeds[action.payload] = 0;
      state.speedHistory[action.payload] = [];
      state.speedSamples[action.payload] = [];
    },
  },
});

export const {
  setLastPacket,
  clearDownload,
  setGameDeleting,
  removeGameFromDeleting,
  setExtractionProgress,
  clearExtraction,
  updatePeakSpeed,
  clearPeakSpeed,
} = downloadSlice.actions;
