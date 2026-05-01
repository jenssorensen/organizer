/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";

import {
  applyNoteSectionPreferences,
  buildNoteSections,
  findNoteSectionById,
  findNoteSectionByScope,
  sanitizeNoteSectionPreferences,
} from "../src/noteSections.ts";
import type { NoteTreeNode } from "../src/types.ts";

test("buildNoteSections derives top-level note sections with counts and scope values", () => {
  const tree: NoteTreeNode[] = [
    {
      id: "section-meetings",
      type: "folder",
      title: "Meetings",
      sourcePath: "meetings",
      children: [
        {
          id: "folder-webinars",
          type: "folder",
          title: "Webinars",
          sourcePath: "meetings/webinars",
          children: [{ id: "note-1", type: "note", noteId: "note-1" }],
        },
        { id: "note-2", type: "note", noteId: "note-2" },
      ],
    },
    {
      id: "section-architecture",
      type: "folder",
      title: "Architecture",
      sourcePath: "architecture",
      children: [{ id: "note-3", type: "note", noteId: "note-3" }],
    },
  ];

  const sections = buildNoteSections(tree);

  assert.deepEqual(
    sections.map((section) => ({
      folderCount: section.folderCount,
      id: section.id,
      noteCount: section.noteCount,
      scopeValue: section.scopeValue,
      title: section.title,
    })),
    [
      {
        folderCount: 0,
        id: "__general__",
        noteCount: 0,
        scopeValue: "general",
        title: "General",
      },
      {
        folderCount: 1,
        id: "section-meetings",
        noteCount: 2,
        scopeValue: "meetings",
        title: "Meetings",
      },
      {
        folderCount: 0,
        id: "section-architecture",
        noteCount: 1,
        scopeValue: "architecture",
        title: "Architecture",
      },
    ],
  );

  assert.equal(findNoteSectionById(sections, "section-meetings")?.title, "Meetings");
  assert.equal(findNoteSectionByScope(sections, "architecture")?.id, "section-architecture");
});

test("applyNoteSectionPreferences supports local rename, color, and reorder metadata", () => {
  const baseSections = buildNoteSections([
    {
      id: "section-meetings",
      type: "folder",
      title: "Meetings",
      sourcePath: "meetings",
      children: [{ id: "note-1", type: "note", noteId: "note-1" }],
    },
    {
      id: "section-architecture",
      type: "folder",
      title: "Architecture",
      sourcePath: "architecture",
      children: [{ id: "note-2", type: "note", noteId: "note-2" }],
    },
  ]);

  const customizedSections = applyNoteSectionPreferences(
    baseSections,
    sanitizeNoteSectionPreferences({
      order: ["section-architecture", "__general__", "section-meetings"],
      overrides: {
        "section-architecture": { accentColor: "#123abc", title: "Systems" },
      },
    }),
  );

  assert.deepEqual(
    customizedSections.map((section) => ({
      accentColor: section.accentColor,
      id: section.id,
      title: section.title,
    })),
    [
      {
        accentColor: "#123abc",
        id: "section-architecture",
        title: "Systems",
      },
      {
        accentColor: "#94a3b8",
        id: "__general__",
        title: "General",
      },
      {
        accentColor: "#22c55e",
        id: "section-meetings",
        title: "Meetings",
      },
    ],
  );
});

test("sanitizeNoteSectionPreferences keeps hidden root folder ids", () => {
  assert.deepEqual(
    sanitizeNoteSectionPreferences({
      hiddenRootFolderIds: ["root-a", "", 42, "root-b"],
      order: [],
      overrides: {},
    }),
    {
      hiddenRootFolderIds: ["root-a", "root-b"],
      order: [],
      overrides: {},
    },
  );
});