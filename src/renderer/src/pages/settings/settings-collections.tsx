import { useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { CheckboxField, SelectField } from "@renderer/components";
import { CollectionStyleMarker } from "@renderer/components/collection-style-marker/collection-style-marker";
import { settingsContext } from "@renderer/context";
import { useAppSelector, useGameCollections } from "@renderer/hooks";
import {
  clearCollectionStyle,
  COLLECTION_STYLE_COLOR_PRESETS,
  COLLECTION_STYLE_EMBLEMS,
  isCollectionStyleColor,
  normalizeCollectionStyleKey,
  resolveCollectionStyle,
  updateCollectionStyle,
  type CollectionStyleEmblem,
  type CollectionStyleMap,
} from "@shared";

import "./settings-collections.scss";

export function SettingsCollections() {
  const { t } = useTranslation("settings");
  const { updateUserPreferences } = useContext(settingsContext);
  const { collections, hasLoaded, loadCollections } = useGameCollections();

  const collectionStyles = useAppSelector(
    (state) => state.userPreferences.value?.collectionStyles
  );

  useEffect(() => {
    if (!hasLoaded) void loadCollections();
  }, [hasLoaded, loadCollections]);

  const sortedCollections = useMemo(
    () =>
      [...collections].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      ),
    [collections]
  );

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const applyStyles = (next: CollectionStyleMap) => {
    void updateUserPreferences({ collectionStyles: next });
  };

  const handlePatch = (
    collectionId: string,
    patch: {
      color?: string | null;
      emblem?: CollectionStyleEmblem;
      dimmed?: boolean;
    }
  ) => {
    applyStyles(
      updateCollectionStyle(collectionStyles, collectionId, patch)
    );
  };

  const handleReset = (collectionId: string) => {
    applyStyles(clearCollectionStyle(collectionStyles, collectionId));
  };

  const emblemOptions = useMemo(
    () =>
      COLLECTION_STYLE_EMBLEMS.map((emblem) => ({
        key: emblem,
        value: emblem,
        label: t(`collection_emblem_${emblem}`, emblem),
      })),
    [t]
  );

  return (
    <div className="settings-context-panel">
      <div className="settings-context-panel__group">
        <h3>{t("collections_appearance", "Collection styles")}</h3>

        <p className="settings-collections__hint">
          {t(
            "collections_style_hint",
            "Choose how the collections a game belongs to look in the sidebar and in the library. A game uses the first collection that has a colour, an emblem or a dimmed title."
          )}
        </p>

        {sortedCollections.length === 0 && (
          <p className="settings-collections__empty">
            {hasLoaded
              ? t(
                  "collections_style_empty",
                  "You have no collections yet. Create one from the library to style it."
                )
              : t("collections_style_loading", "Loading collections...")}
          </p>
        )}

        <div className="settings-collections__list">
          {sortedCollections.map((collection) => {
            const style = resolveCollectionStyle(
              collection,
              collectionStyles
            );
            const explicit = collectionStyles?.[collection.id];
            const isExpanded = expandedId === collection.id;
            const presetId = `collection-color-${collection.id}`;

            return (
              <div
                key={collection.id}
                className="settings-collections__item"
                data-collection-name={normalizeCollectionStyleKey(
                  collection.name
                )}
              >
                <button
                  type="button"
                  className="settings-collections__item-header"
                  onClick={() =>
                    setExpandedId(isExpanded ? null : collection.id)
                  }
                  aria-expanded={isExpanded}
                >
                  <span
                    className="settings-collections__preview"
                    style={
                      style.color ? { color: style.color } : undefined
                    }
                  >
                    <CollectionStyleMarker
                      emblem={style.emblem}
                      size={13}
                      className="settings-collections__preview-emblem"
                    />
                    <span
                      className={
                        style.dimmed
                          ? "settings-collections__preview-name settings-collections__preview-name--dimmed"
                          : "settings-collections__preview-name"
                      }
                    >
                      {collection.name}
                    </span>
                  </span>

                  <span className="settings-collections__item-meta">
                    {collection.gamesCount}{" "}
                    {t("collections_style_games", "games")}
                  </span>
                </button>

                {isExpanded && (
                  <div className="settings-collections__item-body">
                    <div className="settings-collections__field">
                      <span className="settings-collections__field-label">
                        {t("collection_style_color", "Title colour")}
                      </span>

                      <div className="settings-collections__colors">
                        <button
                          type="button"
                          className={
                            !explicit?.color
                              ? "settings-collections__swatch settings-collections__swatch--default settings-collections__swatch--active"
                              : "settings-collections__swatch settings-collections__swatch--default"
                          }
                          title={t("collection_style_use_default", "Default")}
                          onClick={() => handlePatch(collection.id, { color: null })}
                        >
                          {t("collection_style_default_short", "Auto")}
                        </button>

                        {COLLECTION_STYLE_COLOR_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            className={
                              style.color === preset
                                ? "settings-collections__swatch settings-collections__swatch--active"
                                : "settings-collections__swatch"
                            }
                            style={{ backgroundColor: preset }}
                            title={preset}
                            aria-label={preset}
                            onClick={() =>
                              handlePatch(collection.id, { color: preset })
                            }
                          />
                        ))}

                        <label
                          htmlFor={presetId}
                          className="settings-collections__color-input"
                          title={t("collection_style_custom_color", "Custom colour")}
                        >
                          {t("collection_style_custom_short", "Custom")}
                          <input
                            id={presetId}
                            type="color"
                            value={
                              isCollectionStyleColor(style.color)
                                ? style.color
                                : "#ffffff"
                            }
                            onChange={(event) =>
                              handlePatch(collection.id, {
                                color: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                    </div>

                    <div className="settings-collections__row">
                      <SelectField
                        label={t("collection_style_emblem", "Emblem")}
                        value={style.emblem}
                        options={emblemOptions}
                        onChange={(event) =>
                          handlePatch(collection.id, {
                            emblem: event.target.value as CollectionStyleEmblem,
                          })
                        }
                      />

                      <CheckboxField
                        label={t(
                          "collection_style_dimmed",
                          "Shaded grey title"
                        )}
                        checked={style.dimmed}
                        onChange={() =>
                          handlePatch(collection.id, { dimmed: !style.dimmed })
                        }
                      />
                    </div>

                    <button
                      type="button"
                      className="settings-collections__reset"
                      onClick={() => handleReset(collection.id)}
                    >
                      {t("collection_style_reset", "Reset this collection")}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
