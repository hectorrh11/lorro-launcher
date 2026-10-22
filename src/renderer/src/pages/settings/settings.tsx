import { useTranslation } from "react-i18next";
import {
  SettingsContextConsumer,
  SettingsContextProvider,
} from "@renderer/context";
import { SettingsAccount } from "./settings-account";
import { useUserDetails } from "@renderer/hooks";
import { Fragment, useMemo } from "react";
import "./settings.scss";
import {
  BellIcon,
  CloudIcon,
  DownloadIcon,
  GearIcon,
  InfoIcon,
  LinkIcon,
  PlayIcon,
  StarFillIcon,
  VideoIcon,
  ShieldCheckIcon,
} from "@primer/octicons-react";
import { Gamepad2, Wrench } from "lucide-react";
import { SettingsContextGeneral } from "./settings-context-general";
import { SettingsContextDownloads } from "./settings-context-downloads";
import { SettingsContextDownloadSources } from "./settings-context-download-sources";
import { SettingsContextNotifications } from "./settings-context-notifications";
import { SettingsContextContentGameplay } from "./settings-context-content-gameplay";
import { SettingsContextIntegrations } from "./settings-context-integrations";
import { SettingsContextCompatibility } from "./settings-context-compatibility";
import { SettingsContextBigPicture } from "./settings-context-big-picture";
import { SettingsContextEmulation } from "./emulation/settings-context-emulation";
import { SettingsAbout } from "./settings-about";
import { SettingsAdvanced } from "./settings-advanced";
import { SettingsClips } from "./settings-clips";
import { SettingsStore } from "./settings-store";

