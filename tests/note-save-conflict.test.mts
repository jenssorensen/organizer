/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";
import type { Note } from "../src/types.ts";

const note: Note = {
  id: "note-1",
  title: "Retry logic",
  summary: "summary",
  tags: ["backend"],
  updatedAt: "2026-04-30T10:00:00.000Z",
  starred: false,
  kind: "note",
  content: "# Retry logic",
  sourcePath: "Backend/Retry logic.md",
};

async function loadNoteSaveModule() {
  const tempDir = await mkdtemp(join(tmpdir(), "organizer-note-save-"));
  try {
    const outputFile = join(tempDir, "noteSave.mjs");
    await build({
      bundle: true,
      entryPoints: ["c:/dev/organizer/src/noteSave.ts"],
      format: "esm",
      outfile: outputFile,
      platform: "node",
    });

    const module = await import(pathToFileURL(outputFile).href);
    return module;
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

test("buildQueuedNoteSaveEntry preserves conflict metadata for later sync", async () => {
  const { buildQueuedNoteSaveEntry } = await loadNoteSaveModule();
  const entry = buildQueuedNoteSaveEntry(note, "# Updated", 123);

  assert.deepEqual(entry, {
    id: "note-save:Backend/Retry logic.md:123",
    kind: "note-save",
    resourceKey: "Backend/Retry logic.md",
    queuedAt: 123,
    payload: {
      sourcePath: "Backend/Retry logic.md",
      content: "# Updated",
      expectedUpdatedAt: "2026-04-30T10:00:00.000Z",
    },
  });
});

test("buildQueuedNoteSaveEntry skips notes without a source path", async () => {
  const { buildQueuedNoteSaveEntry } = await loadNoteSaveModule();
  assert.equal(buildQueuedNoteSaveEntry({ ...note, sourcePath: undefined }, "# Updated", 123), null);
});

test("client save flow keeps explicit conflict handling wired", async () => {
  const hookSource = await readFile(new URL("../src/useNotesData.ts", import.meta.url), "utf8");
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.match(hookSource, /response\.status === 409 && data\.conflict && data\.note/);
  assert.match(hookSource, /return \{ ok: false as const, conflict: true as const/);
  assert.match(appSource, /Conflict draft/);
  assert.match(appSource, /Server version loaded; your draft was saved to local history\./);
  assert.match(appSource, /setNotesStatus\("Note conflict detected"\)/);
});