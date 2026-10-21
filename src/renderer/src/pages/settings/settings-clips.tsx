import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileDirectoryIcon, VideoIcon } from "@primer/octicons-react";
import {
  Button,
  CheckboxField,
  SelectField,
  TextField,
} from "@renderer/components";
import { useToast } from "@renderer/hooks";
import type { LorroClipSettings } from "@types";

import "./settings-clips.scss";

const DURATIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90];

const KEY_NAMES: Record<string, string> = {
  " ": "Space",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Escape: "Escape",
  Enter: "Return",
  Backspace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  Tab: "Tab",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
};



const buildAccelerator = (event: React.KeyboardEvent<HTMLInputElement>) => {
  const modifiers: string[] = [];
  if (event.ctrlKey) modifiers.push("Control");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  if (event.metaKey) modifiers.push("Super");

  const key = KEY_NAMES[event.key] ?? event.key;
  const isLetterOrDigit = /^[a-z0-9]$/i.test(key);
  const isFunctionKey = /^F([1-9]|1[0-9]|2[0-4])$/.test(key);
  const isNamedKey = Boolean(KEY_NAMES[event.key]);

  if (!isLetterOrDigit && !isFunctionKey && !isNamedKey) return null;
  if (!modifiers.length) return null;

  return [...modifiers, key.toUpperCase()].join("+");
};

export function SettingsClips() {
  const { t } = useTranslation("settings");
  const { t: tRoot } = useTranslation();
  const { showErrorToast, showSuccessToast } = useToast();

  const [settings, setSettings] = useState<LorroClipSettings | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void window.electron.getClipSettings().then(setSettings);
  }, []);

  const update = useCallback(
    async (patch: Partial<LorroClipSettings>) => {
      setSaving(true);
      try {
        const result = await window.electron.updateClipSettings(patch);
        setSettings(result.settings);

        if (!result.ok) {
          showErrorToast(result.message);
        } else if (patch.enabled === true) {
          showSuccessToast(tRoot("clips.enabled_toast", "Clips are ready"));
        }
      } catch {
        showErrorToast(tRoot("clips.save_failed", "Could not save the clip."));
      } finally {
        setSaving(false);
      }
    },
    [showErrorToast, showSuccessToast, tRoot]
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Tab") return;
    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
      setCapturing(false);
      inputRef.current?.blur();
      return;
    }

    const accelerator = buildAccelerator(event);
    if (!accelerator) return;

    setCapturing(false);
    inputRef.current?.blur();
    void update({ hotkey: accelerator });
  };

  const durationOptions = DURATIONS.map((seconds) => ({
    key: String(seconds),
    value: String(seconds),
    label: t("clips_duration_value", "{{count}} seconds").replace(
      "{{count}}",
      String(seconds)
    ),
  }));

  return (
    <div className="settings-context-panel settings-clips">
      <div className="settings-context-panel__group">
        <div className="settings-clips__header">
          <VideoIcon size={20} />
          <div>
            <h3>{t("clips_enabled_section", "Clip recording")}</h3>
            <p className="settings-clips__hint">
              {t(
                "clips_description",
                "Lorro keeps a rolling buffer of your screen and saves the last moments when you press the shortcut."
              )}
            </p>
          </div>
        </div>

        <CheckboxField
          label={t("clips_enabled", "Record clips in the background")}
          checked={settings?.enabled ?? false}
          disabled={!settings || saving}
          onChange={() => void update({ enabled: !settings?.enabled })}
        />
      </div>

      {settings?.enabled && (
        <div className="settings-context-panel__group">
          <h3>{t("clips_shortcut_section", "Shortcut and capture")}</h3>

          <TextField
            ref={inputRef}
            label={t("clips_hotkey", "Save clip shortcut")}
            value={
              capturing
                ? t("clips_hotkey_press", "Press the new shortcut...")
                : settings.hotkey
            }
            readOnly
            onFocus={() => setCapturing(true)}
            onBlur={() => setCapturing(false)}
            onKeyDown={handleKeyDown}
            className="settings-clips__hotkey"
          />

          <p className="settings-clips__hint">
            {t(
              "clips_hotkey_hint",
              "Click the field and press a combination with Ctrl, Alt, Shift or Windows."
            )}
          </p>

          {!settings.registered && (
            <p className="settings-clips__warning">
              {t(
                "clips_hotkey_unavailable",
                "The shortcut could not be registered because another application is using it. Choose a different one."
              )}
            </p>
          )}

          <SelectField
            label={t("clips_duration", "Clip length")}
            value={String(settings.durationSeconds)}
            onChange={(event) =>
              void update({ durationSeconds: Number(event.target.value) })
            }
            options={durationOptions}
          />

          <CheckboxField
            label={t(
              "clips_system_audio",
              "Record system audio (game, Discord, music)"
            )}
            checked={settings.systemAudio}
            onChange={() => void update({ systemAudio: !settings.systemAudio })}
          />

          <CheckboxField
            label={t("clips_microphone", "Record microphone")}
            checked={settings.microphone}
            onChange={() => void update({ microphone: !settings.microphone })}
          />

          <Button
            theme="outline"
            onClick={() => void window.electron.openClipsFolder()}
          >
            <FileDirectoryIcon size={16} />
            {t("clips_open_folder", "Open clips folder")}
          </Button>
        </div>
      )}
    </div>
  );
}
