export type MarkdownOutlineEntry = {
  id: string;
  level: number;
  title: string;
  line: number;
  from: number;
  to: number;
};

export type WikiLinkMatch = {
  label: string;
  from: number;
  to: number;
  line: number;
};

export type SourcePosition = {
  line: number;
  column: number;
};

export type MarkdownSectionMoveResult = {
  markdown: string;
  selectionStart: number;
};

export type MarkdownLinkRename = {
  previousTitle?: string;
  nextTitle?: string;
  previousFileName?: string;
  nextFileName?: string;
};

export type MarkdownDiffRow = {
  beforeLineNumber: number | null;
  afterLineNumber: number | null;
  beforeText: string;
  afterText: string;
  kind: "same" | "added" | "removed" | "modified";
};

export type MarkdownUrlPasteInsertion = {
  insert: string;
  kind: "link" | "card" | "image" | "embed";
};

export type MarkdownEmbedProvider = "youtube" | "loom" | "figma";

export type MarkdownEmbedMatch = {
  provider: MarkdownEmbedProvider;
  url: string;
  embedUrl: string;
  title: string;
};

export type MarkdownSlashCommand = {
  id: string;
  label: string;
  aliases: string[];
  detail: string;
  insert: string;
  cursorOffset: number;
};

const headingPattern = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const wikiLinkPattern = /\[\[([^\]\n]+)\]\]/g;
const markdownSlashCommands: MarkdownSlashCommand[] = [
  { id: "note", label: "/note", aliases: ["callout", "admonition"], detail: "Insert a note callout", insert: "> [!NOTE] Note\n> \n", cursorOffset: "> [!NOTE] Note\n> ".length },
  { id: "tip", label: "/tip", aliases: ["callout", "admonition"], detail: "Insert a tip callout", insert: "> [!TIP] Tip\n> \n", cursorOffset: "> [!TIP] Tip\n> ".length },
  { id: "warning", label: "/warning", aliases: ["callout", "admonition"], detail: "Insert a warning callout", insert: "> [!WARNING] Warning\n> \n", cursorOffset: "> [!WARNING] Warning\n> ".length },
  { id: "embed-youtube", label: "/embed youtube", aliases: ["embed", "video", "youtube"], detail: "Insert a YouTube embed block", insert: "/embed https://www.youtube.com/watch?v=VIDEO_ID", cursorOffset: "/embed https://www.youtube.com/watch?v=".length },
  { id: "embed-loom", label: "/embed loom", aliases: ["embed", "video", "loom"], detail: "Insert a Loom embed block", insert: "/embed https://www.loom.com/share/VIDEO_ID", cursorOffset: "/embed https://www.loom.com/share/".length },
  { id: "embed-figma", label: "/embed figma", aliases: ["embed", "design", "figma"], detail: "Insert a Figma embed block", insert: "/embed https://www.figma.com/file/FILE_ID/Design?node-id=1%3A2", cursorOffset: "/embed https://www.figma.com/file/".length },
  { id: "quote", label: "/quote", aliases: ["blockquote"], detail: "Insert a blockquote", insert: "> ", cursorOffset: 2 },
  { id: "table", label: "/table", aliases: ["grid"], detail: "Insert a 3x3 markdown table", insert: "\n| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n|   |   |   |\n|   |   |   |\n|   |   |   |\n", cursorOffset: "\n| Column 1 | ".length },
  { id: "code", label: "/code", aliases: ["fence", "snippet"], detail: "Insert a fenced code block", insert: "\n```text\n\n```\n", cursorOffset: "\n```text\n".length },
  { id: "mermaid", label: "/mermaid", aliases: ["diagram"], detail: "Insert a Mermaid block", insert: "\n```mermaid\nsequenceDiagram\n\n```\n", cursorOffset: "\n```mermaid\nsequenceDiagram".length },
  { id: "math", label: "/math", aliases: ["equation", "latex"], detail: "Insert a block math section", insert: "\n$$\n\n$$\n", cursorOffset: "\n$$\n".length },
  { id: "toc", label: "/toc", aliases: ["outline"], detail: "Insert a table-of-contents heading", insert: "## Table of Contents\n\n- [](#)\n", cursorOffset: "## Table of Contents\n\n- [".length },
  { id: "agenda", label: "/agenda", aliases: ["template", "meeting"], detail: "Insert a meeting agenda template", insert: "## Agenda\n\n1. \n\n## Notes\n\n## Action Items\n\n- [ ] \n", cursorOffset: "## Agenda\n\n1. ".length },
  { id: "actions", label: "/actions", aliases: ["template", "tasks"], detail: "Insert an action items template", insert: "## Action Items\n\n- [ ] \n- [ ] \n", cursorOffset: "## Action Items\n\n- [ ] ".length },
  { id: "divider", label: "/divider", aliases: ["rule", "hr"], detail: "Insert a horizontal rule", insert: "\n---\n", cursorOffset: "\n---\n".length },
];

