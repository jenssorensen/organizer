export function replaceBookmarkTree(incomingTree) {
  const tree = normalizeBookmarkTreeRoot(incomingTree.map(sanitizeNode).filter(Boolean));

  return {
    tree,
    imported: countBookmarks(tree),
    duplicatesFiltered: 0,
  };
}

export function normalizeBookmarkTreeRoot(tree) {
  const normalized = [];
  const mergedFolderIndexes = new Map();

  for (const node of tree) {
    if (node?.type === "folder" && isFavoritesBarRoot(node.title)) {
      for (const child of node.children) {
        appendRootNode(normalized, mergedFolderIndexes, child);
      }
      continue;
    }

    appendRootNode(normalized, mergedFolderIndexes, node);
  }

  return normalized;
}

function appendRootNode(normalized, mergedFolderIndexes, node) {
  if (!node) {
    return;
  }

  if (node.type !== "folder") {
    normalized.push(node);
    return;
  }

  const folderKey = node.title.trim().toLowerCase();
  const existingIndex = mergedFolderIndexes.get(folderKey);

  if (existingIndex == null) {
    mergedFolderIndexes.set(folderKey, normalized.length);
    normalized.push(node);
    return;
  }

  const existingNode = normalized[existingIndex];
  if (!existingNode || existingNode.type !== "folder") {
    normalized.push(node);
    return;
  }

  existingNode.children.push(...node.children);
}

function sanitizeNode(node) {
  if (!node || typeof node !== "object") {
    return null;
  }

  if (node.type === "folder") {
    const children = Array.isArray(node.children) ? node.children.map(sanitizeNode).filter(Boolean) : [];

    return {
      id: node.id || createFolderId(node.title || "folder"),
      type: "folder",
      title: node.title || "Untitled folder",
      children,
    };
  }

  if (typeof node.url !== "string" || !node.url.trim()) {
    return null;
  }

  return {
    id: node.id || createBookmarkId(node.url),
    type: "bookmark",
    title: node.title || safeDomain(node.url),
    description: node.description || "",
    url: node.url,
    domain: node.domain || safeDomain(node.url),
    icon: node.icon || node.favicon || createIcon(node.title || node.url),
    tags: Array.isArray(node.tags) ? node.tags : [],
    starred: Boolean(node.starred),
  };
}

function countBookmarks(tree) {
  return tree.reduce((count, node) => {
    if (node.type === "folder") {
      return count + countBookmarks(node.children);
    }
    return count + 1;
  }, 0);
}

function createBookmarkId(url) {
  return `bm-${Buffer.from(url).toString("base64url").slice(0, 10)}`;
}

function createFolderId(title) {
  return `folder-${Buffer.from(title).toString("base64url").slice(0, 10)}`;
}

function safeDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function createIcon(value) {
  return (
    value
      .replace(/^https?:\/\//, "")
      .replace(/[^a-z0-9]/gi, "")
      .slice(0, 2)
      .toUpperCase() || "BM"
  );
}

function isFavoritesBarRoot(title) {
  return typeof title === "string" && title.trim().toLowerCase() === "favorites bar";
}
