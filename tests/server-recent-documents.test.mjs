import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeRecentDocumentsPayload } from "../server/recentDocuments.mjs";

test("accepts a bounded recent documents payload", () => {
  const payload = sanitizeRecentDocumentsPayload({
    entries: [
      {
        id: "note:a-1",
        documentId: "note:a",
        kind: "note",
        title: "A",
        subtitle: "notes",
        preview: "preview",
        pinned: false,
        viewedAt: 3,
        snapshot: {
          section: "notes",
          selectedNoteNodeId: "node-a",
          selectedBookmarkId: null,
          selectedTodoId: null,
        },
        lastEditedAt: 5,
        lastCompletedAt: 0,
      },
    ],
  });

  assert.equal(payload.entries.length, 1);
  assert.equal(payload.entries[0].snapshot.section, "notes");
  assert.equal(payload.entries[0].lastEditedAt, 5);
});

test("accepts todo recent documents and normalizes todo selection state", () => {
  const payload = sanitizeRecentDocumentsPayload({
    entries: [
      {
        id: "todo:a-1",
        documentId: "todo:a",
        kind: "todo",
        title: "Task A",
        subtitle: "Sprint",
        preview: "Not started",
        pinned: true,
        viewedAt: 3,
        snapshot: {
          section: "todo",
          selectedNoteNodeId: null,
          selectedBookmarkId: null,
          selectedTodoId: "todo-a",
        },
        lastEditedAt: 1,
        lastCompletedAt: 8,
      },
    ],
  });

  assert.equal(payload.entries[0].kind, "todo");
  assert.equal(payload.entries[0].snapshot.selectedTodoId, "todo-a");
  assert.equal(payload.entries[0].pinned, true);
});

test("rejects invalid recent document sections", () => {
  assert.throws(
    () =>
      sanitizeRecentDocumentsPayload({
        entries: [
          {
            id: "bad",
            documentId: "note:a",
            kind: "note",
            title: "A",
            subtitle: "notes",
            preview: "preview",
            pinned: false,
            viewedAt: 3,
            snapshot: {
              section: "bad",
              selectedNoteNodeId: "node-a",
              selectedBookmarkId: null,
              selectedTodoId: null,
            },
            lastEditedAt: 0,
            lastCompletedAt: 0,
          },
        ],
      }),
    /invalid recent documents payload/i,
  );
});
