/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { formatNoteTargetLocation } from "../src/noteFormatting.ts";

test("notes view exposes a New Document action wired to document creation", async () => {
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const dialogsSource = await readFile(new URL("../src/components/Dialogs.tsx", import.meta.url), "utf8");
  const notesHookSource = await readFile(new URL("../src/useNotesData.ts", import.meta.url), "utf8");

  assert.match(appSource, /async function handleCreateDocument\(\)/);
  assert.match(appSource, /creationPath: noteUploadTarget\.sourcePath/);
  assert.match(appSource, /targetPath: formatNoteTargetLocation\(noteUploadTarget\.sourcePath\)/);
  assert.match(appSource, /async function handleNoteCreationDialogConfirm\(\)/);
  assert.match(appSource, /await createNoteDocument\(creationPath, requestedName\)/);
  assert.match(appSource, />\s*New Document\s*</);
  assert.match(notesHookSource, /fetch\(`\$\{apiBase\}\/api\/docs\/create`/);
  assert.match(appSource, /function handleCreateSection\(\)/);
  assert.match(appSource, />\s*New Section\s*</);
  assert.match(appSource, /async function handleCreateFolder\(\)/);
  assert.match(appSource, /await createNoteFolder\(creationPath, requestedName\)/);
  assert.match(appSource, />\s*New Folder\s*</);
  assert.match(appSource, /if \(isEscapeKey && noteCreationDialog\.kind !== "closed"\) \{/);
  assert.match(appSource, /setNoteCreationDialog\(\{ kind: "closed" \}\);/);
  assert.match(notesHookSource, /fetch\(`\$\{apiBase\}\/api\/docs\/create-folder`/);
  assert.match(dialogsSource, /function NoteCreationDialog\(/);
  assert.match(dialogsSource, /Create document/);
  assert.match(dialogsSource, /Create folder/);
  assert.match(dialogsSource, /Create section/);
  assert.match(dialogsSource, /Location/);
  assert.match(dialogsSource, /targetPath/);
});

test("formats note creation dialog locations as full docs paths", () => {
  assert.equal(formatNoteTargetLocation(""), "data/docs");
  assert.equal(formatNoteTargetLocation("backend/apheleia"), "data/docs/backend/apheleia");
  assert.equal(formatNoteTargetLocation("/metrics//weekly/"), "data/docs/metrics/weekly");
});
