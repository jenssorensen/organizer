/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("export/import dialog uses a settings-style split layout ordered import, export, restore", async () => {
  const dialogsSource = await readFile(new URL("../src/components/Dialogs.tsx", import.meta.url), "utf8");
  const stylesSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(dialogsSource, /const \[activeTab, setActiveTab\] = useState<"import" \| "export" \| "restore">\("import"\)/);
  assert.match(dialogsSource, /\{ id: "import", label: "Import"/);
  assert.match(dialogsSource, /\{ id: "export", label: "Export"/);
  assert.match(dialogsSource, /\{ id: "restore", label: "Restore"/);
  assert.match(dialogsSource, /className="export-import__layout"/);
  assert.match(dialogsSource, /className="export-import__nav" aria-label="Backup and restore actions"/);

  const importIndex = dialogsSource.indexOf('{ id: "import", label: "Import"');
  const exportIndex = dialogsSource.indexOf('{ id: "export", label: "Export"');
  const restoreIndex = dialogsSource.indexOf('{ id: "restore", label: "Restore"');
  assert.ok(importIndex >= 0 && exportIndex >= 0 && restoreIndex >= 0);
  assert.ok(importIndex < exportIndex && exportIndex < restoreIndex);

  assert.match(stylesSource, /\.export-import__layout \{/);
  assert.match(stylesSource, /\.export-import__nav-item\.is-active \{/);
  assert.match(stylesSource, /\.export-import \{[\s\S]*height: min\(560px, 86vh\);/);
  assert.match(stylesSource, /\.export-import__restore-list \{[\s\S]*overflow-y: auto;/);
  assert.match(stylesSource, /\.export-import__action-list \{[\s\S]*overflow-y: auto;/);
});