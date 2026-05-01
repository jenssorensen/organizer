import path from "node:path";

export function normalizeRelativeDocsPath(relativePath) {
  if (typeof relativePath !== "string" || !relativePath.trim()) {
    throw new Error("Editable note path is required");
  }

  const segments = relativePath
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    throw new Error("Editable note path is required");
  }

  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("Editable note path contains an invalid path segment");
  }

  return segments.join("/");
}

export function resolveEditableDocPath(docsRootDir, relativePath) {
  const normalizedPath = normalizeRelativeDocsPath(relativePath);

  if (!/\.md$/i.test(normalizedPath)) {
    throw new Error("Editable note path must point to a markdown file");
  }

  const absolutePath = path.resolve(docsRootDir, normalizedPath);
  const normalizedDocsRoot = path.resolve(docsRootDir);
  const insideDocs =
    absolutePath === normalizedDocsRoot || absolutePath.startsWith(`${normalizedDocsRoot}${path.sep}`);

  if (!insideDocs) {
    throw new Error("Editable note path must stay inside data/docs");
  }

  return { absolutePath, normalizedPath };
}

export function hasNoteSaveConflict(currentUpdatedAt, expectedUpdatedAt) {
  return (
    typeof expectedUpdatedAt === "string" &&
    expectedUpdatedAt.trim().length > 0 &&
    currentUpdatedAt !== expectedUpdatedAt
  );
}
