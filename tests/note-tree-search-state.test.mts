/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";

import { buildNoteTreeSearchStateMap } from "../src/noteTreeSearchState.ts";
import type { Note, NoteTreeNode } from "../src/types.ts";

const notes: Note[] = [
  {
    id: "note-a",
    title: "Metrics overview",
    summary: "Dashboard notes",
    tags: [],
    updatedAt: "2026-04-01T00:00:00.000Z",
    kind: "note",
    content: "metrics dashboards",
    path: ["backend", "metrics"],
    sourcePath: "data/docs/backend/metrics/metrics-overview.md",
  },
  {
    id: "note-b",
    title: "Meetings",
    summary: "Team sync",
    tags: [],
    updatedAt: "2026-04-01T00:00:00.000Z",
    kind: "note",
    content: "weekly meetings",
    path: ["backend", "meetings"],
    sourcePath: "data/docs/backend/meetings/meetings.md",
  },
  {
    id: "note-c",
    title: "Frontend plan",
    summary: "UI work",
    tags: [],
    updatedAt: "2026-04-01T00:00:00.000Z",
    kind: "note",
    content: "frontend only",
    path: ["frontend"],
    sourcePath: "data/docs/frontend/plan.md",
  },
];

const tree: NoteTreeNode[] = [
  {
    id: "folder-backend",
    type: "folder",
    title: "backend",
    children: [
      {
        id: "folder-metrics",
        type: "folder",
        title: "metrics",
        children: [{ id: "leaf-a", type: "note", noteId: "note-a" }],
      },
      {
        id: "folder-meetings",
        type: "folder",
        title: "meetings",
        children: [{ id: "leaf-b", type: "note", noteId: "note-b" }],
      },
    ],
  },
  {
    id: "folder-frontend",
    type: "folder",
    title: "frontend",
    children: [{ id: "leaf-c", type: "note", noteId: "note-c" }],
  },
];

test("marks matching and excluded note branches for live tree dimming", () => {
  const result = buildNoteTreeSearchStateMap({
    currentSection: "notes",
    notes,
    query: "metrics",
    tree,
  });

  assert.equal(result.matchingNoteCount, 1);
  assert.equal(result.stateByNodeId.get("leaf-a"), "match");
  assert.equal(result.stateByNodeId.get("leaf-b"), "excluded");
  assert.equal(result.stateByNodeId.get("leaf-c"), "excluded");
  assert.equal(result.stateByNodeId.get("folder-backend"), "partial");
  assert.equal(result.stateByNodeId.get("folder-metrics"), "match");
  assert.equal(result.stateByNodeId.get("folder-frontend"), "excluded");
});

test("respects folder scope and dims partial ancestors", () => {
  const result = buildNoteTreeSearchStateMap({
    currentSection: "notes",
    notes,
    query: "in:notes folder:backend/metrics",
    tree,
  });

  assert.equal(result.matchingNoteCount, 1);
  assert.equal(result.stateByNodeId.get("folder-backend"), "partial");
  assert.equal(result.stateByNodeId.get("folder-metrics"), "match");
  assert.equal(result.stateByNodeId.get("folder-meetings"), "excluded");
  assert.equal(result.stateByNodeId.get("folder-frontend"), "excluded");
});

test("marks the whole tree excluded when explicit section scope points elsewhere", () => {
  const result = buildNoteTreeSearchStateMap({
    currentSection: "wiki",
    notes,
    query: "in:notes metrics",
    tree,
  });

  assert.equal(result.matchingNoteCount, 0);
  assert.equal(result.stateByNodeId.get("folder-backend"), "excluded");
  assert.equal(result.stateByNodeId.get("leaf-a"), "excluded");
});
