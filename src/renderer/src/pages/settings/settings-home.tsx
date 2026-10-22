import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { CheckboxField } from "@renderer/components";
import { settingsContext } from "@renderer/context";
import { useAppSelector } from "@renderer/hooks";
import type { UserPreferences } from "@types";

import "./settings-home.scss";

const buildForm = (preferences: UserPreferences | null) => ({
  homeHideHero: preferences?.homeHideHero ?? false,
  homeHideCatalogue: preferences?.homeHideCatalogue ?? false,
  homeHideCategories: preferences?.homeHideCategories ?? false,
  homeHideRandom: preferences?.homeHideRandom ?? false,
});

export function SettingsHome() {
  const { t } = useTranslation("settings");
  const { updateUserPreferences } = useContext(settingsContext);

  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );

  const [form, setForm] = useState(() => buildForm(userPreferences));

  useEffect(() => {
    setForm(buildForm(userPreferences));
  }, [userPreferences]);

  const handleChange = (values: Partial<typeof form>) => {
    setForm((prev) => ({ ...prev, ...values }));
    void updateUserPreferences(values);
  };

  return (
    <div className="settings-context-panel">
      <div className="settings-context-panel__group">
        <h3>{t("home_customization")}</h3>

        <CheckboxField
          label={t("home_show_hero")}
          checked={!form.homeHideHero}
          onChange={() => handleChange({ homeHideHero: !form.homeHideHero })}
        />

        <CheckboxField
          label={t("home_show_catalogue")}
          checked={!form.homeHideCatalogue}
          onChange={() =>
            handleChange({ homeHideCatalogue: !form.homeHideCatalogue })
          }
        />

        <CheckboxField
          label={t("home_show_categories")}
          checked={!form.homeHideCategories}
          disabled={form.homeHideCatalogue}
          onChange={() =>
            handleChange({ homeHideCategories: !form.homeHideCategories })
          }
        />

        <CheckboxField
          label={t("home_show_random")}
          checked={!form.homeHideRandom}
          disabled={form.homeHideCatalogue}
          onChange={() =>
            handleChange({ homeHideRandom: !form.homeHideRandom })
          }
        />

        <p className="settings-home__hint">{t("home_hint")}</p>
      </div>
    </div>
  );
}
