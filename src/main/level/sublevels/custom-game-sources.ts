import type { CustomGameSource } from "@types";

import { db } from "../level";
import { levelKeys } from "./keys";

export const customGameSourcesSublevel = db.sublevel<
  string,
  CustomGameSource[]
>(levelKeys.customGameSources, {
  valueEncoding: "json",
});
