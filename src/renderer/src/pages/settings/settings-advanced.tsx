import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DiagnosticReport,
  LaunchProfile,
  LaunchProfileValidation,
  LaunchToolStep,
  LorroGameStats,
  LorroStatsSummary,
  SaveBackupConfig,
  SaveBackupEntry,
  StorageReport,
} from "@types";
import { Button, SelectField } from "@renderer/components";
import { useLibrary, useToast } from "@renderer/hooks";
import "./settings-advanced.scss";

type AdvancedTab =
  | "profiles"
  | "backups"
  | "stats"
  | "storage"
  | "diagnostics";

const formatBytes = (bytes: number) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const formatDate = (value: string | Date | null) => {
  if (!value) return "—";
  return new Date(value).toLocaleString();
};

const formatDuration = (milliseconds: number) => {
  const totalMinutes = Math.floor(milliseconds / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
};

function gameKeyOf(game: { shop: string; objectId: string }) {
  return `${game.shop}:${game.objectId}`;
}

export function SettingsAdvanced() {
  const { t } = useTranslation("settings");
  const [tab, setTab] = useState<AdvancedTab>("profiles");
  const { library } = useLibrary();

  const gameOptions = useMemo(
    () =>
      library.map((game) => ({
        key: gameKeyOf(game),
        value: gameKeyOf(game),
        label: game.title,
      })),
    [library]
  );

  const tabs: { id: AdvancedTab; label: string }[] = [
    { id: "profiles", label: t("advanced_tab_profiles", "Launch profiles") },
    { id: "backups", label: t("advanced_tab_backups", "Backups") },
    { id: "stats", label: t("advanced_tab_stats", "Statistics") },
    { id: "storage", label: t("advanced_tab_storage", "Storage") },
    { id: "diagnostics", label: t("advanced_tab_diagnostics", "Diagnostics") },
  ];

  return (
    <div className="settings-advanced">
      <div className="settings-advanced__tabs">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`settings-advanced__tab${
              tab === item.id ? " settings-advanced__tab--active" : ""
            }`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "profiles" && <ProfilesTab gameOptions={gameOptions} />}
      {tab === "backups" && <BackupsTab gameOptions={gameOptions} />}
      {tab === "stats" && <StatsTab gameOptions={gameOptions} />}
      {tab === "storage" && <StorageTab />}
      {tab === "diagnostics" && <DiagnosticsTab gameOptions={gameOptions} />}
    </div>
  );
}

interface GameOption {
  key: string;
  value: string;
  label: string;
}

interface TabProps {
  gameOptions: GameOption[];
}

