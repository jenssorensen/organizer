/// <reference path="./node-test-shims.d.ts" />

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMarkdownUrlPasteInsertion,
  buildMarkdownDiffRows,
  buildOutlineBreadcrumbs,
  buildLineStartOffsets,
  findWikiLinkMatches,
  getMarkdownSlashCommands,
  getOffsetForLineColumn,
  isMarkdownEmbedDirectivePrefix,
  moveMarkdownSection,
  moveMarkdownSectionBefore,
  parseMarkdownOutline,
  parseMarkdownEmbedDirective,
  parseSourcePosition,
  replaceWikiLinkTargets,
  resolveMarkdownEmbed,
  rewriteMarkdownLinksForRename,
} from "../src/components/markdown/markdownEditorUtils.ts";

test("parseMarkdownOutline returns heading metadata with offsets", () => {
  const markdown = "# Intro\nBody\n## Details\n### Deep Dive\n";

  assert.deepEqual(parseMarkdownOutline(markdown), [
    { id: "1:intro", level: 1, title: "Intro", line: 1, from: 0, to: 7 },
    { id: "3:details", level: 2, title: "Details", line: 3, from: 13, to: 23 },
    { id: "4:deep-dive", level: 3, title: "Deep Dive", line: 4, from: 24, to: 37 },
  ]);
});

test("findWikiLinkMatches finds wiki links with line numbers", () => {
  const markdown = "See [[Alpha]]\nAnd [[Beta Note]] later";

  assert.deepEqual(findWikiLinkMatches(markdown), [
    { label: "Alpha", from: 4, to: 13, line: 1 },
    { label: "Beta Note", from: 18, to: 31, line: 2 },
  ]);
});

test("source position helpers map sourcepos attributes back to offsets", () => {
  const markdown = "# Intro\nParagraph\n";

  assert.deepEqual(buildLineStartOffsets(markdown), [0, 8, 18]);
  assert.deepEqual(parseSourcePosition("2:3-2:11"), { line: 2, column: 3 });
  assert.equal(getOffsetForLineColumn(markdown, 2, 3), 10);
});

test("moveMarkdownSectionBefore reorders heading sections", () => {
  const markdown = "# One\nA\n## Child\nB\n# Two\nC\n";
  const result = moveMarkdownSectionBefore(markdown, "5:two", "1:one");

  assert.deepEqual(result, {
    markdown: "# Two\nC\n# One\nA\n## Child\nB\n",
    selectionStart: 0,
  });
});

test("replaceWikiLinkTargets rewrites exact wiki-link labels", () => {
  const markdown = "See [[Alpha]] and [[Beta]] but not [[Gamma]].";
  const replacements = new Map<string, string>([["Alpha", "Alpha Project"], ["Beta", "Beta-2"]]);

  assert.equal(replaceWikiLinkTargets(markdown, replacements), "See [[Alpha Project]] and [[Beta-2]] but not [[Gamma]].");
});

test("replaceWikiLinkTargets preserves wiki-link aliases while rewriting targets", () => {
  const markdown = "See [[Alpha|Project Alpha]] and [[Beta|Alias|Still Alias]].";
  const replacements = new Map<string, string>([["Alpha", "Alpha Project"], ["Beta", "Beta-2"]]);

  assert.equal(
    replaceWikiLinkTargets(markdown, replacements),
    "See [[Alpha Project|Project Alpha]] and [[Beta-2|Alias|Still Alias]].",
  );
});

test("rewriteMarkdownLinksForRename rewrites aliases and markdown links for a renamed note", () => {
  const markdown = [
    "See [[Alpha]] and [[Alpha.md|file alias]].",
    "Read [plain](Alpha.md) and [relative](../docs/Alpha.md#intro).",
    "Ignore [external](https://example.com/Alpha.md).",
  ].join("\n");

  assert.equal(
    rewriteMarkdownLinksForRename(markdown, {
      previousTitle: "Alpha",
      nextTitle: "Alpha Project",
      previousFileName: "Alpha.md",
      nextFileName: "Alpha Project.md",
    }),
    [
      "See [[Alpha Project]] and [[Alpha Project|file alias]].",
      "Read [plain](Alpha%20Project.md) and [relative](../docs/Alpha%20Project.md#intro).",
      "Ignore [external](https://example.com/Alpha.md).",
    ].join("\n"),
  );
});

test("buildOutlineBreadcrumbs returns the active heading trail", () => {
  const outline = parseMarkdownOutline("# Root\n## Child\n### Leaf\n## Sibling\n");

  assert.deepEqual(
    buildOutlineBreadcrumbs(outline, "3:leaf").map((entry) => entry.title),
    ["Root", "Child", "Leaf"],
  );
});

test("moveMarkdownSection moves the current heading section down", () => {
  const markdown = "# One\nA\n# Two\nB\n# Three\nC\n";

  assert.deepEqual(moveMarkdownSection(markdown, 1, 1), {
    markdown: "# Two\nB\n# One\nA\n# Three\nC\n",
    selectionStart: 8,
  });
});

