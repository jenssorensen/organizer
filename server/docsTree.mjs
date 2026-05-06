import path from "node:path";
import { readFile, readdir, stat } from "node:fs/promises";

const DEFAULT_SUPPORTED_NOTE_EXTENSIONS = [".md"];

export async function readDocsTree(directoryPath, relativePath = "", notes = [], options = {}) {
  const { readNote = toDocNote, supportedFileExtensions = DEFAULT_SUPPORTED_NOTE_EXTENSIONS } = options;
  const supportedExtensions = toSupportedExtensionSet(supportedFileExtensions);
  let entries = [];

  try {
    entries = await readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if (isIgnorableDocsTreeError(error)) {
      return [];
    }

    throw error;
  }

  const nodes = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const entryPath = path.join(directoryPath, entry.name);
    const entryRelativePath = relativePath ? path.join(relativePath, entry.name) : entry.name;

    if (entry.isDirectory()) {
      const children = await readDocsTree(entryPath, entryRelativePath, notes, options);
      nodes.push({
        id: createDocFolderId(entryRelativePath),
        type: "folder",
        title: humanizeSegment(entry.name),
        sourcePath: entryRelativePath.split(path.sep).join("/"),
        children,
      });
      continue;
    }

    if (!isSupportedNoteFile(entry.name, supportedExtensions)) {
      continue;
    }

    let note = null;

    try {
      note = await readNote(entryPath, entryRelativePath);
    } catch (error) {
      if (isIgnorableDocsTreeError(error)) {
        continue;
      }

      throw error;
    }

    if (!note) {
      continue;
    }

    notes.push(note);
    nodes.push({
      id: note.id,
      type: "note",
      noteId: note.id,
    });
  }

  return nodes;
}

export async function toDocNote(filePath, relativeFilePath) {
  const [content, fileInfo] = await Promise.all([readFile(filePath, "utf8"), stat(filePath)]);
  const relativeDir = path.dirname(relativeFilePath);
  const pathSegments = relativeDir === "." ? [] : relativeDir.split(path.sep).map(humanizeSegment);
  const fileName = path.basename(relativeFilePath, path.extname(relativeFilePath));
  const title = extractMarkdownTitle(content) || humanizeSegment(fileName);
  const summary = extractMarkdownSummary(content) || `Imported from ${pathSegments.join(" / ") || "docs"}`;
  const tags = Array.from(new Set([...pathSegments.map(slugify), slugify(fileName)].filter(Boolean)));

  return {
    id: createDocNoteId(relativeFilePath),
    title,
    summary,
    tags,
    createdAt: fileInfo.birthtime.toISOString(),
    updatedAt: fileInfo.mtime.toISOString(),
    kind: "note",
    content,
    path: pathSegments,
    sourcePath: relativeFilePath.split(path.sep).join("/"),
  };
}

export function isMarkdownFile(fileName) {
  return isSupportedNoteFile(fileName, DEFAULT_SUPPORTED_NOTE_EXTENSIONS);
}

export function isSupportedNoteFile(fileName, supportedFileExtensions = DEFAULT_SUPPORTED_NOTE_EXTENSIONS) {
  const extension = path.extname(fileName).toLowerCase();
  if (!extension) {
    return false;
  }

  const supportedExtensions = toSupportedExtensionSet(supportedFileExtensions);
  return supportedExtensions.has(extension);
}

export function createDocNoteId(relativePath) {
  return `note-${Buffer.from(relativePath).toString("base64url")}`;
}

export function createDocFolderId(relativePath) {
  return `folder-${Buffer.from(relativePath).toString("base64url")}`;
}

function extractMarkdownTitle(content) {
  const headingMatch = content.match(/^#\s+(.+)$/m);
  return headingMatch ? headingMatch[1].trim() : "";
}

function extractMarkdownSummary(content) {
  const body = content
    .replace(/^---[\s\S]*?---\s*/m, "")
    .replace(/^#\s+.+$/gm, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[[^\]]+\]\([^)]+\)/g, "$1")
    .replace(/[*_`>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return body.slice(0, 180).trim();
}

function humanizeSegment(value) {
  return value
    .replace(path.extname(value), "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function isIgnorableDocsTreeError(error) {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
  return code === "ENOENT" || code === "ENOTDIR" || code === "EACCES" || code === "EPERM";
}

function toSupportedExtensionSet(supportedFileExtensions) {
  if (supportedFileExtensions instanceof Set) {
    return supportedFileExtensions;
  }

  const normalized = Array.isArray(supportedFileExtensions)
    ? supportedFileExtensions
      .filter((extension) => typeof extension === "string")
      .map((extension) => extension.trim().toLowerCase())
      .filter(Boolean)
    : DEFAULT_SUPPORTED_NOTE_EXTENSIONS;

  return new Set(normalized.length > 0 ? normalized : DEFAULT_SUPPORTED_NOTE_EXTENSIONS);
}