export function buildLineStartOffsets(markdown: string) {
  const starts = [0];

  for (let index = 0; index < markdown.length; index += 1) {
    if (markdown.charCodeAt(index) === 10) {
      starts.push(index + 1);
    }
  }

  return starts;
}

export function getMarkdownSlashCommands() {
  return markdownSlashCommands;
}

export function isMarkdownEmbedDirectivePrefix(lineText: string) {
  return /^\s*\/embed(?:\s|$)/i.test(lineText);
}

export function parseMarkdownEmbedDirective(lineText: string) {
  const match = lineText.match(/^\s*\/embed\s+(\S+)\s*$/i);
  if (!match) {
    return null;
  }

  return match[1];
}

export function resolveMarkdownEmbed(url: string): MarkdownEmbedMatch | null {
  const normalizedUrl = url.trim();
  if (!normalizedUrl) {
    return null;
  }

  const parsedUrl = parseUrlSafely(normalizedUrl);
  if (!parsedUrl) {
    return null;
  }

  const youtubeEmbed = resolveYouTubeEmbed(parsedUrl, normalizedUrl);
  if (youtubeEmbed) {
    return youtubeEmbed;
  }

  const loomEmbed = resolveLoomEmbed(parsedUrl, normalizedUrl);
  if (loomEmbed) {
    return loomEmbed;
  }

  const figmaEmbed = resolveFigmaEmbed(parsedUrl, normalizedUrl);
  if (figmaEmbed) {
    return figmaEmbed;
  }

  return null;
}

export function buildMarkdownUrlPasteInsertion({
  url,
  selectedText,
  useStandalonePreview,
}: {
  url: string;
  selectedText?: string;
  useStandalonePreview: boolean;
}): MarkdownUrlPasteInsertion | null {
  const normalizedUrl = url.trim();
  if (!normalizedUrl) {
    return null;
  }

  const linkText = (selectedText ?? "").trim();
  if (linkText) {
    return {
      insert: `[${selectedText}](${normalizedUrl})`,
      kind: "link",
    };
  }

  if (isMarkdownImageUrl(normalizedUrl)) {
    return {
      insert: `![${buildUrlLabel(normalizedUrl, "Image")}](${normalizedUrl})`,
      kind: "image",
    };
  }

  if (isMarkdownPdfUrl(normalizedUrl)) {
    return {
      insert: `[${buildUrlLabel(normalizedUrl, "Open PDF")}](${normalizedUrl})`,
      kind: "embed",
    };
  }

  if (useStandalonePreview) {
    return {
      insert: normalizedUrl,
      kind: "card",
    };
  }

  return {
    insert: `[${buildUrlLabel(normalizedUrl, "Link")}](${normalizedUrl})`,
    kind: "link",
  };
}

export function getOffsetForLineColumn(markdown: string, line: number, column = 1) {
  const starts = buildLineStartOffsets(markdown);
  const lineIndex = Math.max(0, Math.min(line - 1, starts.length - 1));
  const lineStart = starts[lineIndex] ?? 0;
  const nextLineStart = starts[lineIndex + 1] ?? markdown.length;
  const lineLength = Math.max(nextLineStart - lineStart - 1, 0);
  const safeColumn = Math.max(1, Math.min(column, lineLength + 1));

  return lineStart + safeColumn - 1;
}