test("moveMarkdownSection moves the current heading section up", () => {
  const markdown = "# One\nA\n# Two\nB\n# Three\nC\n";

  assert.deepEqual(moveMarkdownSection(markdown, 16, -1), {
    markdown: "# One\nA\n# Three\nC\n# Two\nB\n",
    selectionStart: 8,
  });
});

test("buildMarkdownDiffRows aligns same, modified, added, and removed lines", () => {
  assert.deepEqual(buildMarkdownDiffRows("one\ntwo\nthree", "one\nTWO\nthree\nfour"), [
    { beforeLineNumber: 1, afterLineNumber: 1, beforeText: "one", afterText: "one", kind: "same" },
    { beforeLineNumber: 2, afterLineNumber: 2, beforeText: "two", afterText: "TWO", kind: "modified" },
    { beforeLineNumber: 3, afterLineNumber: 3, beforeText: "three", afterText: "three", kind: "same" },
    { beforeLineNumber: null, afterLineNumber: 4, beforeText: "", afterText: "four", kind: "added" },
  ]);
});

test("buildMarkdownUrlPasteInsertion chooses link, card, image, and embed modes", () => {
  assert.deepEqual(
    buildMarkdownUrlPasteInsertion({ url: "https://example.com", selectedText: "Example", useStandalonePreview: false }),
    { insert: "[Example](https://example.com)", kind: "link" },
  );

  assert.deepEqual(
    buildMarkdownUrlPasteInsertion({ url: "https://example.com/article", useStandalonePreview: true }),
    { insert: "https://example.com/article", kind: "card" },
  );

  assert.deepEqual(
    buildMarkdownUrlPasteInsertion({ url: "https://cdn.example.com/diagram.png", useStandalonePreview: false }),
    { insert: "![diagram](https://cdn.example.com/diagram.png)", kind: "image" },
  );

  assert.deepEqual(
    buildMarkdownUrlPasteInsertion({ url: "https://example.com/reference.pdf", useStandalonePreview: false }),
    { insert: "[reference](https://example.com/reference.pdf)", kind: "embed" },
  );
});

test("getMarkdownSlashCommands exposes common block insertions", () => {
  const commands = getMarkdownSlashCommands();

  assert.ok(commands.some((command) => command.label === "/note" && command.insert.includes("[!NOTE]")));
  assert.ok(commands.some((command) => command.label === "/embed youtube" && command.insert.includes("youtube.com/watch?v=VIDEO_ID")));
  assert.ok(commands.some((command) => command.label === "/embed loom" && command.insert.includes("loom.com/share/VIDEO_ID")));
  assert.ok(commands.some((command) => command.label === "/embed figma" && command.insert.includes("figma.com/file/FILE_ID")));
  assert.ok(commands.some((command) => command.label === "/mermaid" && command.insert.includes("```mermaid")));
  assert.ok(commands.some((command) => command.label === "/agenda" && command.insert.includes("## Agenda")));
});

test("embed directive helpers detect and parse explicit embed lines", () => {
  assert.equal(isMarkdownEmbedDirectivePrefix("/embed "), true);
  assert.equal(isMarkdownEmbedDirectivePrefix("  /embed https://www.youtube.com/watch?v=abc123  "), true);
  assert.equal(isMarkdownEmbedDirectivePrefix("paragraph /embed https://example.com"), false);
  assert.equal(parseMarkdownEmbedDirective("/embed https://www.youtube.com/watch?v=abc123"), "https://www.youtube.com/watch?v=abc123");
  assert.equal(parseMarkdownEmbedDirective("/embed"), null);
});

test("resolveMarkdownEmbed maps supported providers to embed URLs", () => {
  assert.deepEqual(resolveMarkdownEmbed("https://youtu.be/abc123?t=10"), {
    provider: "youtube",
    url: "https://youtu.be/abc123?t=10",
    embedUrl: "https://www.youtube.com/embed/abc123",
    title: "YouTube",
  });

  assert.deepEqual(resolveMarkdownEmbed("https://www.loom.com/share/9f0b6010f3d94d6bb0b5d6acbeef1234"), {
    provider: "loom",
    url: "https://www.loom.com/share/9f0b6010f3d94d6bb0b5d6acbeef1234",
    embedUrl: "https://www.loom.com/embed/9f0b6010f3d94d6bb0b5d6acbeef1234",
    title: "Loom",
  });

  assert.deepEqual(resolveMarkdownEmbed("https://www.figma.com/file/abc123/Design-System?node-id=1%3A2"), {
    provider: "figma",
    url: "https://www.figma.com/file/abc123/Design-System?node-id=1%3A2",
    embedUrl: "https://www.figma.com/embed?embed_host=organizer&url=https%3A%2F%2Fwww.figma.com%2Ffile%2Fabc123%2FDesign-System%3Fnode-id%3D1%253A2",
    title: "Figma",
  });

  assert.equal(resolveMarkdownEmbed("https://example.com/article"), null);
});