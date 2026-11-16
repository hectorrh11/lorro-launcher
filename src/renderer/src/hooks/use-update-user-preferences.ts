import { useCallback } from "react";
import type { UserPreferences } from "@types";
import { useAppDispatch } from "./redux";
import { setUserPreferences } from "@renderer/features";
import { levelDBService } from "@renderer/services/leveldb.service";

export function useUpdateUserPreferences() {
  const dispatch = useAppDispatch();

  return useCallback(
    async (values: Partial<UserPreferences>) => {
      await window.electron.updateUserPreferences(values);
      const userPreferences = await levelDBService.get(
        "userPreferences",
        null,
        "json"
      );
      dispatch(setUserPreferences(userPreferences as UserPreferences | null));
    },
    [dispatch]
  );
}