export function parseSourcePosition(sourcePos: string | null | undefined): SourcePosition | null {
  if (!sourcePos) {
    return null;
  }

  const match = sourcePos.match(/^(\d+):(\d+)-\d+:\d+$/);
  if (!match) {
    return null;
  }

  return {
    line: Number(match[1]),
    column: Number(match[2]),
  };
}

export function parseMarkdownOutline(markdown: string): MarkdownOutlineEntry[] {
  const lines = markdown.split("\n");
  let offset = 0;

  return lines.flatMap((line, index) => {
    const headingMatch = line.match(headingPattern);
    const lineStart = offset;
    offset += line.length + 1;

    if (!headingMatch) {
      return [];
    }

    const level = headingMatch[1].length;
    const title = headingMatch[2].trim();
    if (!title) {
      return [];
    }

    return [{
      id: `${index + 1}:${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`,
      level,
      title,
      line: index + 1,
      from: lineStart,
      to: lineStart + line.length,
    } satisfies MarkdownOutlineEntry];
  });
}

export function findWikiLinkMatches(markdown: string): WikiLinkMatch[] {
  const lineStarts = buildLineStartOffsets(markdown);
  const links: WikiLinkMatch[] = [];
  let match: RegExpExecArray | null = null;

  while ((match = wikiLinkPattern.exec(markdown)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    const line = findLineForOffset(lineStarts, from);

    links.push({
      label: match[1].trim(),
      from,
      to,
      line,
    });
  }

  wikiLinkPattern.lastIndex = 0;
  return links;
}

export function replaceWikiLinkTargets(markdown: string, replacements: Map<string, string>) {
  if (replacements.size === 0) {
    return markdown;
  }

  return markdown.replace(/\[\[([^\]\n]+)\]\]/g, (fullMatch, rawLabel: string) => {
    const [rawTarget, ...aliasParts] = rawLabel.split("|");
    const target = rawTarget.trim();
    const replacement = replacements.get(target);
    if (!replacement) {
      return fullMatch;
    }

    const alias = aliasParts.length > 0 ? `|${aliasParts.join("|")}` : "";
    return `[[${replacement}${alias}]]`;
  });
}

