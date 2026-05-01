/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";

import {
  composeScopedSearchQuery,
  consumeScopedSearchInput,
  consumeScopedSearchInputWithDefaultSection,
  consumeScopedSearchInputWithCurrentScopes,
  filterEntriesByScope,
  getScopeTokenSuggestions,
  parseScopedSearchQuery,
} from "../src/searchScope.ts";

test("parses chained section and folder search scopes", () => {
  assert.deepEqual(parseScopedSearchQuery("in:notes folder:backend/apheleia retry logic"), {
    noteSectionScope: null,
    sectionScope: "notes",
    folderScopePath: ["backend", "apheleia"],
    query: "retry logic",
  });

  assert.deepEqual(parseScopedSearchQuery("in:wiki folder:Architecture/API auth"), {
    noteSectionScope: null,
    sectionScope: "wiki",
    folderScopePath: ["Architecture", "API"],
    query: "auth",
  });
});

test("parses note section scopes for notes search", () => {
  assert.deepEqual(parseScopedSearchQuery("in:notes section:meetings folder:webinars rollout"), {
    noteSectionScope: "meetings",
    sectionScope: "notes",
    folderScopePath: ["webinars"],
    query: "rollout",
  });
});

test("parses todo scope aliases", () => {
  assert.deepEqual(parseScopedSearchQuery("in:tasks release prep"), {
    noteSectionScope: null,
    sectionScope: "todo",
    folderScopePath: [],
    query: "release prep",
  });
});

test("consumes chained scopes from search input state", () => {
  assert.deepEqual(consumeScopedSearchInput("in:notes folder:backend/apheleia"), {
    noteSectionScope: null,
    sectionScope: "notes",
    folderScopePath: ["backend", "apheleia"],
    text: "",
  });
});

test("defaults folder-only queries to the current section", () => {
  assert.deepEqual(consumeScopedSearchInputWithDefaultSection("folder:backend", "notes"), {
    sectionScope: null,
    noteSectionScope: null,
    folderScopePath: [],
    text: "folder:backend",
  });

  assert.deepEqual(consumeScopedSearchInputWithDefaultSection("folder:backend ", "notes"), {
    noteSectionScope: null,
    sectionScope: "notes",
    folderScopePath: ["backend"],
    text: "",
  });

  assert.deepEqual(consumeScopedSearchInputWithDefaultSection("folder:architecture ", "wiki"), {
    noteSectionScope: null,
    sectionScope: "wiki",
    folderScopePath: ["architecture"],
    text: "",
  });

  assert.deepEqual(consumeScopedSearchInputWithDefaultSection("onboarding", "notes"), {
    sectionScope: null,
    noteSectionScope: null,
    folderScopePath: [],
    text: "onboarding",
  });

  assert.deepEqual(consumeScopedSearchInputWithDefaultSection("in:notes onboarding", "wiki"), {
    noteSectionScope: null,
    sectionScope: "notes",
    folderScopePath: [],
    text: "onboarding",
  });
});

test("suggests scoped tokens after two characters", () => {
  assert.deepEqual(
    getScopeTokenSuggestions({
      currentSection: "notes",
      folderPaths: [["backend"], ["backend", "apheleia"], ["meetings"], ["metrics"]],
      inputValue: "in:no",
      noteSections: [
        { label: "Backend", value: "backend" },
        { label: "Meetings", value: "meetings" },
      ],
      sectionOptions: ["notes", "wiki", "bookmarks", "todo", "starred", "recent"],
      sectionScope: null,
    }).map((suggestion) => ({ kind: suggestion.kind, label: suggestion.label })),
    [{ kind: "section", label: "Notes" }],
  );

  assert.deepEqual(
    getScopeTokenSuggestions({
      currentSection: "notes",
      folderPaths: [["backend"], ["backend", "apheleia"], ["meetings"], ["metrics"]],
      inputValue: "in:to",
      noteSections: [
        { label: "Backend", value: "backend" },
        { label: "Meetings", value: "meetings" },
      ],
      sectionOptions: ["notes", "wiki", "bookmarks", "todo", "starred", "recent"],
      sectionScope: null,
    }).map((suggestion) => ({ kind: suggestion.kind, label: suggestion.label })),
    [{ kind: "section", label: "TODO" }],
  );

  assert.deepEqual(
    getScopeTokenSuggestions({
      currentSection: "notes",
      folderPaths: [["backend"], ["backend", "apheleia"], ["meetings"], ["metrics"]],
      inputValue: "folder:ap",
      noteSections: [
        { label: "Backend", value: "backend" },
        { label: "Meetings", value: "meetings" },
      ],
      sectionOptions: ["notes", "wiki", "bookmarks", "todo", "starred", "recent"],
      sectionScope: null,
    }).map((suggestion) => ({ kind: suggestion.kind, label: suggestion.label, path: suggestion.path })),
    [{ kind: "folder", label: "apheleia", path: ["backend", "apheleia"] }],
  );

  assert.deepEqual(
    getScopeTokenSuggestions({
      currentSection: "notes",
      folderPaths: [["backend"], ["backend", "apheleia"], ["meetings"], ["metrics"]],
      inputValue: "folder:et",
      noteSections: [
        { label: "Backend", value: "backend" },
        { label: "Meetings", value: "meetings" },
      ],
      sectionOptions: ["notes", "wiki", "bookmarks", "todo", "starred", "recent"],
      sectionScope: null,
    }).map((suggestion) => suggestion.label),
    ["meetings", "metrics"],
  );

  assert.deepEqual(
    getScopeTokenSuggestions({
      currentSection: "notes",
      folderPaths: [["backend"], ["backend", "apheleia"], ["meetings"], ["metrics"]],
      inputValue: "section:me",
      noteSections: [
        { label: "Backend", value: "backend" },
        { label: "Meetings", value: "meetings" },
      ],
      sectionOptions: ["notes", "wiki", "bookmarks", "todo", "starred", "recent"],
      sectionScope: "notes",
    }).map((suggestion) => ({ kind: suggestion.kind, label: suggestion.label })),
    [{ kind: "note-section", label: "Meetings" }],
  );
});

