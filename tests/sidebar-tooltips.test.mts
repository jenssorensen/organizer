/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("sidebar command palette and shortcuts tooltips are platform aware", async () => {
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.match(appSource, /import \{ getClientPlatform, getFolderPathPlaceholder, shouldUseManualFolderPaths \} from "\.\/clientPlatform";/);
  assert.match(appSource, /const platform = getClientPlatform\(\);/);
  assert.match(appSource, /const commandPaletteShortcutTitle = platform === "mac"[\s\S]*"Command palette \(⌘K \/ ⌘⇧P\)"[\s\S]*"Command palette \(Ctrl\+K \/ Ctrl\+Shift\+P\)";/);
  assert.match(appSource, /const keyboardShortcutsTitle = platform === "mac"[\s\S]*"Keyboard shortcuts \(⌘\/\)"[\s\S]*"Keyboard shortcuts \(Ctrl\/\)";/);
  assert.match(appSource, /title=\{commandPaletteShortcutTitle\}/);
  assert.match(appSource, /title=\{keyboardShortcutsTitle\}/);
});