export function rewriteMarkdownLinksForRename(markdown: string, rename: MarkdownLinkRename) {
  const titleReplacements = new Map<string, string>();
  if (rename.previousTitle && rename.nextTitle && rename.previousTitle !== rename.nextTitle) {
    titleReplacements.set(rename.previousTitle, rename.nextTitle);
  }

  let nextMarkdown = replaceWikiLinkTargets(markdown, titleReplacements);
  const nextFileName = rename.nextFileName;

  const fileNameReplacements = new Map<string, string>();
  if (rename.previousFileName && nextFileName && rename.previousFileName !== nextFileName) {
    const previousBase = rename.previousFileName.replace(/\.[^.]+$/, "");
    const nextBase = nextFileName.replace(/\.[^.]+$/, "");

    fileNameReplacements.set(rename.previousFileName, nextBase || nextFileName);
    if (previousBase && nextBase && previousBase !== nextBase) {
      fileNameReplacements.set(previousBase, nextBase);
    }
  }

  nextMarkdown = replaceWikiLinkTargets(nextMarkdown, fileNameReplacements);

  if (rename.previousFileName && nextFileName && rename.previousFileName !== nextFileName) {
    nextMarkdown = nextMarkdown.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (fullMatch, label: string, href: string) => {
      const hrefMatch = href.match(/^([^?#]+)(.*)$/);
      if (!hrefMatch) {
        return fullMatch;
      }

      const pathname = hrefMatch[1];
      const suffix = hrefMatch[2] ?? "";
      if (/^[a-z][a-z0-9+.-]*:/i.test(pathname) || pathname.startsWith("//")) {
        return fullMatch;
      }

      const decodedPathname = decodePathnameSafely(pathname);
      const segments = decodedPathname.split("/");
      const currentFileName = segments[segments.length - 1] ?? "";
      if (currentFileName !== rename.previousFileName) {
        return fullMatch;
      }

      segments[segments.length - 1] = nextFileName;
      const nextPathname = encodePathSegments(segments);
      return `[${label}](${nextPathname}${suffix})`;
    });
  }

  return nextMarkdown;
}

export function moveMarkdownSection(markdown: string, selectionStart: number, direction: -1 | 1): MarkdownSectionMoveResult | null {
  const outline = parseMarkdownOutline(markdown);
  if (outline.length < 2) {
    return null;
  }

  const currentEntryIndex = findOutlineEntryIndexAtOffset(outline, selectionStart);
  if (currentEntryIndex === -1) {
    return null;
  }

  const targetIndex = direction === -1 ? currentEntryIndex - 1 : currentEntryIndex + 1;
  if (targetIndex < 0 || targetIndex >= outline.length) {
    return null;
  }

  const sourceEntry = outline[currentEntryIndex];
  const targetEntry = outline[targetIndex];
  return direction === -1
    ? moveMarkdownSectionBefore(markdown, sourceEntry.id, targetEntry.id)
    : moveMarkdownSectionAfter(markdown, sourceEntry.id, targetEntry.id);
}

export function buildMarkdownDiffRows(before: string, after: string): MarkdownDiffRow[] {
  const beforeLines = before.replace(/\r\n/g, "\n").split("\n");
  const afterLines = after.replace(/\r\n/g, "\n").split("\n");
  const lcs = buildLcsMatrix(beforeLines, afterLines);
  const alignedRows = backtrackAlignedRows(beforeLines, afterLines, lcs);
  const rows: MarkdownDiffRow[] = [];
  let beforeLineNumber = 0;
  let afterLineNumber = 0;

  for (let index = 0; index < alignedRows.length; index += 1) {
    const current = alignedRows[index];
    const next = alignedRows[index + 1];

    if (
      current?.kind === "removed"
      && next?.kind === "added"
    ) {
      beforeLineNumber += 1;
      afterLineNumber += 1;
      rows.push({
        beforeLineNumber,
        afterLineNumber,
        beforeText: current.beforeText,
        afterText: next.afterText,
        kind: "modified",
      });
      index += 1;
      continue;
    }

    if (current.kind === "same") {
      beforeLineNumber += 1;
      afterLineNumber += 1;
      rows.push({
        beforeLineNumber,
        afterLineNumber,
        beforeText: current.beforeText,
        afterText: current.afterText,
        kind: "same",
      });
      continue;
    }

    if (current.kind === "removed") {
      beforeLineNumber += 1;
      rows.push({
        beforeLineNumber,
        afterLineNumber: null,
        beforeText: current.beforeText,
        afterText: "",
        kind: "removed",
      });
      continue;
    }

    afterLineNumber += 1;
    rows.push({
      beforeLineNumber: null,
      afterLineNumber,
      beforeText: "",
      afterText: current.afterText,
      kind: "added",
    });
  }

  return rows;
}

export function moveMarkdownSectionBefore(markdown: string, sourceId: string, targetId: string): MarkdownSectionMoveResult | null {
  if (!sourceId || !targetId || sourceId === targetId) {
    return null;
  }

  const outline = parseMarkdownOutline(markdown);
  const sourceIndex = outline.findIndex((entry) => entry.id === sourceId);
  const targetIndex = outline.findIndex((entry) => entry.id === targetId);

  if (sourceIndex === -1 || targetIndex === -1) {
    return null;
  }

  const sourceRange = getSectionRange(outline, sourceIndex, markdown.length);
  const targetRange = getSectionRange(outline, targetIndex, markdown.length);
  if (!sourceRange || !targetRange) {
    return null;
  }

  if (targetRange.from > sourceRange.from && targetRange.from < sourceRange.to) {
    return null;
  }

  const sourceText = markdown.slice(sourceRange.from, sourceRange.to);
  const withoutSource = markdown.slice(0, sourceRange.from) + markdown.slice(sourceRange.to);
  let insertionPoint = targetRange.from;

  if (sourceRange.from < targetRange.from) {
    insertionPoint -= sourceText.length;
  }

  const nextMarkdown = withoutSource.slice(0, insertionPoint) + sourceText + withoutSource.slice(insertionPoint);
  return {
    markdown: nextMarkdown,
    selectionStart: insertionPoint,
  };
}

export function buildOutlineBreadcrumbs(entries: MarkdownOutlineEntry[], activeEntryId: string | null) {
  if (!activeEntryId) {
    return [];
  }

  const activeIndex = entries.findIndex((entry) => entry.id === activeEntryId);
  if (activeIndex === -1) {
    return [];
  }

  const trail: MarkdownOutlineEntry[] = [];
  let currentLevel = Number.POSITIVE_INFINITY;

  for (let index = activeIndex; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.level < currentLevel) {
      trail.unshift(entry);
      currentLevel = entry.level;
    }
  }

  return trail;
}

function getSectionRange(outline: MarkdownOutlineEntry[], entryIndex: number, markdownLength: number) {
  const entry = outline[entryIndex];
  if (!entry) {
    return null;
  }

  let end = markdownLength;
  for (let index = entryIndex + 1; index < outline.length; index += 1) {
    if (outline[index].level <= entry.level) {
      end = outline[index].from;
      break;
    }
  }

  return {
    from: entry.from,
    to: end,
  };
}

function isMarkdownImageUrl(url: string) {
  return /\.(avif|bmp|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(url);
}

function isMarkdownPdfUrl(url: string) {
  return /\.pdf(?:[?#].*)?$/i.test(url);
}

function buildUrlLabel(url: string, fallback: string) {
  try {
    const parsedUrl = new URL(url);
    const lastSegment = parsedUrl.pathname.split("/").filter(Boolean).pop();
    const decodedSegment = lastSegment ? decodeURIComponent(lastSegment).replace(/\.[^.]+$/, "") : "";
    const normalizedSegment = decodedSegment.replace(/[-_]+/g, " ").trim();
    if (normalizedSegment) {
      return normalizedSegment;
    }

    return parsedUrl.hostname.replace(/^www\./i, "") || fallback;
  } catch {
    return fallback;
  }
}

function parseUrlSafely(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function resolveYouTubeEmbed(parsedUrl: URL, rawUrl: string): MarkdownEmbedMatch | null {
  const hostname = parsedUrl.hostname.toLowerCase();
  if (!hostname.includes("youtube.com") && !hostname.includes("youtu.be")) {
    return null;
  }

  const videoId = hostname.includes("youtu.be")
    ? parsedUrl.pathname.split("/").filter(Boolean)[0] ?? ""
    : parsedUrl.searchParams.get("v") ?? (parsedUrl.pathname.match(/\/(embed|shorts)\/([^/?#]+)/)?.[2] ?? "");
  if (!videoId) {
    return null;
  }

  return {
    provider: "youtube",
    url: rawUrl,
    embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`,
    title: "YouTube",
  };
}

function resolveLoomEmbed(parsedUrl: URL, rawUrl: string): MarkdownEmbedMatch | null {
  const hostname = parsedUrl.hostname.toLowerCase();
  if (!hostname.includes("loom.com")) {
    return null;
  }

  const videoId = parsedUrl.pathname.match(/\/(?:share|embed)\/([^/?#]+)/)?.[1] ?? "";
  if (!videoId) {
    return null;
  }

  return {
    provider: "loom",
    url: rawUrl,
    embedUrl: `https://www.loom.com/embed/${encodeURIComponent(videoId)}`,
    title: "Loom",
  };
}

function resolveFigmaEmbed(parsedUrl: URL, rawUrl: string): MarkdownEmbedMatch | null {
  const hostname = parsedUrl.hostname.toLowerCase();
  if (!hostname.includes("figma.com")) {
    return null;
  }

  const pathname = parsedUrl.pathname.toLowerCase();
  if (!pathname.startsWith("/file/") && !pathname.startsWith("/proto/") && !pathname.startsWith("/design/")) {
    return null;
  }

  return {
    provider: "figma",
    url: rawUrl,
    embedUrl: `https://www.figma.com/embed?embed_host=organizer&url=${encodeURIComponent(rawUrl)}`,
    title: "Figma",
  };
}

function moveMarkdownSectionAfter(markdown: string, sourceId: string, targetId: string): MarkdownSectionMoveResult | null {
  if (!sourceId || !targetId || sourceId === targetId) {
    return null;
  }

  const outline = parseMarkdownOutline(markdown);
  const sourceIndex = outline.findIndex((entry) => entry.id === sourceId);
  const targetIndex = outline.findIndex((entry) => entry.id === targetId);
  if (sourceIndex === -1 || targetIndex === -1) {
    return null;
  }

  const sourceRange = getSectionRange(outline, sourceIndex, markdown.length);
  const targetRange = getSectionRange(outline, targetIndex, markdown.length);
  if (!sourceRange || !targetRange) {
    return null;
  }

  if (targetRange.from > sourceRange.from && targetRange.from < sourceRange.to) {
    return null;
  }

  const sourceText = markdown.slice(sourceRange.from, sourceRange.to);
  const withoutSource = markdown.slice(0, sourceRange.from) + markdown.slice(sourceRange.to);
  let insertionPoint = targetRange.to;

  if (sourceRange.from < targetRange.from) {
    insertionPoint -= sourceText.length;
  }

  const nextMarkdown = withoutSource.slice(0, insertionPoint) + sourceText + withoutSource.slice(insertionPoint);
  return {
    markdown: nextMarkdown,
    selectionStart: insertionPoint,
  };
}

function buildLcsMatrix(beforeLines: string[], afterLines: string[]) {
  const matrix = Array.from({ length: beforeLines.length + 1 }, () => Array.from({ length: afterLines.length + 1 }, () => 0));

  for (let beforeIndex = beforeLines.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = afterLines.length - 1; afterIndex >= 0; afterIndex -= 1) {
      matrix[beforeIndex][afterIndex] = beforeLines[beforeIndex] === afterLines[afterIndex]
        ? matrix[beforeIndex + 1][afterIndex + 1] + 1
        : Math.max(matrix[beforeIndex + 1][afterIndex], matrix[beforeIndex][afterIndex + 1]);
    }
  }

  return matrix;
}

function backtrackAlignedRows(beforeLines: string[], afterLines: string[], matrix: number[][]) {
  const rows: Array<{ kind: "same" | "added" | "removed"; beforeText: string; afterText: string }> = [];
  let beforeIndex = 0;
  let afterIndex = 0;

  while (beforeIndex < beforeLines.length && afterIndex < afterLines.length) {
    if (beforeLines[beforeIndex] === afterLines[afterIndex]) {
      rows.push({ kind: "same", beforeText: beforeLines[beforeIndex], afterText: afterLines[afterIndex] });
      beforeIndex += 1;
      afterIndex += 1;
      continue;
    }

    if (matrix[beforeIndex + 1][afterIndex] >= matrix[beforeIndex][afterIndex + 1]) {
      rows.push({ kind: "removed", beforeText: beforeLines[beforeIndex], afterText: "" });
      beforeIndex += 1;
      continue;
    }

    rows.push({ kind: "added", beforeText: "", afterText: afterLines[afterIndex] });
    afterIndex += 1;
  }

  while (beforeIndex < beforeLines.length) {
    rows.push({ kind: "removed", beforeText: beforeLines[beforeIndex], afterText: "" });
    beforeIndex += 1;
  }

  while (afterIndex < afterLines.length) {
    rows.push({ kind: "added", beforeText: "", afterText: afterLines[afterIndex] });
    afterIndex += 1;
  }

  return rows;
}

function findOutlineEntryIndexAtOffset(outline: MarkdownOutlineEntry[], offset: number) {
  for (let index = outline.length - 1; index >= 0; index -= 1) {
    if (outline[index].from <= offset) {
      return index;
    }
  }

  return -1;
}

function decodePathnameSafely(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function encodePathSegments(segments: string[]) {
  return segments.map((segment) => encodeURIComponent(segment)).join("/");
}

function findLineForOffset(lineStarts: number[], offset: number) {
  for (let index = lineStarts.length - 1; index >= 0; index -= 1) {
    if (offset >= lineStarts[index]) {
      return index + 1;
    }
  }

  return 1;
}
