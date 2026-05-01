/// <reference path="./node-test-shims.d.ts" />

import assert from "node:assert/strict";
import test from "node:test";

import { buildNoteSections } from "../src/noteSections.ts";
import { filterEmptyFolderNodes, filterEmptyNoteSections } from "../src/noteVisibility.ts";
import type { NoteTreeNode } from "../src/types.ts";

test("filterEmptyNoteSections removes sections with zero items", () => {
  const sections = buildNoteSections([
    {
      id: "empty-section",
      type: "folder",
      title: "Empty",
      sourcePath: "empty",
      children: [],
    },
    {
      id: "active-section",
      type: "folder",
      title: "Active",
      sourcePath: "active",
      children: [{ id: "note-1", type: "note", noteId: "note-1" }],
    },
  ]);

  const visibleSections = filterEmptyNoteSections(sections);

  assert.deepEqual(visibleSections.map((section) => section.id), ["active-section"]);
});

test("filterEmptyNoteSections removes sections that only contain empty folders", () => {
  const sections = buildNoteSections([
    {
      id: "empty-section",
      type: "folder",
      title: "Empty",
      sourcePath: "empty",
      children: [
        {
          id: "nested-empty-folder",
          type: "folder",
          title: "Nested empty folder",
          sourcePath: "empty/nested",
          children: [],
        },
      ],
    },
    {
      id: "active-section",
      type: "folder",
      title: "Active",
      sourcePath: "active",
      children: [
        {
          id: "nested-notes-folder",
          type: "folder",
          title: "Nested notes folder",
          sourcePath: "active/nested",
          children: [{ id: "note-1", type: "note", noteId: "note-1" }],
        },
      ],
    },
  ]);

  const visibleSections = filterEmptyNoteSections(sections);

  assert.deepEqual(visibleSections.map((section) => section.id), ["active-section"]);
});

test("filterEmptyFolderNodes prunes empty folder branches and preserves folders with notes", () => {
  const tree: NoteTreeNode[] = [
    {
      id: "empty-folder",
      type: "folder",
      title: "Empty folder",
      children: [],
    },
    {
      id: "empty-parent",
      type: "folder",
      title: "Empty parent",
      children: [
        {
          id: "empty-child",
          type: "folder",
          title: "Empty child",
          children: [],
        },
      ],
    },
    {
      id: "notes-folder",
      type: "folder",
      title: "Notes folder",
      children: [
        {
          id: "nested-folder",
          type: "folder",
          title: "Nested folder",
          children: [{ id: "note-1", type: "note", noteId: "note-1" }],
        },
      ],
    },
  ];

  const visibleTree = filterEmptyFolderNodes(tree);

  assert.deepEqual(visibleTree, [
    {
      id: "notes-folder",
      type: "folder",
      title: "Notes folder",
      children: [
        {
          id: "nested-folder",
          type: "folder",
          title: "Nested folder",
          children: [{ id: "note-1", type: "note", noteId: "note-1" }],
        },
      ],
    },
  ]);
});