function BackupsTab({ gameOptions }: TabProps) {
  const { t } = useTranslation("settings");
  const { showErrorToast, showSuccessToast } = useToast();
  const [config, setConfig] = useState<SaveBackupConfig | null>(null);
  const [backups, setBackups] = useState<SaveBackupEntry[]>([]);
  const [gameKey, setGameKey] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const [nextConfig, nextBackups] = await Promise.all([
      window.electron.getSaveBackupConfig(),
      window.electron.listSaveBackups(),
    ]);
    setConfig(nextConfig);
    setBackups(nextBackups);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!gameKey && gameOptions.length) setGameKey(gameOptions[0].value);
  }, [gameKey, gameOptions]);

  const updateConfig = async (patch: Partial<SaveBackupConfig>) => {
    const next = await window.electron.updateSaveBackupConfig(patch);
    setConfig(next);
  };

  const chooseDestination = async () => {
    const { canceled, filePaths } = await window.electron.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
    });
    if (!canceled && filePaths[0]) {
      await updateConfig({ destinationDir: filePaths[0] });
    }
  };

  const createNow = async () => {
    if (!gameKey) return;
    setLoading(true);
    try {
      const entry = await window.electron.createSaveBackup(gameKey);
      if (entry) showSuccessToast(t("advanced_backup_created", "Backup created"));
      else
        showErrorToast(
          t(
            "advanced_backup_no_paths",
            "This game has no save folder configured or the folder does not exist."
          )
        );
      await load();
    } catch (error) {
      showErrorToast(String(error));
    } finally {
      setLoading(false);
    }
  };

  const restore = async (entry: SaveBackupEntry) => {
    if (
      !window.confirm(
        t(
          "advanced_restore_confirm",
          "Restore this backup? The current save files will be backed up first."
        )
      )
    )
      return;
    const result = await window.electron.restoreSaveBackup(entry.id);
    if (result.ok) showSuccessToast(t("advanced_restore_ok", "Backup restored"));
    else showErrorToast(result.message ?? "");
    await load();
  };

  const remove = async (entry: SaveBackupEntry) => {
    if (!window.confirm(t("advanced_delete_confirm", "Delete this backup?")))
      return;
    await window.electron.deleteSaveBackup(entry.id);
    await load();
  };

  const exportEntry = async (entry: SaveBackupEntry) => {
    const { canceled, filePaths } = await window.electron.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
    });
    if (canceled || !filePaths[0]) return;
    await window.electron.exportSaveBackup(entry.id, filePaths[0]);
    showSuccessToast(t("advanced_exported", "Backup exported"));
  };

  const importEntry = async () => {
    const { canceled, filePaths } = await window.electron.showOpenDialog({
      properties: ["openDirectory"],
    });
    if (canceled || !filePaths[0]) return;
    try {
      await window.electron.importSaveBackup(filePaths[0]);
      showSuccessToast(t("advanced_imported", "Backup imported"));
      await load();
    } catch (error) {
      showErrorToast(String(error));
    }
  };

  return (
    <div className="settings-advanced__panel">
      <h2 className="settings-advanced__title">
        {t("advanced_tab_backups", "Backups")}
      </h2>
      <p className="settings-advanced__hint">
        {t(
          "advanced_backups_hint",
          "Automatic backups run when a game closes. You can also create one manually or restore any previous snapshot. Lorro never deletes your only copy."
        )}
      </p>

      {config && (
        <div className="settings-advanced__card">
          <div className="settings-advanced__row">
            <label>
              {t("advanced_max_count", "Maximum backups per game")}
              <input
                className="settings-advanced__input"
                type="number"
                min={1}
                max={500}
                value={config.maxCount}
                onChange={(e) =>
                  void updateConfig({ maxCount: Number(e.target.value) })
                }
              />
            </label>
            <label>
              {t("advanced_max_age", "Maximum age (days, 0 = unlimited)")}
              <input
                className="settings-advanced__input"
                type="number"
                min={0}
                value={config.maxAgeDays}
                onChange={(e) =>
                  void updateConfig({ maxAgeDays: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <div className="settings-advanced__row">
            <label className="settings-advanced__checkbox">
              <input
                type="checkbox"
                checked={config.autoOnClose}
                onChange={(e) =>
                  void updateConfig({ autoOnClose: e.target.checked })
                }
              />
              {t("advanced_auto_on_close", "Back up automatically when a game closes")}
            </label>
          </div>
          <div className="settings-advanced__row">
            <span className="settings-advanced__path">
              {config.destinationDir ??
                t("advanced_default_destination", "Default Lorro data folder")}
            </span>
            <Button theme="outline" onClick={chooseDestination}>
              {t("advanced_choose_folder", "Choose folder")}
            </Button>
          </div>
        </div>
      )}

      <div className="settings-advanced__card">
        <div className="settings-advanced__row">
          <SelectField
            theme="dark"
            value={gameKey}
            onChange={(e) => setGameKey(e.target.value)}
            options={gameOptions}
          />
          <Button theme="primary" onClick={createNow} disabled={loading || !gameKey}>
            {t("advanced_create_backup", "Back up now")}
          </Button>
          <Button theme="outline" onClick={importEntry}>
            {t("advanced_import_backup", "Import")}
          </Button>
        </div>
      </div>

      <div className="settings-advanced__list">
        {backups.length === 0 && (
          <p className="settings-advanced__empty">
            {t("advanced_no_backups", "No backups yet.")}
          </p>
        )}
        {backups.map((entry) => (
          <div key={entry.id} className="settings-advanced__item">
            <div>
              <strong>{entry.gameTitle}</strong>
              <span className="settings-advanced__meta">
                {formatDate(entry.createdAt)} · {formatBytes(entry.sizeBytes)} ·{" "}
                {entry.reason}
              </span>
            </div>
            <div className="settings-advanced__actions">
              <Button theme="outline" onClick={() => void restore(entry)}>
                {t("advanced_restore", "Restore")}
              </Button>
              <Button theme="outline" onClick={() => void exportEntry(entry)}>
                {t("advanced_export", "Export")}
              </Button>
              <Button theme="danger" onClick={() => void remove(entry)}>
                {t("advanced_delete", "Delete")}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatsTab({ gameOptions }: TabProps) {
  const { t } = useTranslation("settings");
  const [summary, setSummary] = useState<LorroStatsSummary | null>(null);
  const [gameKey, setGameKey] = useState("");
  const [stats, setStats] = useState<LorroGameStats | null>(null);

  useEffect(() => {
    void window.electron.getPlaytimeStatsSummary().then(setSummary);
  }, []);

  useEffect(() => {
    if (!gameKey && gameOptions.length) setGameKey(gameOptions[0].value);
  }, [gameKey, gameOptions]);

  useEffect(() => {
    if (!gameKey) return;
    void window.electron.getPlaytimeStats(gameKey).then(setStats);
  }, [gameKey]);

  const reload = async () => {
    setSummary(await window.electron.getPlaytimeStatsSummary());
    if (gameKey) setStats(await window.electron.getPlaytimeStats(gameKey));
  };

  const correct = async (sessionId: string, currentMs: number) => {
    const minutes = window.prompt(
      t("advanced_correct_minutes", "Correct duration in minutes"),
      String(Math.round(currentMs / 60000))
    );
    if (minutes === null) return;
    await window.electron.correctPlaytimeSession(
      gameKey,
      sessionId,
      Math.max(0, Number(minutes)) * 60000
    );
    await reload();
  };

  return (
    <div className="settings-advanced__panel">
      <h2 className="settings-advanced__title">
        {t("advanced_tab_stats", "Statistics")}
      </h2>

      {summary && (
        <div className="settings-advanced__grid">
          <div className="settings-advanced__stat">
            <span>{t("advanced_total_time", "Total playtime")}</span>
            <strong>{formatDuration(summary.totalPlaytimeMs)}</strong>
          </div>
          <div className="settings-advanced__stat">
            <span>{t("advanced_total_sessions", "Sessions")}</span>
            <strong>{summary.totalSessions}</strong>
          </div>
          <div className="settings-advanced__stat">
            <span>{t("advanced_games_played", "Games played")}</span>
            <strong>{summary.gamesPlayed}</strong>
          </div>
        </div>
      )}

      {summary && summary.mostUsed.length > 0 && (
        <div className="settings-advanced__card">
          <h3 className="settings-advanced__subtitle">
            {t("advanced_most_used", "Most played")}
          </h3>
          {summary.mostUsed.map((item) => (
            <div key={item.gameKey} className="settings-advanced__row">
              <span>{item.gameTitle}</span>
              <span className="settings-advanced__meta">
                {formatDuration(item.playtimeMs)}
              </span>
            </div>
          ))}
        </div>
      )}

      {summary && summary.byDay.length > 0 && (
        <div className="settings-advanced__card">
          <h3 className="settings-advanced__subtitle">
            {t("advanced_activity_by_day", "Activity by day")}
          </h3>
          <div className="settings-advanced__bars">
            {summary.byDay.slice(-30).map((day) => {
              const max = Math.max(...summary.byDay.map((d) => d.playtimeMs), 1);
              return (
                <div
                  key={day.date}
                  className="settings-advanced__bar"
                  title={`${day.date} · ${formatDuration(day.playtimeMs)}`}
                  style={{ height: `${Math.max(4, (day.playtimeMs / max) * 100)}%` }}
                />
              );
            })}
          </div>
        </div>
      )}

      <div className="settings-advanced__card">
        <SelectField
          theme="dark"
          value={gameKey}
          onChange={(e) => setGameKey(e.target.value)}
          options={gameOptions}
        />
        {stats && stats.sessions.length === 0 && (
          <p className="settings-advanced__empty">
            {t("advanced_no_sessions", "No sessions recorded yet.")}
          </p>
        )}
        {stats?.sessions
          .slice()
          .reverse()
          .map((session) => (
            <div key={session.id} className="settings-advanced__row">
              <span>
                {formatDate(session.start)}
                {session.recovered ? " (recovered)" : ""}
                {session.corrected ? " (edited)" : ""}
              </span>
              <span className="settings-advanced__meta">
                {formatDuration(session.durationMs)}
              </span>
              <div className="settings-advanced__actions">
                <Button
                  theme="outline"
                  onClick={() => void correct(session.id, session.durationMs)}
                >
                  {t("advanced_correct", "Correct")}
                </Button>
                <Button
                  theme="danger"
                  onClick={async () => {
                    await window.electron.deletePlaytimeSession(gameKey, session.id);
                    await reload();
                  }}
                >
                  {t("advanced_delete", "Delete")}
                </Button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function StorageTab() {
  const { t } = useTranslation("settings");
  const { showSuccessToast, showErrorToast } = useToast();
  const [report, setReport] = useState<StorageReport | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setReport(await window.electron.getStorageReport());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const clean = async () => {
    if (!report) return;
    const ids = report.caches.map((cache) => cache.id);
    if (!ids.length) return;
    if (
      !window.confirm(
        t("advanced_clean_confirm", "Clean Lorro caches and temporary files?")
      )
    )
      return;
    setBusy(true);
    const result = await window.electron.cleanStorageCaches(ids);
    setBusy(false);
    showSuccessToast(
      t("advanced_clean_done", "Freed {{size}}", {
        size: formatBytes(result.freedBytes),
      })
    );
    await load();
  };

  const move = async (gameKey: string) => {
    const { canceled, filePaths } = await window.electron.showOpenDialog({
      properties: ["openDirectory"],
    });
    if (canceled || !filePaths[0]) return;
    setBusy(true);
    const result = await window.electron.moveGameInstallation(
      gameKey,
      filePaths[0]
    );
    setBusy(false);
    if (result.moved) showSuccessToast(t("advanced_move_ok", "Game moved"));
    else showErrorToast(result.message ?? t("advanced_move_failed", "Move failed"));
    await load();
  };

  return (
    <div className="settings-advanced__panel">
      <h2 className="settings-advanced__title">
        {t("advanced_tab_storage", "Storage")}
      </h2>

      {report && (
        <>
          <div className="settings-advanced__grid">
            {report.drives.map((drive) => (
              <div key={drive.path} className="settings-advanced__stat">
                <span>{drive.path}</span>
                <strong>{formatBytes(drive.free)} free</strong>
                <span className="settings-advanced__meta">
                  {formatBytes(drive.total)} total
                </span>
              </div>
            ))}
          </div>

          <div className="settings-advanced__card">
            <div className="settings-advanced__row">
              <h3 className="settings-advanced__subtitle">
                {t("advanced_caches", "Lorro caches and temporary files")}
              </h3>
              <Button theme="outline" onClick={clean} disabled={busy}>
                {t("advanced_clean_caches", "Clean")}
              </Button>
            </div>
            {report.caches.map((cache) => (
              <div key={cache.id} className="settings-advanced__row">
                <span>{cache.label}</span>
                <span className="settings-advanced__meta">
                  {formatBytes(cache.sizeBytes)}
                </span>
              </div>
            ))}
          </div>

          <div className="settings-advanced__card">
            <h3 className="settings-advanced__subtitle">
              {t("advanced_games_size", "Games")} ·{" "}
              {formatBytes(report.totalGamesBytes)}
            </h3>
            {report.games.map((game) => (
              <div key={game.gameKey} className="settings-advanced__row">
                <div>
                  <strong>{game.title}</strong>
                  <span className="settings-advanced__meta">
                    {game.installPath ?? "—"}
                    {game.possibleDuplicateOf ? " · possible duplicate" : ""}
                  </span>
                </div>
                <span className="settings-advanced__meta">
                  {formatBytes(game.sizeBytes)}
                </span>
                <Button
                  theme="outline"
                  onClick={() => void move(game.gameKey)}
                  disabled={busy || !game.installPath}
                >
                  {t("advanced_move", "Move")}
                </Button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DiagnosticsTab({ gameOptions }: TabProps) {
  const { t } = useTranslation("settings");
  const { showErrorToast } = useToast();
  const [gameKey, setGameKey] = useState("");
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!gameKey && gameOptions.length) setGameKey(gameOptions[0].value);
  }, [gameKey, gameOptions]);

  const run = async () => {
    setBusy(true);
    setReport(await window.electron.runGameDiagnostics(gameKey));
    setBusy(false);
  };

  const fix = async (checkId: string) => {
    const result = await window.electron.fixGameDiagnostic(gameKey, checkId);
    if (result.fixed) await run();
    else showErrorToast(result.message);
  };

  return (
    <div className="settings-advanced__panel">
      <h2 className="settings-advanced__title">
        {t("advanced_tab_diagnostics", "Diagnostics")}
      </h2>
      <div className="settings-advanced__card">
        <div className="settings-advanced__row">
          <SelectField
            theme="dark"
            value={gameKey}
            onChange={(e) => {
              setGameKey(e.target.value);
              setReport(null);
            }}
            options={gameOptions}
          />
          <Button theme="primary" onClick={run} disabled={busy || !gameKey}>
            {t("advanced_run", "Run checks")}
          </Button>
          {report && (
            <Button
              theme="outline"
              onClick={() =>
                void navigator.clipboard.writeText(JSON.stringify(report, null, 2))
              }
            >
              {t("advanced_export_report", "Copy report")}
            </Button>
          )}
        </div>
      </div>

      {report?.checks.map((check) => (
        <div
          key={check.id}
          className={`settings-advanced__check settings-advanced__check--${check.status}`}
        >
          <div>
            <strong>{check.label}</strong>
            <p className="settings-advanced__meta">{check.message}</p>
          </div>
          {check.fixable && (
            <Button theme="outline" onClick={() => void fix(check.id)}>
              {t("advanced_fix", "Fix")}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

function ProfilesTab({ gameOptions }: TabProps) {
  const { t } = useTranslation("settings");
  const { showErrorToast, showSuccessToast } = useToast();
  const [gameKey, setGameKey] = useState("");
  const [profiles, setProfiles] = useState<LaunchProfile[]>([]);
  const [editing, setEditing] = useState<LaunchProfile | null>(null);
  const [validation, setValidation] = useState<LaunchProfileValidation | null>(
    null
  );
  const [envText, setEnvText] = useState("");
  const [toolsText, setToolsText] = useState("");
  const [preText, setPreText] = useState("");

  useEffect(() => {
    if (!gameKey && gameOptions.length) setGameKey(gameOptions[0].value);
  }, [gameKey, gameOptions]);

  const load = useCallback(async (key: string) => {
    if (!key) return;
    setProfiles(await window.electron.listLaunchProfiles(key));
    setEditing(null);
    setValidation(null);
  }, []);

  useEffect(() => {
    void load(gameKey);
  }, [gameKey, load]);

  const startEditing = (profile: LaunchProfile) => {
    setEditing(profile);
    setValidation(null);
    setEnvText(
      Object.entries(profile.environment)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n")
    );
    setToolsText(
      profile.externalTools
        .map((step) => `${step.path}|${step.arguments}`)
        .join("\n")
    );
    setPreText(
      profile.preLaunch
        .map((step) => `${step.path}|${step.arguments}`)
        .join("\n")
    );
  };

  const createProfile = () =>
    startEditing({
      id: crypto.randomUUID(),
      name: t("advanced_profile_new_name", "New profile"),
      executablePath: "",
      workingDirectory: "",
      arguments: "",
      environment: {},
      windowMode: "windowed",
      externalTools: [],
      preLaunch: [],
      isDefault: profiles.length === 0,
    });

  const update = (patch: Partial<LaunchProfile>) =>
    setEditing((prev) => (prev ? { ...prev, ...patch } : prev));

  const textToSteps = (text: string): LaunchToolStep[] =>
    text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf("|");
        return index === -1
          ? { path: line, arguments: "" }
          : {
              path: line.slice(0, index).trim(),
              arguments: line.slice(index + 1).trim(),
            };
      });

  const parseEnv = (text: string) => {
    const result: Record<string, string> = {};
    for (const line of text.split("\n")) {
      const index = line.indexOf("=");
      if (index > 0) result[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    }
    return result;
  };

  const choose = async (
    target: "executablePath" | "workingDirectory",
    kind: "file" | "dir"
  ) => {
    const { canceled, filePaths } = await window.electron.showOpenDialog({
      properties:
        kind === "file" ? ["openFile"] : ["openDirectory", "createDirectory"],
      filters:
        kind === "file"
          ? [{ name: "Executables", extensions: ["exe"] }]
          : undefined,
    });
    if (!canceled && filePaths[0]) update({ [target]: filePaths[0] });
  };

  const collect = (profile: LaunchProfile): LaunchProfile => ({
    ...profile,
    environment: parseEnv(envText),
    externalTools: textToSteps(toolsText),
    preLaunch: textToSteps(preText),
  });

  const save = async () => {
    if (!editing || !gameKey) return;
    if (!editing.name.trim()) {
      showErrorToast(t("advanced_profile_name_required", "The name is required."));
      return;
    }
    try {
      setProfiles(
        await window.electron.saveLaunchProfile(gameKey, collect(editing))
      );
      showSuccessToast(t("advanced_profile_saved", "Profile saved"));
      setEditing(null);
      setValidation(null);
    } catch (error) {
      showErrorToast(String(error));
    }
  };

  const check = async () => {
    if (!editing) return;
    setValidation(await window.electron.validateLaunchProfile(collect(editing)));
  };

  const run = async (profile: LaunchProfile) => {
    try {
      const result = await window.electron.launchWithProfile(
        gameKey,
        profile.id
      );
      showSuccessToast(
        `${t("advanced_profile_launched", "Game launched")}: ${result.command}`
      );
    } catch (error) {
      showErrorToast(String(error));
    }
  };

  const duplicate = async (profile: LaunchProfile) => {
    setProfiles(
      await window.electron.duplicateLaunchProfile(gameKey, profile.id)
    );
    showSuccessToast(t("advanced_profile_duplicated", "Profile duplicated"));
  };

  const makeDefault = async (profile: LaunchProfile) => {
    setProfiles(
      await window.electron.setDefaultLaunchProfile(gameKey, profile.id)
    );
  };

  const remove = async (profile: LaunchProfile) => {
    if (
      !window.confirm(
        t("advanced_profile_delete_confirm", "Delete this launch profile?")
      )
    )
      return;
    setProfiles(
      await window.electron.deleteLaunchProfile(gameKey, profile.id)
    );
    if (editing?.id === profile.id) setEditing(null);
  };

  const windowModes: { key: string; value: string; label: string }[] = [
    { key: "windowed", value: "windowed", label: t("advanced_window_windowed", "Windowed") },
    { key: "fullscreen", value: "fullscreen", label: t("advanced_window_fullscreen", "Fullscreen") },
    { key: "borderless", value: "borderless", label: t("advanced_window_borderless", "Borderless") },
  ];

  return (
    <div className="settings-advanced__panel">
      <div className="settings-advanced__card">
        <div className="settings-advanced__row">
          <SelectField
            theme="dark"
            value={gameKey}
            onChange={(e) => setGameKey(e.target.value)}
            options={gameOptions}
          />
          <Button theme="primary" onClick={createProfile} disabled={!gameKey}>
            {t("advanced_profile_create", "New profile")}
          </Button>
        </div>
        <p className="settings-advanced__hint">
          {t(
            "advanced_profiles_hint",
            "Each profile can use a different executable, arguments, environment variables and window mode. The default profile is used when launching the game."
          )}
        </p>
        {profiles.length === 0 ? (
          <p className="settings-advanced__empty">
            {t("advanced_profiles_empty", "No launch profiles for this game yet.")}
          </p>
        ) : (
          <div className="settings-advanced__list">
            {profiles.map((profile) => (
              <div className="settings-advanced__item" key={profile.id}>
                <div className="settings-advanced__item-main">
                  <span className="settings-advanced__item-title">
                    {profile.name}
                    {profile.isDefault
                      ? ` (${t("advanced_profile_default", "default")})`
                      : ""}
                  </span>
                  <span className="settings-advanced__item-meta">
                    {profile.executablePath || "--"} · {profile.windowMode}
                  </span>
                </div>
                <div className="settings-advanced__actions">
                  <Button theme="outline" onClick={() => startEditing(profile)}>
                    {t("advanced_edit", "Edit")}
                  </Button>
                  <Button theme="outline" onClick={() => void run(profile)}>
                    {t("advanced_launch", "Launch")}
                  </Button>
                  <Button theme="outline" onClick={() => void duplicate(profile)}>
                    {t("advanced_duplicate", "Duplicate")}
                  </Button>
                  {!profile.isDefault && (
                    <Button theme="outline" onClick={() => void makeDefault(profile)}>
                      {t("advanced_make_default", "Set default")}
                    </Button>
                  )}
                  <Button theme="danger" onClick={() => void remove(profile)}>
                    {t("advanced_delete", "Delete")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <div className="settings-advanced__card">
          <h3 className="settings-advanced__card-title">
            {t("advanced_profile_editor", "Profile editor")}
          </h3>
          <label>
            {t("advanced_profile_name", "Name")}
            <input
              className="settings-advanced__input"
              value={editing.name}
              onChange={(e) => update({ name: e.target.value })}
            />
          </label>
          <label>
            {t("advanced_profile_executable", "Executable")}
            <div className="settings-advanced__row">
              <input
                className="settings-advanced__input"
                value={editing.executablePath}
                onChange={(e) => update({ executablePath: e.target.value })}
              />
              <Button theme="outline" onClick={() => void choose("executablePath", "file")}>
                {t("advanced_browse", "Browse")}
              </Button>
            </div>
          </label>
          <label>
            {t("advanced_profile_workdir", "Working directory")}
            <div className="settings-advanced__row">
              <input
                className="settings-advanced__input"
                value={editing.workingDirectory}
                onChange={(e) => update({ workingDirectory: e.target.value })}
              />
              <Button theme="outline" onClick={() => void choose("workingDirectory", "dir")}>
                {t("advanced_browse", "Browse")}
              </Button>
            </div>
          </label>
          <label>
            {t("advanced_profile_arguments", "Arguments")}
            <input
              className="settings-advanced__input"
              value={editing.arguments}
              onChange={(e) => update({ arguments: e.target.value })}
            />
          </label>
          <label>
            {t("advanced_profile_window", "Window mode")}
            <SelectField
              theme="dark"
              value={editing.windowMode}
              onChange={(e) =>
                update({ windowMode: e.target.value as LaunchProfile["windowMode"] })
              }
              options={windowModes}
            />
          </label>
          <label>
            {t("advanced_profile_env", "Environment variables (one KEY=VALUE per line)")}
            <textarea
              className="settings-advanced__textarea"
              rows={3}
              value={envText}
              onChange={(e) => setEnvText(e.target.value)}
            />
          </label>
          <label>
            {t("advanced_profile_prelaunch", "Pre-launch tools (path|arguments per line)")}
            <textarea
              className="settings-advanced__textarea"
              rows={2}
              value={preText}
              onChange={(e) => setPreText(e.target.value)}
            />
          </label>
          <label>
            {t("advanced_profile_tools", "Tools after launch (path|arguments per line)")}
            <textarea
              className="settings-advanced__textarea"
              rows={2}
              value={toolsText}
              onChange={(e) => setToolsText(e.target.value)}
            />
          </label>
          <div className="settings-advanced__actions">
            <Button theme="primary" onClick={() => void save()}>
              {t("advanced_save", "Save profile")}
            </Button>
            <Button theme="outline" onClick={() => void check()}>
              {t("advanced_check", "Check")}
            </Button>
            <Button theme="outline" onClick={() => setEditing(null)}>
              {t("advanced_cancel", "Cancel")}
            </Button>
          </div>
          {validation && (
            <div className="settings-advanced__hint">
              {validation.valid
                ? t("advanced_validation_ok", "The profile is valid.")
                : validation.messages.join(" ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
