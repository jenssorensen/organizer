import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeStarredNotes,
  sanitizeStarredNotesPayload,
  toggleStarredNote,
} from "../server/starredNotes.mjs";

test("sanitizes starred note payloads", () => {
  const payload = sanitizeStarredNotesPayload({
    entries: [{ sourcePath: "backend/apheleia/apheleia_architecture.md", starred: true }],
  });

  assert.deepEqual(payload, {
    entries: [{ sourcePath: "backend/apheleia/apheleia_architecture.md", starred: true }],
  });
});

test("merges starred state into note collections", () => {
  const notes = [
    {
      id: "a",
      sourcePath: "backend/apheleia/apheleia_architecture.md",
      starred: false,
    },
    {
      id: "b",
      sourcePath: "client/onboarding.md",
      starred: false,
    },
  ];

  const merged = mergeStarredNotes(notes, new Map([["client/onboarding.md", true]]));

  assert.equal(merged[0].starred, false);
  assert.equal(merged[1].starred, true);
});

test("toggles a note star entry by source path", () => {
  const entries = toggleStarredNote(
    [{ sourcePath: "client/onboarding.md", starred: true }],
    "client/onboarding.md",
    false,
  );

  assert.deepEqual(entries, []);
});
