/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("keyboard shortcuts dialog uses a split layout and platform-aware shortcut labels", async () => {
  const dialogsSource = await readFile(new URL("../src/components/Dialogs.tsx", import.meta.url), "utf8");
  const clientPlatformSource = await readFile(new URL("../src/clientPlatform.ts", import.meta.url), "utf8");
  const stylesSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(clientPlatformSource, /export function isMacUserAgent/);
  assert.match(clientPlatformSource, /export function getClientPlatform/);
  assert.match(dialogsSource, /const platform = getClientPlatform\(\)/);
  assert.match(dialogsSource, /const modifierLabel = platform === "mac" \? "⌘" : "Ctrl"/);
  assert.match(dialogsSource, /\{ keys: \[`\$\{modifierLabel\}\+F`\], description: "Open search" \}/);
  assert.match(dialogsSource, /const \[activeSectionId, setActiveSectionId\] = useState/);
  assert.match(dialogsSource, /className="keyboard-shortcuts__layout"/);
  assert.match(dialogsSource, /className="keyboard-shortcuts__platform-badge"/);
  assert.match(stylesSource, /\.keyboard-shortcuts__layout \{/);
  assert.match(stylesSource, /\.keyboard-shortcuts__nav-item\.is-active \{/);
  assert.match(stylesSource, /\.keyboard-shortcuts \{[\s\S]*height: min\(560px, 86vh\);/);
  assert.match(stylesSource, /\.keyboard-shortcuts__body \{[\s\S]*overflow-y: auto;/);
});