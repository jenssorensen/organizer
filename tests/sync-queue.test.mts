/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";

import { createSyncEntryId, enqueueSyncEntry, sanitizeSyncQueueEntry, sortSyncQueue, type SyncQueueEntry } from "../src/syncQueue.ts";

const noteEntry: SyncQueueEntry = {
  id: createSyncEntryId("note-save", "Notes/Alpha.md", 10),
  kind: "note-save",
  resourceKey: "Notes/Alpha.md",
  queuedAt: 10,
  payload: {
    sourcePath: "Notes/Alpha.md",
    content: "# Alpha",
    expectedUpdatedAt: "2026-04-30T10:00:00.000Z",
  },
};

test("deduplicates sync queue entries by kind and resource", () => {
  const next = enqueueSyncEntry(
    [noteEntry],
    {
      ...noteEntry,
      id: createSyncEntryId("note-save", "Notes/Alpha.md", 12),
      queuedAt: 12,
      payload: {
        ...noteEntry.payload,
        content: "# Alpha updated",
      },
    },
  );

  assert.equal(next.length, 1);
  assert.equal(next[0].queuedAt, 12);
  assert.equal(next[0].payload.content, "# Alpha updated");
});

test("sorts sync queue entries deterministically", () => {
  const sorted = sortSyncQueue([
    { ...noteEntry, id: "b", queuedAt: 20 },
    { ...noteEntry, id: "a", queuedAt: 20, resourceKey: "Notes/Beta.md", payload: { ...noteEntry.payload, sourcePath: "Notes/Beta.md" } },
    { ...noteEntry, id: "c", queuedAt: 10 },
  ]);

  assert.deepEqual(sorted.map((entry) => entry.id), ["c", "a", "b"]);
});

test("sanitizes persisted sync queue entries", () => {
  assert.equal(sanitizeSyncQueueEntry(null), null);
  assert.equal(sanitizeSyncQueueEntry({ kind: "note-save" }), null);

  assert.deepEqual(sanitizeSyncQueueEntry(noteEntry), noteEntry);
});
