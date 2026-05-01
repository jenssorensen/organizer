/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("app wires note star controls and starred note listing", async () => {
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const noteComponentsSource = await readFile(new URL("../src/components/NoteComponents.tsx", import.meta.url), "utf8");
  const notesHookSource = await readFile(new URL("../src/useNotesData.ts", import.meta.url), "utf8");
  const stylesheet = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(appSource, /handleToggleNoteStar/);
  assert.match(appSource, /Starred notes/);
  assert.match(noteComponentsSource, /note-leaf__star/);
  assert.match(notesHookSource, /\/api\/notes\/star/);
  assert.match(notesHookSource, /void loadNotes\(\)/);
  assert.match(stylesheet, /\.note-leaf__star/);
});