test("consumes an added folder scope when a section scope already exists", () => {
  assert.deepEqual(consumeScopedSearchInputWithCurrentScopes("in:F", "notes", null, []), {
    sectionScope: "notes",
    noteSectionScope: null,
    folderScopePath: [],
    text: "in:F",
  });

  assert.deepEqual(consumeScopedSearchInputWithCurrentScopes("in:Folder", "notes", null, []), {
    sectionScope: "notes",
    noteSectionScope: null,
    folderScopePath: [],
    text: "in:Folder",
  });

  assert.deepEqual(consumeScopedSearchInputWithCurrentScopes("in:Folder ", "notes", null, []), {
    sectionScope: "notes",
    noteSectionScope: null,
    folderScopePath: ["Folder"],
    text: "",
  });

  assert.deepEqual(consumeScopedSearchInputWithCurrentScopes("folder:Apheleia", "notes", null, []), {
    sectionScope: "notes",
    noteSectionScope: null,
    folderScopePath: [],
    text: "folder:Apheleia",
  });

  assert.deepEqual(consumeScopedSearchInputWithCurrentScopes("folder:Apheleia ", "notes", null, []), {
    sectionScope: "notes",
    noteSectionScope: null,
    folderScopePath: ["Apheleia"],
    text: "",
  });

  assert.deepEqual(consumeScopedSearchInputWithCurrentScopes("retry logic", "notes", "meetings", ["backend"]), {
    sectionScope: "notes",
    noteSectionScope: "meetings",
    folderScopePath: ["backend"],
    text: "retry logic",
  });
});

test("composes chained section and folder search scopes", () => {
  assert.equal(
    composeScopedSearchQuery("notes", "meetings", ["backend", "apheleia"], "retry logic"),
    "in:notes section:meetings folder:backend/apheleia retry logic",
  );
});

test("keeps backward compatibility for legacy second in: folder scopes", () => {
  assert.deepEqual(parseScopedSearchQuery("in:notes in:backend/apheleia retry logic"), {
    noteSectionScope: null,
    sectionScope: "notes",
    folderScopePath: ["backend", "apheleia"],
    query: "retry logic",
  });
});

test("filters entries by section and descendant folder scope", () => {
  const entries = [
    {
      id: "note-a",
      title: "A",
      subtitle: "",
      category: "note" as const,
      tags: [],
      scoreText: "",
      targetSection: "notes" as const,
      targetPath: ["backend", "apheleia"],
    },
    {
      id: "note-b",
      title: "B",
      subtitle: "",
      category: "note" as const,
      tags: [],
      scoreText: "",
      targetSection: "notes" as const,
      targetPath: ["backend", "apheleia", "internals"],
    },
    {
      id: "note-c",
      title: "C",
      subtitle: "",
      category: "note" as const,
      tags: [],
      scoreText: "",
      targetSection: "notes" as const,
      targetPath: ["frontend"],
    },
    {
      id: "wiki-a",
      title: "W",
      subtitle: "",
      category: "wiki" as const,
      tags: [],
      scoreText: "",
      targetSection: "wiki" as const,
      targetPath: ["backend", "apheleia"],
    },
  ];

  assert.deepEqual(
    filterEntriesByScope(entries, {
      noteSectionScope: "backend",
      sectionScope: "notes",
      folderScopePath: ["backend", "apheleia"],
      query: "",
    }).map((entry) => entry.id),
    ["note-a", "note-b"],
  );
});

test("filters entries by note section scope without a deeper folder scope", () => {
  const entries = [
    {
      id: "note-a",
      title: "A",
      subtitle: "",
      category: "note" as const,
      tags: [],
      scoreText: "",
      targetSection: "notes" as const,
      targetPath: ["meetings", "webinars"],
    },
    {
      id: "note-b",
      title: "B",
      subtitle: "",
      category: "note" as const,
      tags: [],
      scoreText: "",
      targetSection: "notes" as const,
      targetPath: ["architecture"],
    },
  ];

  assert.deepEqual(
    filterEntriesByScope(entries, {
      noteSectionScope: "meetings",
      sectionScope: "notes",
      folderScopePath: [],
      query: "",
    }).map((entry) => entry.id),
    ["note-a"],
  );
});

test("filters entries by starred and recent special scopes", () => {
  const entries = [
    {
      id: "note-starred",
      title: "Starred note",
      subtitle: "",
      category: "note" as const,
      isRecent: false,
      isStarred: true,
      tags: [],
      scoreText: "",
      targetSection: "notes" as const,
    },
    {
      id: "todo-recent",
      title: "Recent task",
      subtitle: "",
      category: "todo" as const,
      isRecent: true,
      isStarred: false,
      tags: [],
      scoreText: "",
      targetSection: "todo" as const,
    },
  ];

  assert.deepEqual(
    filterEntriesByScope(entries, {
      noteSectionScope: null,
      sectionScope: "starred",
      folderScopePath: [],
      query: "",
    }).map((entry) => entry.id),
    ["note-starred"],
  );

  assert.deepEqual(
    filterEntriesByScope(entries, {
      noteSectionScope: null,
      sectionScope: "recent",
      folderScopePath: [],
      query: "",
    }).map((entry) => entry.id),
    ["todo-recent"],
  );
});
