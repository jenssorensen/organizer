import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";

import { hasNoteSaveConflict, normalizeRelativeDocsPath, resolveEditableDocPath } from "../server/notePersistence.mjs";

test("detects stale note save timestamps", () => {
  assert.equal(hasNoteSaveConflict("2026-04-30T10:00:00.000Z", "2026-04-30T10:00:00.000Z"), false);
  assert.equal(hasNoteSaveConflict("2026-04-30T10:00:01.000Z", "2026-04-30T10:00:00.000Z"), true);
  assert.equal(hasNoteSaveConflict("2026-04-30T10:00:01.000Z", ""), false);
  assert.equal(hasNoteSaveConflict("2026-04-30T10:00:01.000Z", null), false);
});

test("normalizes editable note paths", () => {
  assert.equal(normalizeRelativeDocsPath(" client/onboarding.md "), "client/onboarding.md");
  assert.equal(normalizeRelativeDocsPath("client\\network\\guide.md"), "client/network/guide.md");
});

test("rejects invalid editable note paths", () => {
  assert.throws(() => normalizeRelativeDocsPath("../secrets.md"), /invalid path segment/i);
  assert.throws(() => normalizeRelativeDocsPath("./guide.md"), /invalid path segment/i);
  assert.throws(() => normalizeRelativeDocsPath(""), /required/i);
});

test("resolves editable note paths inside data docs only", () => {
  const result = resolveEditableDocPath("/workspace/data/docs", "client/onboarding.md");

  assert.equal(result.normalizedPath, "client/onboarding.md");
  assert.equal(result.absolutePath, path.resolve("/workspace/data/docs", "client/onboarding.md"));
});

test("rejects non-markdown note saves", () => {
  assert.throws(() => resolveEditableDocPath("/workspace/data/docs", "client/onboarding.txt"), /markdown/i);
});