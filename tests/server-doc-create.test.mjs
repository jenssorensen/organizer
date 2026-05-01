import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createDocsFolder,
  createMarkdownDoc,
  ensureGettingStartedDoc,
  renameMarkdownDoc,
} from "../server/docCreation.mjs";

test("createMarkdownDoc creates a markdown file inside the selected folder", async () => {
  const docsDir = await mkdtemp(path.join(os.tmpdir(), "organizer-doc-create-"));
  const result = await createMarkdownDoc(docsDir, "backend/apheleia", "Quick Notes");

  assert.equal(result.targetPath, "backend/apheleia");
  assert.equal(result.fileName, "Quick-Notes.md");
  assert.equal(result.sourcePath, "backend/apheleia/Quick-Notes.md");
  assert.equal(await readFile(path.join(docsDir, result.sourcePath), "utf8"), "");
});

test("createMarkdownDoc rejects duplicate file names in the target folder", async () => {
  const docsDir = await mkdtemp(path.join(os.tmpdir(), "organizer-doc-create-"));
  await createMarkdownDoc(docsDir, "", "duplicate");

  let message = "";
  try {
    await createMarkdownDoc(docsDir, "", "duplicate");
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }

  assert.match(message, /already exists/);
});

test("createDocsFolder creates a folder with readme.md inside the selected folder", async () => {
  const docsDir = await mkdtemp(path.join(os.tmpdir(), "organizer-doc-create-"));
  const result = await createDocsFolder(docsDir, "backend/apheleia", "Metrics Review");

  assert.equal(result.targetPath, "backend/apheleia");
  assert.equal(result.folderName, "Metrics-Review");
  assert.equal(result.sourcePath, "backend/apheleia/Metrics-Review");
  assert.equal(
    await readFile(path.join(docsDir, result.sourcePath, "readme.md"), "utf8"),
    "# Metrics-Review\n",
  );
});

test("renameMarkdownDoc renames a file in place and preserves content", async () => {
  const docsDir = await mkdtemp(path.join(os.tmpdir(), "organizer-doc-create-"));
  const created = await createMarkdownDoc(docsDir, "backend/apheleia", "Quick Notes");
  const originalContent = "hello markdown";

  await writeFile(path.join(docsDir, created.sourcePath), originalContent, "utf8");

  const renamed = await renameMarkdownDoc(docsDir, created.sourcePath, "Daily Notes");

  assert.equal(renamed.fileName, "Daily-Notes.md");
  assert.equal(renamed.sourcePath, "backend/apheleia/Daily-Notes.md");
  assert.equal(await readFile(path.join(docsDir, renamed.sourcePath), "utf8"), originalContent);
});

test("renameMarkdownDoc rejects conflicts in the same folder", async () => {
  const docsDir = await mkdtemp(path.join(os.tmpdir(), "organizer-doc-create-"));
  const first = await createMarkdownDoc(docsDir, "", "one");
  await createMarkdownDoc(docsDir, "", "two");

  let message = "";
  try {
    await renameMarkdownDoc(docsDir, first.sourcePath, "two");
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }

  assert.match(message, /already exists/);
});

test("ensureGettingStartedDoc copies the starter guide into a new docs folder", async () => {
  const docsDir = await mkdtemp(path.join(os.tmpdir(), "organizer-doc-create-"));
  const templateDir = await mkdtemp(path.join(os.tmpdir(), "organizer-doc-template-"));
  const templatePath = path.join(templateDir, "getting-started.md");

  await writeFile(templatePath, "# Welcome\n\nStart here.", "utf8");

  const result = await ensureGettingStartedDoc(docsDir, templatePath);

  assert.deepEqual(result, { created: true, sourcePath: "getting-started.md" });
  assert.equal(await readFile(path.join(docsDir, "getting-started.md"), "utf8"), "# Welcome\n\nStart here.");
});

test("ensureGettingStartedDoc does not overwrite an existing guide", async () => {
  const docsDir = await mkdtemp(path.join(os.tmpdir(), "organizer-doc-create-"));
  const templateDir = await mkdtemp(path.join(os.tmpdir(), "organizer-doc-template-"));
  const templatePath = path.join(templateDir, "getting-started.md");

  await writeFile(path.join(docsDir, "getting-started.md"), "# My custom guide\n", "utf8");
  await writeFile(templatePath, "# Template guide\n", "utf8");

  const result = await ensureGettingStartedDoc(docsDir, templatePath);

  assert.deepEqual(result, { created: false, sourcePath: "getting-started.md" });
  assert.equal(await readFile(path.join(docsDir, "getting-started.md"), "utf8"), "# My custom guide\n");
});
