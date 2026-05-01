import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createDocFolderId, createDocNoteId, readDocsTree, toDocNote } from "../server/docsTree.mjs";

test("readDocsTree skips notes that disappear during a scan", async () => {
  const docsDir = await mkdtemp(path.join(os.tmpdir(), "organizer-docs-tree-"));
  await mkdir(path.join(docsDir, "archive"), { recursive: true });
  await writeFile(path.join(docsDir, "keep.md"), "# Keep\n\nStill here.");
  await writeFile(path.join(docsDir, "archive", "gone.md"), "# Gone\n\nMoved away.");

  const notes = [];
  const tree = await readDocsTree(docsDir, "", notes, {
    async readNote(filePath, relativeFilePath) {
      if (relativeFilePath === path.join("archive", "gone.md")) {
        const error = new Error("File disappeared during scan");
        error.code = "ENOENT";
        throw error;
      }

      return toDocNote(filePath, relativeFilePath);
    },
  });

  assert.deepEqual(notes.map((note) => note.sourcePath), ["keep.md"]);
  assert.deepEqual(tree, [
    {
      id: createDocFolderId("archive"),
      type: "folder",
      title: "archive",
      sourcePath: "archive",
      children: [],
    },
    {
      id: createDocNoteId("keep.md"),
      type: "note",
      noteId: createDocNoteId("keep.md"),
    },
  ]);
});