export default function Settings() {
  const { t } = useTranslation("settings");

  const { userDetails } = useUserDetails();

  const categories = useMemo(
    () => [
      {
        id: "general" as const,
        label: t("general"),
        description: t(
          "settings_description_general",
          "Language, startup behavior and app basics."
        ),
        icon: <GearIcon size={16} />,
      },
      {
        id: "downloads" as const,
        label: t("downloads"),
        description: t(
          "settings_description_downloads",
          "Download behavior, speed limits and network adapter."
        ),
        icon: <DownloadIcon size={16} />,
      },
      {
        id: "clips" as const,
        label: t("clips"),
        description: t(
          "settings_description_clips",
          "Shortcut, length and audio for Lorro clips."
        ),
        icon: <VideoIcon size={16} />,
      },
      {
        id: "store" as const,
        label: t("store_title", "LorroPoints store"),
        description: t(
          "settings_description_store",
          "Spend your LorroPoints on exclusive themes."
        ),
        icon: <StarFillIcon size={16} />,
      },
      {
        id: "download_sources" as const,
        label: t("download_sources"),
        description: t(
          "settings_description_download_sources",
          "Sources Lorro uses to find download links."
        ),
        icon: <LinkIcon size={16} />,
      },
      {
        id: "notifications" as const,
        label: t("notifications"),
        description: t(
          "settings_description_notifications",
          "Choose which library and achievement alerts you receive."
        ),
        icon: <BellIcon size={16} />,
      },
      {
        id: "content_gameplay" as const,
        label: t("content_gameplay"),
        description: t(
          "settings_description_content_gameplay",
          "Content preferences, metadata and library appearance."
        ),
        icon: <PlayIcon size={16} />,
      },
      {
        id: "integrations" as const,
        label: t("integrations"),
        description: t(
          "settings_description_integrations",
          "Steam, Epic, RetroAchievements and debrid services."
        ),
        icon: <CloudIcon size={16} />,
      },
      {
        id: "compatibility" as const,
        label: t("compatibility"),
        description: t(
          "settings_description_compatibility",
          "Wine, Proton and Linux compatibility options."
        ),
        icon: <Wrench size={16} />,
      },
      ...(userDetails
        ? [
            {
              id: "account_privacy" as const,
              label: `${t("account")} & ${t("privacy")}`,
              description: t(
                "settings_description_account",
                "Account details, visibility and blocked users."
              ),
              icon: <ShieldCheckIcon size={16} />,
            },
          ]
        : []),
      {
        id: "big_picture" as const,
        label: t("big_picture"),
        description: t(
          "settings_description_big_picture",
          "Startup, audio, input and diagnostics for Big Picture."
        ),
        icon: <VideoIcon size={16} />,
      },
      {
        id: "emulation" as const,
        label: t("emulation"),
        description: t(
          "settings_description_emulation",
          "Classics emulation, BIOS and console setup."
        ),
        icon: <Gamepad2 size={16} />,
        group: "classics" as const,
      },
      {
        id: "advanced" as const,
        label: t("advanced"),
        description: t(
          "settings_description_advanced",
          "Backups, statistics, storage, diagnostics and extras."
        ),
        icon: <Wrench size={16} />,
      },
      {
        id: "about" as const,
        label: t("about"),
        description: t(
          "settings_description_about",
          "Version, credits and project information."
        ),
        icon: <InfoIcon size={16} />,
      },
    ],
    [t, userDetails]
  );

  return (
    <SettingsContextProvider>
      <SettingsContextConsumer>
        {({ currentCategoryId, setCurrentCategoryId, appearance }) => {
          const currentCategory =
            categories.find((category) => category.id === currentCategoryId) ??
            categories[0];
          const selectedCategoryId = currentCategory.id;

          const renderCategory = () => {
            if (selectedCategoryId === "general") {
              return <SettingsContextGeneral appearance={appearance} />;
            }

            if (selectedCategoryId === "downloads") {
              return <SettingsContextDownloads />;
            }

            if (selectedCategoryId === "clips") {
              return <SettingsClips />;
            }

            if (selectedCategoryId === "store") {
              return <SettingsStore />;
            }

            if (selectedCategoryId === "download_sources") {
              return <SettingsContextDownloadSources />;
            }

            if (selectedCategoryId === "notifications") {
              return <SettingsContextNotifications />;
            }

            if (selectedCategoryId === "content_gameplay") {
              return <SettingsContextContentGameplay />;
            }

            if (selectedCategoryId === "integrations") {
              return <SettingsContextIntegrations />;
            }

            if (selectedCategoryId === "compatibility") {
              return <SettingsContextCompatibility />;
            }

            if (selectedCategoryId === "big_picture") {
              return <SettingsContextBigPicture />;
            }

            if (selectedCategoryId === "emulation") {
              return <SettingsContextEmulation />;
            }

            if (selectedCategoryId === "advanced") {
              return <SettingsAdvanced />;
            }

            if (selectedCategoryId === "about") {
              return <SettingsAbout />;
            }

            return <SettingsAccount />;
          };

          return (
            <section className="settings__container">
              <div className="settings__content">
                <aside className="settings__sidebar">
                  {categories.map((category, index) => {
                    const prevGroup =
                      index > 0
                        ? (categories[index - 1] as { group?: string }).group
                        : undefined;
                    const currentGroup = (category as { group?: string }).group;
                    const showGroupHeader =
                      currentGroup && currentGroup !== prevGroup;

                    return (
                      <Fragment key={category.id}>
                        {showGroupHeader && (
                          <div className="settings__sidebar-group">
                            <div className="settings__sidebar-divider" />
                            <span className="settings__sidebar-group-label">
                              {currentGroup === "classics"
                                ? t("classics_group")
                                : currentGroup}
                            </span>
                          </div>
                        )}
                        <button
                          type="button"
                          className={`settings__sidebar-button ${
                            currentCategory.id === category.id
                              ? "settings__sidebar-button--active"
                              : ""
                          }`}
                          onClick={() => setCurrentCategoryId(category.id)}
                          aria-current={
                            currentCategory.id === category.id
                              ? "page"
                              : undefined
                          }
                        >
                          <span className="settings__sidebar-button-icon">
                            {category.icon}
                          </span>
                          <span className="settings__sidebar-button-label">
                            {category.label}
                          </span>
                        </button>
                      </Fragment>
                    );
                  })}
                </aside>

                <div className="settings__panel">
                  {selectedCategoryId !== "emulation" && (
                    <header className="settings__header">
                      <span className="settings__header-eyebrow">
                        {t("settings_title", "Settings")}
                      </span>
                      <h2 className="settings__header-title">
                        {currentCategory.label}
                      </h2>
                      <p className="settings__header-description">
                        {currentCategory.description}
                      </p>
                    </header>
                  )}
                  {renderCategory()}
                </div>
              </div>
            </section>
          );
        }}
      </SettingsContextConsumer>
    </SettingsContextProvider>
  );
}
