/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";

import { filterEntriesBySearchFilters, parseSearchFilterQuery } from "../src/searchFilters.ts";

test("parses type, tag, due, and is search filters", () => {
  assert.deepEqual(parseSearchFilterQuery("type:todo tag:release due:today is:starred fix login"), {
    due: "today",
    hasFilters: true,
    isRecent: false,
    isStarred: true,
    query: "fix login",
    tags: ["release"],
    types: ["todo"],
  });

  assert.deepEqual(parseSearchFilterQuery("is:recent type:bookmark docs"), {
    due: null,
    hasFilters: true,
    isRecent: true,
    isStarred: false,
    query: "docs",
    tags: [],
    types: ["bookmark"],
  });
});

test("filters entries by tag, recent, starred, and due windows", () => {
  const entries = [
    {
      id: "todo-overdue",
      title: "Overdue task",
      subtitle: "",
      category: "todo" as const,
      filterTags: ["release"],
      isRecent: true,
      isStarred: true,
      scoreText: "",
      tags: [],
      todoDueDate: "2026-04-20T00:00:00.000Z",
      todoStatus: "in-progress" as const,
    },
    {
      id: "todo-today",
      title: "Today task",
      subtitle: "",
      category: "todo" as const,
      filterTags: ["release", "frontend"],
      isRecent: false,
      isStarred: false,
      scoreText: "",
      tags: [],
      todoDueDate: "2026-04-30T09:00:00.000Z",
      todoStatus: "not-started" as const,
    },
    {
      id: "note-a",
      title: "Release notes",
      subtitle: "",
      category: "note" as const,
      filterTags: ["release"],
      isRecent: true,
      isStarred: true,
      scoreText: "",
      tags: [],
    },
  ];

  assert.deepEqual(
    filterEntriesBySearchFilters(
      entries,
      parseSearchFilterQuery("type:todo tag:release is:starred due:overdue"),
      new Date("2026-04-30T12:00:00.000Z"),
    ).map((entry) => entry.id),
    ["todo-overdue"],
  );

  assert.deepEqual(
    filterEntriesBySearchFilters(
      entries,
      parseSearchFilterQuery("is:recent tag:release"),
      new Date("2026-04-30T12:00:00.000Z"),
    ).map((entry) => entry.id),
    ["todo-overdue", "note-a"],
  );

  assert.deepEqual(
    filterEntriesBySearchFilters(
      entries,
      parseSearchFilterQuery("due:today"),
      new Date("2026-04-30T12:00:00.000Z"),
    ).map((entry) => entry.id),
    ["todo-today"],
  );
});
