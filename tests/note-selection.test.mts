/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";

import { resolveSelectedNoteNodeId } from "../src/noteSelection.ts";

const ROOT_NOTE_NODE_ID = "__root__";

test("defaults to the root overview when nothing is selected", () => {
  const nextSelection = resolveSelectedNoteNodeId({
    currentSelectedNoteNodeId: null,
    rootNodeId: ROOT_NOTE_NODE_ID,
    tree: [],
  });

  assert.equal(nextSelection, ROOT_NOTE_NODE_ID);
});

test("preserves the explicit root overview selection", () => {
  const nextSelection = resolveSelectedNoteNodeId({
    currentSelectedNoteNodeId: ROOT_NOTE_NODE_ID,
    rootNodeId: ROOT_NOTE_NODE_ID,
    tree: [
      {
        id: "folder-a",
        type: "folder",
        title: "Folder A",
        children: [],
      },
    ],
  });

  assert.equal(nextSelection, ROOT_NOTE_NODE_ID);
});

test("keeps an existing selection when that node is still present", () => {
  const nextSelection = resolveSelectedNoteNodeId({
    currentSelectedNoteNodeId: "note-a",
    rootNodeId: ROOT_NOTE_NODE_ID,
    tree: [
      {
        id: "folder-a",
        type: "folder",
        title: "Folder A",
        children: [
          {
            id: "note-a",
            type: "note",
            noteId: "note-a",
          },
        ],
      },
    ],
  });

  assert.equal(nextSelection, "note-a");
});

test("falls back to the root overview when the previous selection no longer exists", () => {
  const nextSelection = resolveSelectedNoteNodeId({
    currentSelectedNoteNodeId: "missing-note",
    rootNodeId: ROOT_NOTE_NODE_ID,
    tree: [
      {
        id: "folder-a",
        type: "folder",
        title: "Folder A",
        children: [],
      },
    ],
  });

  assert.equal(nextSelection, ROOT_NOTE_NODE_ID);
});
