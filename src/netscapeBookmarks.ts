import type { BookmarkNode } from "./types";

type StackFolder = {
  title: string;
  children: BookmarkNode[];
};

export function parseNetscapeBookmarkHtml(html: string): BookmarkNode[] {
  const root: StackFolder = { title: "__root__", children: [] };
  const stack: StackFolder[] = [root];
  let pendingFolderTitle: string | null = null;

  for (const rawLine of html.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const folderMatch = /<DT><H3\b[^>]*>(.*?)<\/H3>/i.exec(line);
    if (folderMatch) {
      pendingFolderTitle = decodeHtml(folderMatch[1]).trim() || "Untitled folder";
      continue;
    }

    if (/<DL\b/i.test(line)) {
      if (pendingFolderTitle) {
        const folderNode: StackFolder = {
          title: pendingFolderTitle,
          children: [],
        };
        stack[stack.length - 1]?.children.push({
          id: createNodeId(`folder:${getFolderPathId(stack, pendingFolderTitle)}`),
          type: "folder",
          title: pendingFolderTitle,
          children: folderNode.children,
        });
        stack.push(folderNode);
        pendingFolderTitle = null;
      }
      continue;
    }

    if (/<\/DL>/i.test(line)) {
      if (stack.length > 1) {
        stack.pop();
      }
      pendingFolderTitle = null;
      continue;
    }

    const bookmarkMatch = /<DT><A\b([^>]*)>(.*?)<\/A>/i.exec(line);
    if (!bookmarkMatch) {
      continue;
    }

    const attributes = parseAttributes(bookmarkMatch[1] ?? "");
    const url = attributes.href?.trim();
    if (!url) {
      continue;
    }

    const rawTitle = decodeHtml(bookmarkMatch[2] ?? "").trim();
    const title = rawTitle || safeDomain(url);
    stack[stack.length - 1]?.children.push({
      id: createNodeId(`bookmark:${url}`),
      type: "bookmark",
      title,
      description: "",
      url,
      domain: safeDomain(url),
      icon: attributes.icon?.trim() || createIcon(title || url),
      tags: [],
      starred: false,
    });
  }

  return normalizeImportedRoot(root.children);
}

function parseAttributes(source: string) {
  const attributes: Record<string, string> = {};

  for (const match of source.matchAll(/([a-z_:-]+)\s*=\s*"([^"]*)"/gi)) {
    attributes[match[1]!.toLowerCase()] = decodeHtml(match[2] ?? "");
  }

  return attributes;
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function getFolderPathId(stack: StackFolder[], title: string) {
  return [...stack.slice(1).map((folder) => folder.title), title].join("/");
}

function createNodeId(value: string) {
  let hash = 0;

  for (const character of value) {
    hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  }

  return `node-${hash.toString(36)}`;
}

function safeDomain(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function createIcon(value: string) {
  return (
    value
      .replace(/^https?:\/\//, "")
      .replace(/[^a-z0-9]/gi, "")
      .slice(0, 2)
      .toUpperCase() || "BM"
  );
}

function normalizeImportedRoot(nodes: BookmarkNode[]) {
  if (nodes.length === 1 && nodes[0]?.type === "folder" && isFavoritesBarRoot(nodes[0].title)) {
    return nodes[0].children;
  }

  return nodes;
}

function isFavoritesBarRoot(title: string) {
  return title.trim().toLowerCase() === "favorites bar";
}
