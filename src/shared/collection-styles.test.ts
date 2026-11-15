import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clearCollectionStyle,
  getDefaultCollectionStyle,
  resolveCollectionStyle,
  resolveGameCollectionStyle,
  updateCollectionStyle,
} from "./collection-styles.js";

const collections = [
  { id: "finished", name: "Terminado" },
  { id: "playing", name: "En proceso" },
  { id: "not-installed", name: "No instalado" },
  { id: "custom", name: "Mi colección" },
];

test("shipped defaults decorate the default collections", () => {
  assert.equal(getDefaultCollectionStyle("Terminado").emblem, "trophy");
  assert.equal(getDefaultCollectionStyle("terminado").color, "#7ec699");
  assert.equal(getDefaultCollectionStyle("En proceso").emblem, "clock");
  assert.equal(getDefaultCollectionStyle("No instalado").dimmed, true);
  assert.equal(getDefaultCollectionStyle("Mi colección").emblem, undefined);
});

test("explicit styles override defaults and ignore invalid colours", () => {
  const style = resolveCollectionStyle(collections[0], {
    finished: { color: "#ff0000", emblem: "star", dimmed: true },
  });
  assert.deepEqual(style, {
    color: "#ff0000",
    emblem: "star",
    dimmed: true,
  });

  const fallback = resolveCollectionStyle(collections[0], {
    finished: { color: "not-a-colour" },
  });
  assert.equal(fallback.color, "#7ec699");
  assert.equal(fallback.emblem, "trophy");
});

test("a game uses the first collection that actually decorates it", () => {
  const decorated = resolveGameCollectionStyle(
    ["finished", "not-installed"],
    collections,
    undefined
  );
  assert.equal(decorated?.collectionId, "finished");
  assert.equal(decorated?.emblem, "trophy");

  const styled = resolveGameCollectionStyle(
    ["custom", "not-installed"],
    collections,
    { "not-installed": { emblem: "star" } }
  );
  assert.equal(styled?.collectionId, "not-installed");
  assert.equal(styled?.emblem, "star");

  const undecorated = resolveGameCollectionStyle(
    ["custom"],
    collections,
    undefined
  );
  assert.equal(undecorated, null);

  assert.equal(resolveGameCollectionStyle([], collections, undefined), null);
});

test("unknown collection ids are skipped without throwing", () => {
  const resolved = resolveGameCollectionStyle(
    ["missing", "playing"],
    collections,
    undefined
  );
  assert.equal(resolved?.collectionId, "playing");
  assert.equal(resolved?.emblem, "clock");
});

test("styles are updated and cleared per collection", () => {
  const updated = updateCollectionStyle(undefined, "custom", {
    color: "#123456",
  });
  assert.deepEqual(updated, { custom: { color: "#123456" } });

  const patched = updateCollectionStyle(updated, "custom", { dimmed: true });
  assert.deepEqual(patched, { custom: { color: "#123456", dimmed: true } });

  assert.deepEqual(clearCollectionStyle(patched, "custom"), {});
});
