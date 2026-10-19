import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@renderer/components";
import lorroLogoUrl from "@renderer/assets/brand/lorro-logo-horizontal.svg?url";

interface AppInfo {
  name: string;
  protocol: string;
  version: string;
  updateChannelConfigured: boolean;
  userDataPath: string;
}

export function SettingsAbout() {
  const { t } = useTranslation("settings");
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    window.electron.getAppInfo().then(setAppInfo);
  }, []);

  return (
    <div className="settings-about">
      <div className="settings-about__hero">
        <img
          className="settings-about__logo"
          src={lorroLogoUrl}
          alt="Lorro Launcher"
          draggable={false}
        />
        <span className="settings-about__version">
          {t("about_version")} {appInfo?.version ?? ""}
        </span>
        <p className="settings-about__tagline">{t("about_tagline")}</p>
      </div>

      <div className="settings-context-panel__group">
        <h3>{t("about_product")}</h3>
        <p className="settings-about__text">{t("about_description")}</p>
        <p className="settings-about__text settings-about__text--muted">
          {t("about_original_project")}
        </p>
      </div>

      <div className="settings-context-panel__group">
        <h3>{t("about_data")}</h3>
        <p className="settings-about__text">{t("about_data_description")}</p>
        <div className="settings-about__row">
          <code className="settings-about__path">
            {appInfo?.userDataPath ?? "..."}
          </code>
          <Button
            theme="outline"
            onClick={() =>
              appInfo && window.electron.openFolder(appInfo.userDataPath)
            }
            disabled={!appInfo}
          >
            {t("about_open_data_folder")}
          </Button>
        </div>
      </div>

      <div className="settings-context-panel__group">
        <h3>{t("about_updates")}</h3>
        <p className="settings-about__text">
          {appInfo?.updateChannelConfigured
            ? t("about_updates_enabled")
            : t("about_updates_disabled")}
        </p>
      </div>

      <div className="settings-context-panel__group">
        <h3>{t("about_license")}</h3>
        <p className="settings-about__text">{t("about_license_description")}</p>
        <p className="settings-about__text settings-about__text--muted">
          {t("about_third_party_description")}
        </p>
      </div>
    </div>
  );
}
