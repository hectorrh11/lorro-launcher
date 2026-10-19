import { Downloader } from "@shared";

export const DOWNLOADER_NAME = {
  [Downloader.RealDebrid]: "Real-Debrid",
  [Downloader.Torrent]: "Torrent",
  [Downloader.Gofile]: "Gofile",
  [Downloader.PixelDrain]: "PixelDrain",
  [Downloader.Datanodes]: "Datanodes",
  [Downloader.Mediafire]: "Mediafire",
  [Downloader.FuckingFast]: "FuckingFast",
  [Downloader.TorBox]: "TorBox",
  [Downloader.Hydra]: "Nimbus",
  [Downloader.VikingFile]: "VikingFile",
  [Downloader.Rootz]: "Rootz",
  [Downloader.Premiumize]: "Premiumize",
  [Downloader.AllDebrid]: "AllDebrid",
  [Downloader.ArchiveOrg]: "Archive.org",
  [Downloader.Epic]: "Epic Games",
};

export const MAX_MINUTES_TO_SHOW_IN_PLAYTIME = 120;

export const MILLISECONDS_IN_HOUR = 60 * 60 * 1000;

export const REVIEW_MIN_PLAYTIME_IN_MS = 1 * MILLISECONDS_IN_HOUR;

export const REVIEW_PROMPT_DISMISS_TTL_IN_MS = 7 * 24 * 60 * 60 * 1000;

export const REVIEW_BANNER_IMAGE_SIZE = { width: 960, height: 140 };

export const MAX_DOWNLOAD_SPEED_HISTORY = 300;

export const MAX_DOWNLOAD_SPEED_SAMPLES = 7200;

export const DOWNLOAD_SPEED_SAMPLE_MAX_AGE_MS = 60 * 60 * 1000;

export interface DownloadSpeedAverageWindow {
  key: string;
  labelKey: string;
  milliseconds: number | null;
}

export const DOWNLOAD_SPEED_AVERAGE_WINDOWS: DownloadSpeedAverageWindow[] = [
  { key: "total", labelKey: "average_window_total", milliseconds: null },
  {
    key: "hour",
    labelKey: "average_window_last_hour",
    milliseconds: 60 * 60 * 1000,
  },
  {
    key: "half_hour",
    labelKey: "average_window_last_30_minutes",
    milliseconds: 30 * 60 * 1000,
  },
  {
    key: "quarter_hour",
    labelKey: "average_window_last_15_minutes",
    milliseconds: 15 * 60 * 1000,
  },
  {
    key: "five_minutes",
    labelKey: "average_window_last_5_minutes",
    milliseconds: 5 * 60 * 1000,
  },
];

export const THEME_WEB_STORE_URL = "https://hydrathemes.shop";
