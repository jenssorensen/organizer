import { createServer } from "node:http";
import { watch } from "node:fs";
import { copyFile, cp, mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec, execFile } from "node:child_process";
import trash from "trash";
import { normalizeBookmarkTreeRoot, replaceBookmarkTree } from "./bookmarkImport.mjs";
import { createDocsFolder, createMarkdownDoc, ensureGettingStartedDoc, renameMarkdownDoc } from "./docCreation.mjs";
import { createDocFolderId, isMarkdownFile, readDocsTree, toDocNote } from "./docsTree.mjs";
import { pickFolders } from "./folderPicker.mjs";
import { hasNoteSaveConflict, normalizeRelativeDocsPath, resolveEditableDocPath } from "./notePersistence.mjs";
import { sanitizeRecentDocumentsPayload } from "./recentDocuments.mjs";
import { isPickerRequestMethod } from "./requestMethods.mjs";
import { MAX_RESTORE_POINTS, sanitizeRestorePointNotesPayload, sanitizeRestorePointSnapshot, toRestorePointSummary } from "./restorePoints.mjs";
import { sanitizeTodoPayload } from "./todoItems.mjs";
import {
  mergeStarredNotes,
  sanitizeStarredNotesPayload,
  toStarredNotesMap,
  toggleStarredNote,
} from "./starredNotes.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const configPath = path.join(rootDir, ".organizer-config.json");
const distDir = path.join(rootDir, "dist");
const DATA_DIR_NAME = ".organizer-data";
const TODO_DIR_NAME = "todo";
let dataDir = null;
let todosDir = null;
let sidebarOrderPath = null;
let bookmarksPath = null;
let recentDocumentsPath = null;
let starredNotesPath = null;
let todoItemsPath = null;
let docsSourcePath = null;
let trashMetaPath = null;
let workspacesPath = null;
let restorePointsDir = null;
let docsDir = null;
let trashDir = null;
let additionalDocsDirs = [];
let hasDocsSource = false;
let isMetaDataReady = false;
const defaultOrder = ["notes", "bookmarks", "todo", "starred", "recent"];
const defaultBookmarkTree = [];
const SUPPORTED_NOTE_FILE_TYPES = new Set([".md", ".html", ".mhtml", ".txt"]);
const DEFAULT_SUPPORTED_NOTE_FILE_TYPES = [".md"];
const port = Number(process.env.PORT || 3532);
const sseClients = new Set();
const pendingChangeTimers = new Map();
const docsDirectoryWatchers = new Map();
let dataDirectoryWatcher = null;
let todosDirectoryWatcher = null;
let docsWatcherSyncTimer = null;
let nextEventId = 0;

function logPickerRoute(route, request) {
  console.info(`[picker] ${route} request`, {
    method: request.method,
    origin: request.headers.origin ?? "",
    referer: request.headers.referer ?? "",
    userAgent: request.headers["user-agent"] ?? "",
  });
}

function applyDataDir(dir) {
  dataDir = dir;
  sidebarOrderPath = path.join(dataDir, "sidebar-order.json");
  bookmarksPath = path.join(dataDir, "bookmarks.json");
  recentDocumentsPath = path.join(dataDir, "recent-documents.json");
  starredNotesPath = path.join(dataDir, "starred-notes.json");
  docsSourcePath = path.join(dataDir, "docs-source.json");
  trashMetaPath = path.join(dataDir, "trash.json");
  workspacesPath = path.join(dataDir, "workspaces.json");
  restorePointsDir = path.join(dataDir, "restore-points");
  docsDir = path.join(dataDir, "docs");
  trashDir = path.join(dataDir, "trash");
}

function getDefaultDataDir() {
  return path.join(rootDir, DATA_DIR_NAME);
}

function getDataDirForDocsPath(docsPath) {
  return path.join(path.resolve(docsPath), DATA_DIR_NAME);
}

function getTodosDirForDataDir(dir) {
  return path.join(path.dirname(dir), TODO_DIR_NAME);
}

function applyTodosDir() {
  todosDir = dataDir ? getTodosDirForDataDir(dataDir) : null;
  todoItemsPath = todosDir ? path.join(todosDir, "todo-items.json") : null;
}

function stopStorageDirectoryWatchers() {
  if (dataDirectoryWatcher) {
    dataDirectoryWatcher.close();
    dataDirectoryWatcher = null;
  }

  if (todosDirectoryWatcher) {
    todosDirectoryWatcher.close();
    todosDirectoryWatcher = null;
  }
}

/**
 * Move a file or directory, falling back to copy+delete when rename fails
 * with EXDEV (source and target are on different drives/filesystems).
 */
async function moveItem(sourcePath, targetPath) {
  try {
    await rename(sourcePath, targetPath);
  } catch (error) {
    if (!error || error.code !== "EXDEV") throw error;
    const info = await stat(sourcePath);
    if (info.isDirectory()) {
      await cp(sourcePath, targetPath, { recursive: true });
      await rm(sourcePath, { recursive: true, force: true });
    } else {
      await copyFile(sourcePath, targetPath);
      await unlink(sourcePath);
    }
  }
}

async function moveIfTargetMissing(sourcePath, targetPath) {
  try {
    await stat(sourcePath);
  } catch {
    return;
  }

  try {
    await stat(targetPath);
    return;
  } catch {
    // Target does not exist yet.
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await moveItem(sourcePath, targetPath);
}

async function relocateDataStorage(previousDataDir, previousTodosDir, nextDataDir) {
  if (previousDataDir && previousDataDir !== nextDataDir) {
    const metadataFiles = [
      "sidebar-order.json",
      "bookmarks.json",
      "recent-documents.json",
      "starred-notes.json",
      "docs-source.json",
      "trash.json",
      "workspaces.json",
    ];

    for (const fileName of metadataFiles) {
      await moveIfTargetMissing(path.join(previousDataDir, fileName), path.join(nextDataDir, fileName));
    }

    await moveIfTargetMissing(path.join(previousDataDir, "trash"), path.join(nextDataDir, "trash"));
  }

  const nextTodosDir = getTodosDirForDataDir(nextDataDir);
  if (previousTodosDir && previousTodosDir !== nextTodosDir) {
    await moveIfTargetMissing(previousTodosDir, nextTodosDir);
  }
}

async function loadConfigAndInit() {
  let configured = false;
  try {
    const raw = await readFile(configPath, "utf8");
    const config = JSON.parse(raw);
    if (typeof config.metaDataPath === "string" && config.metaDataPath.trim()) {
      let resolved = path.resolve(config.metaDataPath);

      // Migrate organizer_meta_data → .data
      if (path.basename(resolved) === "organizer_meta_data") {
        const migrated = path.join(path.dirname(resolved), ".data");
        try {
          await stat(resolved);
          try { await stat(migrated); } catch {
            await moveItem(resolved, migrated);
          }
          resolved = migrated;
          await writeFile(configPath, JSON.stringify({ metaDataPath: resolved }, null, 2), "utf8");
        } catch {
          // Old dir doesn't exist, just update config path
          resolved = migrated;
          await writeFile(configPath, JSON.stringify({ metaDataPath: resolved }, null, 2), "utf8");
        }
      }

      // Migrate old todos dir name
      const oldTodosDir = path.join(path.dirname(resolved), "todos");
      const newTodoDir = path.join(path.dirname(resolved), "todo");
      try {
        await stat(oldTodosDir);
        try { await stat(newTodoDir); } catch {
          await moveItem(oldTodosDir, newTodoDir);
        }
      } catch {
        // No old todos dir to migrate
      }

      applyDataDir(resolved);
      configured = true;
    }
  } catch {
    // No config yet — use default path
  }
  if (!configured) {
    const defaultDataDir = getDefaultDataDir();
    applyDataDir(defaultDataDir);
    await writeFile(configPath, JSON.stringify({ metaDataPath: defaultDataDir }, null, 2), "utf8");
  }
  await initializeData();
  isMetaDataReady = true;
}

async function initializeData() {
  await mkdir(dataDir, { recursive: true });
  await ensureSidebarOrderFile();
  await ensureBookmarksFile();
  await ensureRecentDocumentsFile();
  await ensureStarredNotesFile();
  await loadDocsSource();
  if (hasDocsSource) {
    const configuredDocsDir = docsDir;
    const configuredAdditionalDocsDirs = [...additionalDocsDirs];
    const desiredDataDir = getDataDirForDocsPath(configuredDocsDir);

    if (dataDir !== desiredDataDir) {
      const previousDataDir = dataDir;
      const previousTodosDir = todosDir;
      stopStorageDirectoryWatchers();
      await relocateDataStorage(previousDataDir, previousTodosDir, desiredDataDir);
      applyDataDir(desiredDataDir);
      await writeFile(configPath, JSON.stringify({ metaDataPath: desiredDataDir }, null, 2), "utf8");
      await mkdir(dataDir, { recursive: true });
      await ensureSidebarOrderFile();
      await ensureBookmarksFile();
      await ensureRecentDocumentsFile();
      await ensureStarredNotesFile();
      docsDir = configuredDocsDir;
      additionalDocsDirs = configuredAdditionalDocsDirs;
      hasDocsSource = true;
      await writeFile(docsSourcePath, JSON.stringify({ path: configuredDocsDir, additionalPaths: configuredAdditionalDocsDirs }, null, 2), "utf8");
    }

    applyTodosDir();
    await mkdir(todosDir, { recursive: true });
    await migrateOldDataLayout();
    await ensureTodoItemsFile();
  }
  await ensureDocsDirectory();
  await mkdir(trashDir, { recursive: true });
  await ensureTrashMetaFile();
  await ensureWorkspacesFile();
  await syncDocsDirectoryWatchers();
  startDataDirectoryWatcher();
}

/**
 * Migrate from the old flat layout where todo-items.json lived alongside
 * other metadata files in dataDir, to the new split layout where todos
 * are stored in a sibling .todos/ directory.
 *
 * Metadata files stay in dataDir (unchanged). Only todo-items.json moves.
 */
async function migrateOldDataLayout() {
  // Check if old todo-items.json exists in the metadata directory
  const oldTodoPath = path.join(dataDir, "todo-items.json");
  try {
    await stat(oldTodoPath);
  } catch {
    // No old todo file in dataDir, nothing to migrate
    return;
  }

  console.log("[migration] Detected old todo-items.json in metadata dir, migrating to todos/...");

  try {
    await stat(todoItemsPath);
    console.log("[migration] Skipping todo-items.json (already exists in todos/)");
  } catch {
    await moveItem(oldTodoPath, todoItemsPath);
    console.log("[migration] Moved todo-items.json -> todos/");
  }

  console.log("[migration] Migration complete.");
}

await loadConfigAndInit();

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);

  if (url.pathname === "/api/meta-data-path") {
    await handleMetaDataPath(request, response);
    return;
  }

  if (url.pathname === "/api/meta-data-path/pick") {
    await handleMetaDataPathPick(request, response);
    return;
  }

  // All other API routes require meta data to be configured
  if (url.pathname.startsWith("/api/") && !isMetaDataReady) {
    setCorsHeaders(response);
    if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
    response.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Server is still initializing" }));
    return;
  }

  if (url.pathname.startsWith("/api/sidebar-order")) {
    await handleSidebarOrder(request, response);
    return;
  }

  if (url.pathname === "/api/bookmarks") {
    await handleBookmarks(request, response);
    return;
  }

  if (url.pathname === "/api/bookmarks/import") {
    await handleBookmarkImport(request, response);
    return;
  }

  if (url.pathname === "/api/notes") {
    await handleNotes(request, response);
    return;
  }

  if (url.pathname === "/api/notes/import") {
    await handleNoteImport(request, response);
    return;
  }

  if (url.pathname === "/api/notes/star") {
    await handleNoteStar(request, response);
    return;
  }

  if (url.pathname === "/api/recent-documents") {
    await handleRecentDocuments(request, response);
    return;
  }

  if (url.pathname === "/api/restore-points") {
    await handleRestorePoints(request, response);
    return;
  }

  if (url.pathname === "/api/restore-points/restore") {
    await handleRestorePointRestore(request, response);
    return;
  }

  if (url.pathname === "/api/todo-items") {
    await handleTodoItems(request, response);
    return;
  }

  if (url.pathname === "/api/todo-items/storage-path") {
    setCorsHeaders(response);
    if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ path: todosDir ?? null }));
    return;
  }

  if (url.pathname === "/api/open-folder") {
    await handleOpenFolder(request, response);
    return;
  }

  if (url.pathname === "/api/docs/file") {
    await handleDocsFile(url, request, response);
    return;
  }

  if (url.pathname === "/api/docs/upload") {
    await handleDocsUpload(request, response);
    return;
  }

  if (url.pathname === "/api/docs/create") {
    await handleDocsCreate(request, response);
    return;
  }

  if (url.pathname === "/api/docs/create-folder") {
    await handleDocsCreateFolder(request, response);
    return;
  }

  if (url.pathname === "/api/docs/rename") {
    await handleDocsRename(request, response);
    return;
  }

  if (url.pathname === "/api/docs/move") {
    await handleDocsMove(request, response);
    return;
  }

  if (url.pathname === "/api/docs/source") {
    await handleDocsSource(request, response);
    return;
  }

  if (url.pathname === "/api/docs/pick-folder") {
    await handleDocsPickFolder(request, response);
    return;
  }

  if (url.pathname === "/api/docs/import-folder") {
    await handleDocsImportFolder(request, response);
    return;
  }

  if (url.pathname === "/api/docs/remove-folder") {
    await handleDocsRemoveFolder(request, response);
    return;
  }

  if (url.pathname === "/api/docs/daily") {
    await handleDailyNote(request, response);
    return;
  }

  if (url.pathname === "/api/docs/trash") {
    await handleDocsTrash(url, request, response);
    return;
  }

  if (url.pathname === "/api/docs/trash/restore") {
    await handleDocsTrashRestore(request, response);
    return;
  }

  if (url.pathname === "/api/docs/trash/purge") {
    await handleDocsTrashPurge(request, response);
    return;
  }

  if (url.pathname === "/api/docs/search") {
    await handleDocsSearch(url, request, response);
    return;
  }

  if (url.pathname === "/api/workspaces") {
    await handleWorkspaces(request, response);
    return;
  }

  if (url.pathname === "/api/events") {
    await handleEvents(request, response);
    return;
  }

  if (url.pathname === "/api/unfurl") {
    await handleUnfurl(url, request, response);
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    setCorsHeaders(response);
    response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "API route not found" }));
    return;
  }

  await serveStatic(url.pathname, response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Organizer server listening on http://127.0.0.1:${port}`);
});

server.on("error", (error) => {
  if (error && typeof error === "object" && "code" in error && error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use on 127.0.0.1.`);
    process.exit(1);
    return;
  }

  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});

async function handleMetaDataPath(request, response) {
  setCorsHeaders(response);
  if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }

  if (request.method === "GET") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ path: dataDir, configured: isMetaDataReady }));
    return;
  }

  if (request.method === "POST") {
    try {
      const body = JSON.parse(await readRequestBody(request));
      const metaPath = typeof body.path === "string" ? body.path.trim() : "";
      if (!metaPath) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Path is required" }));
        return;
      }
      const resolved = path.resolve(metaPath);
      await mkdir(resolved, { recursive: true });
      const info = await stat(resolved);
      if (!info.isDirectory()) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Path is not a directory" }));
        return;
      }
      await writeFile(configPath, JSON.stringify({ metaDataPath: resolved }, null, 2), "utf8");
      applyDataDir(resolved);
      await initializeData();
      isMetaDataReady = true;
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ path: resolved, configured: true }));
    } catch (error) {
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Failed to set meta data path" }));
    }
    return;
  }

  if (request.method === "DELETE") {
    try {
      if (!dataDir) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "No metadata path configured" }));
        return;
      }
      // Stop watchers
      stopStorageDirectoryWatchers();
      for (const [, w] of docsDirectoryWatchers) { w.close(); }
      docsDirectoryWatchers.clear();

      // Remove metadata and todo directories
      await rm(dataDir, { recursive: true, force: true });
      if (todosDir) await rm(todosDir, { recursive: true, force: true });

      // Remove config file
      try { await unlink(configPath); } catch { /* ignore */ }

      // Reset state
      dataDir = null;
      todosDir = null;
      todoItemsPath = null;
      hasDocsSource = false;
      docsDir = null;
      additionalDocsDirs = [];

      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ cleared: true }));
    } catch (error) {
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Failed to clear metadata" }));
    }
    return;
  }

  response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "Method not allowed" }));
}

async function handleMetaDataPathPick(request, response) {
  setCorsHeaders(response);
  if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
  logPickerRoute("/api/meta-data-path/pick", request);

  if (isPickerRequestMethod(request.method)) {
    try {
      const [folderPath] = await pickFolders({
        prompt: "Select folder for organizer metadata",
      });

      const metaDataDir = path.join(folderPath, ".data");
      await mkdir(metaDataDir, { recursive: true });
      await writeFile(configPath, JSON.stringify({ metaDataPath: metaDataDir }, null, 2), "utf8");
      applyDataDir(metaDataDir);
      await initializeData();
      isMetaDataReady = true;
      console.info("[picker] /api/meta-data-path/pick configured metadata path", { metaDataDir });
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ path: metaDataDir, configured: true }));
    } catch (error) {
      console.error("[picker] /api/meta-data-path/pick failed", {
        method: request.method,
        error: error instanceof Error ? error.message : String(error),
      });
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Folder selection failed" }));
    }
    return;
  }

  console.warn("[picker] /api/meta-data-path/pick rejected request method", { method: request.method });
  response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "Method not allowed" }));
}

async function handleSidebarOrder(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "GET") {
    try {
      await ensureSidebarOrderFile();
      const fileContents = await readFile(sidebarOrderPath, "utf8");
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(fileContents);
      return;
    } catch {
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Failed to load sidebar order" }));
      return;
    }
  }

  if (request.method === "POST") {
    try {
      await ensureSidebarOrderFile();
      const body = await readRequestBody(request);
      const parsed = JSON.parse(body);

      if (!isValidOrder(parsed.order)) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Invalid sidebar order" }));
        return;
      }

      const payload = JSON.stringify({ order: parsed.order }, null, 2);
      await writeFile(sidebarOrderPath, `${payload}\n`, "utf8");
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(payload);
      return;
    } catch {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Invalid JSON payload" }));
      return;
    }
  }

  response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "Method not allowed" }));
}

async function handleBookmarks(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "GET") {
    try {
      const tree = await readBookmarksTree();
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(
        JSON.stringify(
          {
            tree,
            bookmarks: flattenBookmarkTree(tree),
          },
          null,
          2,
        ),
      );
    } catch {
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Failed to load bookmarks" }));
    }
    return;
  }

  if (request.method === "POST") {
    try {
      const body = await readRequestBody(request);
      const parsed = JSON.parse(body);

      if (!Array.isArray(parsed.tree)) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Invalid bookmark tree payload" }));
        return;
      }

      await writeBookmarksTree(parsed.tree);
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(
        JSON.stringify({
          tree: parsed.tree,
          bookmarks: flattenBookmarkTree(parsed.tree),
        }),
      );
      return;
    } catch {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Invalid JSON payload" }));
      return;
    }
  }

  if (request.method !== "GET") {
    response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }
}

async function handleBookmarkImport(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "POST") {
    response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const body = await readRequestBody(request);
    const parsed = JSON.parse(body);

    if (!Array.isArray(parsed.tree)) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Invalid bookmark payload" }));
      return;
    }

    const replaced = replaceBookmarkTree(parsed.tree);
    await writeBookmarksTree(replaced.tree);

    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(
      JSON.stringify({
        tree: replaced.tree,
        bookmarks: flattenBookmarkTree(replaced.tree),
        imported: replaced.imported,
        duplicatesFiltered: replaced.duplicatesFiltered,
      }),
    );
  } catch {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Invalid JSON payload" }));
  }
}

async function handleNotes(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "GET") {
    try {
      const requestUrl = new URL(request.url, "http://127.0.0.1");
      const supportedNoteFileTypes = sanitizeSupportedNoteFileTypes(requestUrl.searchParams.get("supportedExtensions"));
      const notes = await readNotesCollection({ supportedNoteFileTypes });
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(notes, null, 2));
    } catch {
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Failed to load notes" }));
    }
    return;
  }

  if (request.method === "POST") {
    try {
      const body = await readRequestBody(request);
      const parsed = JSON.parse(body);

      if (typeof parsed.content !== "string") {
        throw new Error("Note content must be a string");
      }

      const { absolutePath, normalizedPath } = resolveEditableDocPath(docsDir, parsed.sourcePath);
      const fileInfo = await stat(absolutePath);

      if (!fileInfo.isFile()) {
        throw new Error("Editable note path must reference a file");
      }

      const currentStarredNotes = await readStarredNotes();
      const currentStarredMap = toStarredNotesMap(currentStarredNotes.entries);
      const currentNote = {
        ...(await toDocNote(absolutePath, normalizedPath)),
        starred: Boolean(currentStarredMap.get(normalizedPath)),
      };

      if (hasNoteSaveConflict(currentNote.updatedAt, parsed.expectedUpdatedAt)) {
        response.writeHead(409, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({
          error: "Note changed on another device. Server version kept.",
          conflict: true,
          note: currentNote,
        }, null, 2));
        return;
      }

      await writeFile(absolutePath, parsed.content, "utf8");

      const starredNotes = await readStarredNotes();
      const starredMap = toStarredNotesMap(starredNotes.entries);
      const note = {
        ...(await toDocNote(absolutePath, normalizedPath)),
        starred: Boolean(starredMap.get(normalizedPath)),
      };
      scheduleDataChange("notes");
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ note }, null, 2));
    } catch (error) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Invalid note payload",
        }),
      );
    }
    return;
  }

  response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "Method not allowed" }));
}

async function handleNoteStar(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "POST") {
    response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const body = await readRequestBody(request);
    const parsed = JSON.parse(body);

    if (typeof parsed.starred !== "boolean") {
      throw new Error("Starred state must be a boolean");
    }

    const normalizedPath = normalizeRelativeDocsPath(parsed.sourcePath);
    const absolutePath = resolveNoteAbsolutePath(normalizedPath);
    const fileInfo = await stat(absolutePath);
    if (!fileInfo.isFile()) {
      throw new Error("Starred note path must reference a file");
    }

    const currentPayload = await readStarredNotes();
    const entries = toggleStarredNote(currentPayload.entries, normalizedPath, parsed.starred);
    await writeStarredNotes({ entries });
    scheduleDataChange("notes");

    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ sourcePath: normalizedPath, starred: parsed.starred }, null, 2));
  } catch (error) {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Invalid note star payload",
      }),
    );
  }
}

async function handleNoteImport(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "POST") {
    response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const body = await readRequestBody(request);
    const payload = sanitizeRestorePointNotesPayload(JSON.parse(body));

    for (const note of payload.notes) {
      const normalizedPath = normalizeRelativeDocsPath(note.sourcePath);
      const absolutePath = resolveNoteAbsolutePath(normalizedPath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, note.content, "utf8");
    }

    if (payload.starredNotePaths.length > 0) {
      await writeStarredNotes({ entries: payload.starredNotePaths });
    }

    scheduleDataChange("notes");
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ imported: payload.notes.length }, null, 2));
  } catch (error) {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Invalid notes snapshot payload" }));
  }
}

async function handleRecentDocuments(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "GET") {
    const payload = await readRecentDocuments();
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(payload, null, 2));
    return;
  }

  if (request.method === "POST") {
    try {
      const body = await readRequestBody(request);
      const parsed = JSON.parse(body);
      const payload = sanitizeRecentDocumentsPayload(parsed);
      await writeRecentDocuments(payload);
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(payload, null, 2));
      return;
    } catch {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Invalid recent documents payload" }));
      return;
    }
  }

  response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "Method not allowed" }));
}

async function handleRestorePoints(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "GET") {
    try {
      const records = await listRestorePointRecords();
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ entries: records.map((record) => record.summary) }, null, 2));
      return;
    } catch {
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Failed to load restore points" }));
      return;
    }
  }

  if (request.method === "POST") {
    try {
      const body = await readRequestBody(request);
      const snapshot = sanitizeRestorePointSnapshot(JSON.parse(body));
      const summary = await persistRestorePoint(snapshot);
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ summary }, null, 2));
      return;
    } catch {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Invalid restore point snapshot" }));
      return;
    }
  }

  response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "Method not allowed" }));
}

async function handleRestorePointRestore(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "POST") {
    response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const body = await readRequestBody(request);
    const parsed = JSON.parse(body);
    const restorePointId = typeof parsed.id === "string" ? parsed.id.trim() : "";
    if (!restorePointId) {
      throw new Error("Missing restore point id");
    }

    const record = await readRestorePointRecord(`${restorePointId}.json`);
    await applyRestorePointSnapshot(record.snapshot);
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ snapshot: record.snapshot }, null, 2));
  } catch {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Failed to restore restore point" }));
  }
}

async function handleTodoItems(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (!todoItemsPath) {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ items: [], viewMode: "list", selectedTodoId: null }));
    return;
  }

  if (request.method === "GET") {
    const payload = await readTodoItems();
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(payload, null, 2));
    return;
  }

  if (request.method === "POST") {
    try {
      const body = await readRequestBody(request);
      const parsed = JSON.parse(body);
      const payload = sanitizeTodoPayload(parsed);
      await writeTodoItems(payload);
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(payload, null, 2));
      return;
    } catch {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Invalid todo payload" }));
      return;
    }
  }

  response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "Method not allowed" }));
}

async function handleOpenFolder(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "POST") {
    response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const body = await readRequestBody(request);
    const { folderPath, path: requestedPath, sourcePath } = JSON.parse(body);

    let resolvedFolderPath = "";

    if (typeof folderPath === "string" && folderPath.trim()) {
      resolvedFolderPath = folderPath;
    } else if (typeof requestedPath === "string" && requestedPath.trim()) {
      resolvedFolderPath = requestedPath;
    } else if (typeof sourcePath === "string") {
      resolvedFolderPath = resolveNoteFolderAbsolutePath(sourcePath);
    }

    if (!resolvedFolderPath) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Missing folderPath or sourcePath" }));
      return;
    }

    // Validate the path exists and is a directory
    const folderStat = await stat(resolvedFolderPath);
    if (!folderStat.isDirectory()) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Path is not a directory" }));
      return;
    }

    openFolderInFileManager(resolvedFolderPath, (err) => {
      if (err) {
        console.warn(`[open-folder] Failed to open folder: ${err.message}`);
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Failed to open folder" }));
        return;
      }

      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: true }));
    });
  } catch (err) {
    response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Failed to open folder" }));
  }
}

function openFolderInFileManager(folderPath, callback) {
  if (process.platform === "win32") {
    execFile("explorer.exe", ["/e,", `/root,${folderPath}`], callback);
    return;
  }

  const command = process.platform === "darwin" ? "open" : "xdg-open";
  execFile(command, [folderPath], callback);
}

function resolveNoteFolderAbsolutePath(sourcePath) {
  if (!docsDir) {
    throw new Error("Docs folder is not configured");
  }

  const trimmedPath = sourcePath.trim();
  if (!trimmedPath) {
    return docsDir;
  }

  const normalizedPath = normalizeRelativeDocsPath(trimmedPath);
  const importedPrefix = "__imported__/";

  if (normalizedPath.startsWith(importedPrefix)) {
    const rest = normalizedPath.slice(importedPrefix.length);
    const slashIndex = rest.indexOf("/");
    const folderName = slashIndex === -1 ? rest : rest.slice(0, slashIndex);
    const innerPath = slashIndex === -1 ? "" : rest.slice(slashIndex + 1);
    const matchingDir = additionalDocsDirs.find((dirPath) => path.basename(dirPath) === folderName);

    if (!matchingDir) {
      throw new Error(`Imported folder "${folderName}" is not registered`);
    }

    const absolutePath = innerPath ? path.resolve(matchingDir, innerPath) : path.resolve(matchingDir);
    const normalizedDir = path.resolve(matchingDir);
    const insideDir = absolutePath === normalizedDir || absolutePath.startsWith(`${normalizedDir}${path.sep}`);

    if (!insideDir) {
      throw new Error("Folder path must stay inside the imported folder");
    }

    return absolutePath;
  }

  return resolveDocsTargetPath(normalizedPath).absolutePath;
}

async function handleDocsFile(url, request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "GET") {
    response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const relativePath = url.searchParams.get("path");
    if (!relativePath) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Path query parameter is required" }));
      return;
    }

    const absolutePath = resolveNoteAssetAbsolutePath(relativePath);
    const fileInfo = await stat(absolutePath);

    if (!fileInfo.isFile()) {
      response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Not a file" }));
      return;
    }

    const contents = await readFile(absolutePath);
    const contentType = getContentType(absolutePath);
    response.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": contents.length,
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": getContentDisposition(absolutePath, contentType),
      "Content-Security-Policy": "sandbox allow-downloads; default-src 'self' data: blob: https: http:; script-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(contents);
  } catch (error) {
    response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    response.end(
      JSON.stringify({ error: error instanceof Error ? error.message : "File not found" }),
    );
  }
}

async function handleDocsUpload(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "POST") {
    response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const body = await readRequestBody(request);
    const parsed = JSON.parse(body);
    const uploadResult = await saveUploadedDocs(parsed.targetPath, parsed.files);

    scheduleDataChange("notes");
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(uploadResult, null, 2));
  } catch (error) {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Invalid upload payload",
      }),
    );
  }
}

async function handleDocsCreate(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "POST") {
    response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const body = await readRequestBody(request);
    const parsed = JSON.parse(body);
    const created = await createMarkdownDoc(docsDir, parsed.targetPath, parsed.fileName);
    const note = await toDocNote(path.join(docsDir, created.sourcePath), created.sourcePath);

    scheduleDataChange("notes");
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ...created, note }, null, 2));
  } catch (error) {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Invalid document payload",
      }),
    );
  }
}

async function handleDocsCreateFolder(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "POST") {
    response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const body = await readRequestBody(request);
    const parsed = JSON.parse(body);
    const created = await createDocsFolder(docsDir, parsed.targetPath, parsed.folderName);

    scheduleDataChange("notes");
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(created, null, 2));
  } catch (error) {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Invalid folder payload",
      }),
    );
  }
}

async function handleDocsRename(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "POST") {
    response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const body = await readRequestBody(request);
    const parsed = JSON.parse(body);
    const renamed = await renameMarkdownDoc(docsDir, parsed.sourcePath, parsed.fileName);

    scheduleDataChange("notes");
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(renamed, null, 2));
  } catch (error) {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to rename document",
      }),
    );
  }
}

async function handleDocsMove(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "POST") {
    response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const body = await readRequestBody(request);
    const parsed = JSON.parse(body);

    const { absolutePath: sourceAbsPath } = resolveEditableDocPath(docsDir, parsed.sourcePath);
    const sourceInfo = await stat(sourceAbsPath);
    if (!sourceInfo.isFile()) {
      throw new Error("Source must be a file");
    }

    const fileName = path.basename(sourceAbsPath);
    let targetAbsFolder;
    const normalizedDocsRoot = path.resolve(docsDir);

    if (!parsed.targetFolderPath || parsed.targetFolderPath === "") {
      targetAbsFolder = normalizedDocsRoot;
    } else {
      const normalizedTarget = normalizeRelativeDocsPath(parsed.targetFolderPath);
      targetAbsFolder = path.resolve(docsDir, normalizedTarget);
      const insideDocs =
        targetAbsFolder === normalizedDocsRoot ||
        targetAbsFolder.startsWith(`${normalizedDocsRoot}${path.sep}`);
      if (!insideDocs) {
        throw new Error("Target folder must stay inside data/docs");
      }
    }

    const targetAbsPath = path.join(targetAbsFolder, fileName);
    const newSourcePath = path.relative(docsDir, targetAbsPath).split(path.sep).join("/");

    if (sourceAbsPath === targetAbsPath) {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ sourcePath: newSourcePath }));
      return;
    }

    try {
      await stat(targetAbsPath);
      throw new Error(`A file named "${fileName}" already exists in the target folder`);
    } catch (checkError) {
      if (
        !(checkError instanceof Error) ||
        !("code" in checkError) ||
        checkError.code !== "ENOENT"
      ) {
        throw checkError;
      }
    }

    await moveItem(sourceAbsPath, targetAbsPath);
    scheduleDataChange("notes");

    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ sourcePath: newSourcePath }));
  } catch (error) {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to move document",
      }),
    );
  }
}

async function handleDocsPickFolder(request, response) {
  setCorsHeaders(response);
  logPickerRoute("/api/docs/pick-folder", request);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (isPickerRequestMethod(request.method)) {
    try {
      const [folderPath] = await pickFolders({
        prompt: "Select your documents folder",
      });

      console.info("[picker] /api/docs/pick-folder selected folder", { folderPath });
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ path: folderPath }));
    } catch (error) {
      console.error("[picker] /api/docs/pick-folder failed", {
        method: request.method,
        error: error instanceof Error ? error.message : String(error),
      });
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(
        JSON.stringify({ error: error instanceof Error ? error.message : "Folder selection failed" }),
      );
    }
    return;
  }

  console.warn("[picker] /api/docs/pick-folder rejected request method", { method: request.method });
  response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "Method not allowed" }));
}

async function handleDocsSource(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "GET") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ path: docsDir, additionalPaths: additionalDocsDirs }));
    return;
  }

  if (request.method === "POST") {
    try {
      const body = await readRequestBody(request);
      const parsed = JSON.parse(body);

      if (typeof parsed.path !== "string" || !parsed.path.trim()) {
        throw new Error("path must be a non-empty string");
      }

      const resolvedPath = path.resolve(parsed.path);
      const info = await stat(resolvedPath);

      if (!info.isDirectory()) {
        throw new Error("path must be an existing directory");
      }

      const nextDataDir = getDataDirForDocsPath(resolvedPath);
      const previousDataDir = dataDir;
      const previousTodosDir = todosDir;

      stopStorageDirectoryWatchers();
      await relocateDataStorage(previousDataDir, previousTodosDir, nextDataDir);
      applyDataDir(nextDataDir);
      applyTodosDir();
      await writeFile(configPath, JSON.stringify({ metaDataPath: nextDataDir }, null, 2), "utf8");
      await mkdir(dataDir, { recursive: true });
      await ensureSidebarOrderFile();
      await ensureBookmarksFile();
      await ensureRecentDocumentsFile();
      await ensureStarredNotesFile();
      docsDir = resolvedPath;
      hasDocsSource = true;
      applyTodosDir();
      await mkdir(todosDir, { recursive: true });
      await ensureTodoItemsFile();
      await mkdir(trashDir, { recursive: true });
      await ensureTrashMetaFile();
      await ensureWorkspacesFile();
      await ensureGettingStartedDoc(resolvedPath);
      await writeFile(docsSourcePath, JSON.stringify({ path: resolvedPath, additionalPaths: additionalDocsDirs }, null, 2), "utf8");
      isMetaDataReady = true;

      // Reset starred notes and recent documents for the new folder
      await writeFile(starredNotesPath, JSON.stringify({ entries: [] }, null, 2), "utf8");
      await writeFile(recentDocumentsPath, JSON.stringify({ entries: [] }, null, 2), "utf8");

      // Tear down old watchers, set up new ones
      for (const [, watcher] of docsDirectoryWatchers) {
        watcher.close();
      }
      docsDirectoryWatchers.clear();
      await syncDocsDirectoryWatchers();
      startDataDirectoryWatcher();
      scheduleDataChange("notes");

      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ path: resolvedPath }));
    } catch (error) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(
        JSON.stringify({ error: error instanceof Error ? error.message : "Invalid docs source payload" }),
      );
    }
    return;
  }

  response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "Method not allowed" }));
}

async function handleDocsImportFolder(request, response) {
  setCorsHeaders(response);
  logPickerRoute("/api/docs/import-folder", request);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (isPickerRequestMethod(request.method)) {
    try {
      const selectedPaths = await pickFolders({
        prompt: "Select folders to import notes from",
        multiple: true,
      });
      if (selectedPaths.length === 0) {
        throw new Error("No folders selected");
      }

      const added = [];
      for (const selectedPath of selectedPaths) {
        const resolvedPath = path.resolve(selectedPath);
        const info = await stat(resolvedPath);
        if (!info.isDirectory()) continue;
        if (resolvedPath === path.resolve(docsDir)) continue;
        if (additionalDocsDirs.includes(resolvedPath)) continue;
        additionalDocsDirs.push(resolvedPath);
        added.push(resolvedPath);
      }

      await writeFile(docsSourcePath, JSON.stringify({ path: docsDir, additionalPaths: additionalDocsDirs }, null, 2), "utf8");

      for (const [, watcher] of docsDirectoryWatchers) {
        watcher.close();
      }
      docsDirectoryWatchers.clear();
      await syncDocsDirectoryWatchers();
      scheduleDataChange("notes");

      console.info("[picker] /api/docs/import-folder imported folders", {
        added,
        additionalDocsDirs,
      });
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ added: added.map((d) => path.basename(d)), additionalPaths: additionalDocsDirs }));
    } catch (error) {
      console.error("[picker] /api/docs/import-folder failed", {
        method: request.method,
        error: error instanceof Error ? error.message : String(error),
      });
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(
        JSON.stringify({ error: error instanceof Error ? error.message : "Folder import failed" }),
      );
    }
    return;
  }

  console.warn("[picker] /api/docs/import-folder rejected request method", { method: request.method });
  response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "Method not allowed" }));
}

async function handleDocsRemoveFolder(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "POST") {
    try {
      const body = await readRequestBody(request);
      const parsed = JSON.parse(body);

      if (typeof parsed.path !== "string" || !parsed.path.trim()) {
        throw new Error("path must be a non-empty string");
      }

      const resolvedPath = path.resolve(parsed.path);
      additionalDocsDirs = additionalDocsDirs.filter((d) => d !== resolvedPath);
      await writeFile(docsSourcePath, JSON.stringify({ path: docsDir, additionalPaths: additionalDocsDirs }, null, 2), "utf8");

      for (const [, watcher] of docsDirectoryWatchers) {
        watcher.close();
      }
      docsDirectoryWatchers.clear();
      await syncDocsDirectoryWatchers();
      scheduleDataChange("notes");

      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ removed: path.basename(resolvedPath), additionalPaths: additionalDocsDirs }));
    } catch (error) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(
        JSON.stringify({ error: error instanceof Error ? error.message : "Folder removal failed" }),
      );
    }
    return;
  }

  response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "Method not allowed" }));
}

async function handleEvents(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "GET") {
    response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  response.write(`data: ${JSON.stringify({ id: nextEventId, resource: "ready" })}\n\n`);

  const client = {
    response,
    keepAlive: setInterval(() => {
      response.write(": ping\n\n");
    }, 25000),
  };

  sseClients.add(client);

  request.on("close", () => {
    clearInterval(client.keepAlive);
    sseClients.delete(client);
  });
}

async function handleUnfurl(url, request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "GET") {
    response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const targetUrl = url.searchParams.get("url");
  if (!targetUrl) {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Missing url parameter" }));
    return;
  }

  try {
    const unfurl = await fetchUnfurlData(targetUrl);
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(unfurl, null, 2));
  } catch {
    response.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Failed to fetch unfurl data" }));
  }
}

async function serveStatic(pathname, response) {
  try {
    const candidate = pathname === "/" ? "index.html" : pathname.slice(1);
    const filePath = path.join(distDir, candidate);
    const fileInfo = await stat(filePath);

    if (fileInfo.isFile()) {
      const contents = await readFile(filePath);
      response.writeHead(200, { "Content-Type": getContentType(filePath) });
      response.end(contents);
      return;
    }
  } catch {}

  try {
    const indexFile = await readFile(path.join(distDir, "index.html"));
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(indexFile);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Build the app with `npm run build` or run the Vite dev server.");
  }
}

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let data = "";

    request.on("data", (chunk) => {
      data += chunk;
    });

    request.on("end", () => resolve(data));
    request.on("error", reject);
  });
}

function isValidOrder(order) {
  return (
    Array.isArray(order) &&
    order.length === defaultOrder.length &&
    defaultOrder.every((item) => order.includes(item))
  );
}

async function readBookmarksTree() {
  let contents;
  try {
    contents = await readFile(bookmarksPath, "utf8");
  } catch (err) {
    if (err && (err.code === "ENOENT" || err.code === "EPERM" || err.code === "EACCES")) {
      if (err.code !== "ENOENT") console.warn(`Cannot read bookmarks file (${err.code}): ${bookmarksPath}`);
      return [];
    }
    throw err;
  }
  const parsed = parseJsonWithFallback(contents, {});
  if (Array.isArray(parsed.tree)) {
    return normalizeBookmarkTreeRoot(parsed.tree);
  }
  if (Array.isArray(parsed.bookmarks)) {
    return normalizeBookmarkTreeRoot([
      {
        id: "folder-imported",
        type: "folder",
        title: "Imported Favorites",
        children: parsed.bookmarks.map((bookmark) => toBookmarkNode(bookmark)),
      },
    ]);
  }
  return [];
}

async function writeBookmarksTree(tree) {
  const payload = JSON.stringify({ tree: normalizeBookmarkTreeRoot(tree) }, null, 2);
  await writeFile(bookmarksPath, `${payload}\n`, "utf8");
  scheduleDataChange("bookmarks");
}

async function readRecentDocuments() {
  let contents;
  try {
    contents = await readFile(recentDocumentsPath, "utf8");
  } catch (err) {
    if (err && (err.code === "ENOENT" || err.code === "EPERM" || err.code === "EACCES")) {
      if (err.code !== "ENOENT") console.warn(`Cannot read recent documents file (${err.code}): ${recentDocumentsPath}`);
      return { entries: [] };
    }
    throw err;
  }
  return sanitizeRecentDocumentsPayload(parseJsonWithFallback(contents, { entries: [] }));
}

async function writeRecentDocuments(payload) {
  await writeFile(recentDocumentsPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function readTodoItems() {
  let contents;
  try {
    contents = await readFile(todoItemsPath, "utf8");
  } catch (err) {
    if (err && (err.code === "ENOENT" || err.code === "EPERM" || err.code === "EACCES")) {
      if (err.code !== "ENOENT") console.warn(`Cannot read todo items file (${err.code}): ${todoItemsPath}`);
      return { items: [], viewMode: "list", selectedTodoId: null };
    }
    throw err;
  }
  return sanitizeTodoPayload(parseJsonWithFallback(contents, { items: [], viewMode: "list", selectedTodoId: null }));
}

async function writeTodoItems(payload) {
  await writeFile(todoItemsPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  scheduleDataChange("todo");
}

async function readStarredNotes() {
  let contents;
  try {
    contents = await readFile(starredNotesPath, "utf8");
  } catch (err) {
    if (err && (err.code === "ENOENT" || err.code === "EPERM" || err.code === "EACCES")) {
      if (err.code !== "ENOENT") console.warn(`Cannot read starred notes file (${err.code}): ${starredNotesPath}`);
      return { entries: [] };
    }
    throw err;
  }
  return sanitizeStarredNotesPayload(parseJsonWithFallback(contents, { entries: [] }));
}

function parseJsonWithFallback(contents, fallbackValue) {
  const trimmed = typeof contents === "string" ? contents.trim() : "";
  if (!trimmed) {
    return fallbackValue;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return fallbackValue;
  }
}

async function writeStarredNotes(payload) {
  await writeFile(starredNotesPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function ensureRestorePointsDirectory() {
  await mkdir(restorePointsDir, { recursive: true });
}

function getRestorePointFilePath(id) {
  if (!/^[a-z0-9-]+$/i.test(id)) {
    throw new Error("Invalid restore point id");
  }

  return path.join(restorePointsDir, `${id}.json`);
}

function createRestorePointId(snapshot) {
  const slug = snapshot.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "restore-point";

  return `${snapshot.createdAt}-${slug}-${Math.random().toString(36).slice(2, 8)}`;
}

async function readRestorePointRecord(fileName) {
  const id = fileName.replace(/\.json$/i, "");
  const contents = await readFile(getRestorePointFilePath(id), "utf8");
  const snapshot = sanitizeRestorePointSnapshot(parseJsonWithFallback(contents, null));
  return {
    id,
    snapshot,
    summary: toRestorePointSummary(id, snapshot),
  };
}

async function listRestorePointRecords() {
  await ensureRestorePointsDirectory();

  const entries = await readdir(restorePointsDir, { withFileTypes: true });
  const records = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    try {
      records.push(await readRestorePointRecord(entry.name));
    } catch {
      // Skip unreadable or invalid restore point files.
    }
  }

  records.sort((left, right) => right.snapshot.createdAt - left.snapshot.createdAt);
  return records;
}

async function persistRestorePoint(snapshot) {
  await ensureRestorePointsDirectory();

  const id = createRestorePointId(snapshot);
  await writeFile(getRestorePointFilePath(id), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

  const records = await listRestorePointRecords();
  for (const record of records.slice(MAX_RESTORE_POINTS)) {
    await rm(getRestorePointFilePath(record.id), { force: true });
  }

  return toRestorePointSummary(id, snapshot);
}

async function applyRestorePointSnapshot(snapshot) {
  for (const note of snapshot.notes) {
    const normalizedPath = normalizeRelativeDocsPath(note.sourcePath);
    const absolutePath = resolveNoteAbsolutePath(normalizedPath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, note.content, "utf8");
  }

  await writeBookmarksTree(snapshot.bookmarks);
  await writeTodoItems(snapshot.todo);
  await writeRecentDocuments({ entries: snapshot.recentDocuments });
  await writeStarredNotes({ entries: snapshot.starredNotePaths });

  const payload = JSON.stringify({ order: snapshot.sidebarOrder }, null, 2);
  await writeFile(sidebarOrderPath, `${payload}\n`, "utf8");
  scheduleDataChange("notes");
}

function flattenBookmarkTree(tree, path = []) {
  const flat = [];

  for (const node of tree) {
    if (node.type === "folder") {
      flat.push(...flattenBookmarkTree(node.children || [], [...path, node.title]));
      continue;
    }

    flat.push({
      id: node.id,
      title: node.title,
      description:
        node.description || (path.length ? `Imported from ${path.join(" / ")}` : "Imported bookmark"),
      url: node.url,
      domain: node.domain || safeDomain(node.url),
      icon: node.icon || createIcon(node.title || node.url),
      tags: Array.isArray(node.tags) ? node.tags : [],
      path,
      starred: Boolean(node.starred),
    });
  }

  return flat;
}

function toBookmarkNode(node) {
  return {
    id: node.id || createBookmarkId(node.url),
    type: "bookmark",
    title: node.title || node.url,
    description: node.description || "",
    url: node.url,
    domain: node.domain || safeDomain(node.url),
    icon: node.icon || node.favicon || createIcon(node.title || node.url),
    tags: Array.isArray(node.tags) ? node.tags : [],
    starred: Boolean(node.starred),
  };
}

function createBookmarkId(url) {
  return `bm-${Buffer.from(url).toString("base64url").slice(0, 10)}`;
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

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".mhtml": "multipart/related",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".bmp": "image/bmp",
    ".pdf": "application/pdf",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
  };
  return contentTypes[ext] || "application/octet-stream";
}

function getContentDisposition(filePath, contentType) {
  const fileName = path.basename(filePath).replace(/\"/g, "");
  const isInlinePreview =
    contentType.startsWith("text/html") ||
    contentType.startsWith("multipart/related") ||
    contentType.startsWith("text/plain") ||
    contentType.startsWith("text/markdown");

  return `${isInlinePreview ? "inline" : "attachment"}; filename="${fileName}"`;
}

async function ensureSidebarOrderFile() {
  await mkdir(dataDir, { recursive: true });

  try {
    await stat(sidebarOrderPath);
  } catch {
    const payload = JSON.stringify({ order: defaultOrder }, null, 2);
    await writeFile(sidebarOrderPath, `${payload}\n`, "utf8");
  }
}

async function ensureBookmarksFile() {
  await mkdir(dataDir, { recursive: true });

  try {
    await stat(bookmarksPath);
  } catch {
    await writeBookmarksTree(defaultBookmarkTree);
  }
}

async function ensureRecentDocumentsFile() {
  await mkdir(dataDir, { recursive: true });

  try {
    await stat(recentDocumentsPath);
  } catch {
    await writeRecentDocuments({ entries: [] });
  }
}

async function ensureTodoItemsFile() {
  await mkdir(todosDir, { recursive: true });

  try {
    await stat(todoItemsPath);
  } catch {
    await writeTodoItems({ items: [], viewMode: "list", selectedTodoId: null });
  }
}

async function ensureStarredNotesFile() {
  await mkdir(dataDir, { recursive: true });

  try {
    await stat(starredNotesPath);
  } catch {
    await writeStarredNotes({ entries: [] });
  }
}

async function ensureDocsDirectory() {
  await mkdir(docsDir, { recursive: true });
}

/**
 * Resolve a note's relative sourcePath to an absolute filesystem path.
 * Handles both primary docs folder paths and __imported__/folderName/... paths.
 */
function resolveNoteAssetAbsolutePath(relativePath) {
  const importedPrefix = "__imported__/";
  const normalized = normalizeRelativeDocsPath(relativePath);

  if (normalized.startsWith(importedPrefix)) {
    const rest = normalized.slice(importedPrefix.length);
    const slashIndex = rest.indexOf("/");
    if (slashIndex === -1) throw new Error("Invalid imported note path");
    const folderName = rest.slice(0, slashIndex);
    const innerPath = rest.slice(slashIndex + 1);
    const matchingDir = additionalDocsDirs.find((d) => path.basename(d) === folderName);
    if (!matchingDir) throw new Error(`Imported folder "${folderName}" is not registered`);
    const absolutePath = path.resolve(matchingDir, innerPath);
    const normalizedDir = path.resolve(matchingDir);
    if (!absolutePath.startsWith(`${normalizedDir}${path.sep}`) && absolutePath !== normalizedDir) {
      throw new Error("Asset path must stay inside the imported folder");
    }
    return absolutePath;
  }

  const absolutePath = path.resolve(docsDir, normalized);
  const normalizedDocsRoot = path.resolve(docsDir);
  const insideDocs =
    absolutePath === normalizedDocsRoot || absolutePath.startsWith(`${normalizedDocsRoot}${path.sep}`);
  if (!insideDocs) throw new Error("Asset path must stay inside docs folder");
  return absolutePath;
}

function resolveNoteAbsolutePath(normalizedPath) {
  return resolveNoteAssetAbsolutePath(normalizedPath);
}

async function loadDocsSource() {
  try {
    const raw = await readFile(docsSourcePath, "utf8");
    const parsed = JSON.parse(raw);

    if (typeof parsed.path === "string" && parsed.path.trim()) {
      const resolvedPath = path.resolve(parsed.path);
      const info = await stat(resolvedPath);

      if (info.isDirectory()) {
        docsDir = resolvedPath;
        hasDocsSource = true;
      }
    }

    if (Array.isArray(parsed.additionalPaths)) {
      const validated = [];
      for (const p of parsed.additionalPaths) {
        if (typeof p !== "string" || !p.trim()) continue;
        try {
          const resolved = path.resolve(p);
          const info = await stat(resolved);
          if (info.isDirectory()) {
            validated.push(resolved);
          }
        } catch {
          // Skip invalid paths
        }
      }
      additionalDocsDirs = validated;
    }
  } catch {
    // No custom docs source configured — use default
  }
}

async function readNotesCollection({ supportedNoteFileTypes = DEFAULT_SUPPORTED_NOTE_FILE_TYPES } = {}) {
  if (!docsDir) {
    return { tree: [], notes: [], docsFolder: null, additionalFolders: [] };
  }

  const notes = [];
  const primaryTree = await readDocsTree(docsDir, "", notes, {
    supportedFileExtensions: supportedNoteFileTypes,
  });

  if (additionalDocsDirs.length === 0) {
    const starredNotes = await readStarredNotes();
    return {
      tree: primaryTree,
      notes: mergeStarredNotes(notes, toStarredNotesMap(starredNotes.entries)),
      docsFolder: path.basename(docsDir),
      additionalFolders: [],
    };
  }

  // Multi-root: wrap primary in a root node, add each imported folder as a peer root
  const primaryFolderName = path.basename(docsDir);
  const tree = [
    {
      id: createDocFolderId(`__root__/${primaryFolderName}`),
      type: "folder",
      title: primaryFolderName,
      sourcePath: "",
      children: primaryTree,
    },
  ];

  for (const additionalDir of additionalDocsDirs) {
    const additionalNotes = [];
    const folderName = path.basename(additionalDir);
    const prefix = `__imported__/${folderName}`;
    // Pass prefix as initial relativePath so all folder IDs and note IDs are namespaced
    const additionalTree = await readDocsTree(additionalDir, prefix, additionalNotes, {
      supportedFileExtensions: supportedNoteFileTypes,
    });

    notes.push(...additionalNotes);
    tree.push({
      id: createDocFolderId(prefix),
      type: "folder",
      title: folderName,
      sourcePath: prefix,
      children: additionalTree,
    });
  }

  const starredNotes = await readStarredNotes();
  return {
    tree,
    notes: mergeStarredNotes(notes, toStarredNotesMap(starredNotes.entries)),
    docsFolder: path.basename(docsDir),
    additionalFolders: additionalDocsDirs.map((d) => path.basename(d)),
  };
}

function sanitizeSupportedNoteFileTypes(rawValue) {
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    return [...DEFAULT_SUPPORTED_NOTE_FILE_TYPES];
  }

  const normalized = Array.from(new Set(
    rawValue
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => SUPPORTED_NOTE_FILE_TYPES.has(entry)),
  ));

  return normalized.length > 0 ? normalized : [...DEFAULT_SUPPORTED_NOTE_FILE_TYPES];
}

async function saveUploadedDocs(targetPath, files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("Upload payload must include at least one file");
  }

  const { absolutePath, normalizedPath } = resolveDocsTargetPath(targetPath);
  await mkdir(absolutePath, { recursive: true });

  const uploaded = [];
  let indexedCount = 0;

  for (const file of files) {
    if (!file || typeof file !== "object") {
      continue;
    }

    const sanitizedName = sanitizeUploadFileName(file.name);
    if (!sanitizedName) {
      continue;
    }

    if (typeof file.contentBase64 !== "string" || !file.contentBase64.trim()) {
      throw new Error(`File "${sanitizedName}" is missing content`);
    }

    const buffer = Buffer.from(file.contentBase64, "base64");
    const destination = await resolveAvailableUploadPath(absolutePath, sanitizedName);
    await writeFile(destination.filePath, buffer);

    const sourcePath = path.relative(docsDir, destination.filePath).split(path.sep).join("/");
    const indexed = isMarkdownFile(destination.fileName);

    if (indexed) {
      indexedCount += 1;
    }

    uploaded.push({
      fileName: destination.fileName,
      sourcePath,
      indexed,
    });
  }

  if (uploaded.length === 0) {
    throw new Error("No valid files to upload");
  }

  return {
    targetPath: normalizedPath,
    uploaded,
    indexedCount,
  };
}

function resolveDocsTargetPath(relativePath) {
  const normalizedPath = normalizeUploadTargetPath(relativePath);
  const absolutePath = path.resolve(docsDir, normalizedPath);
  const insideDocs =
    absolutePath === docsDir || absolutePath.startsWith(`${docsDir}${path.sep}`);

  if (!insideDocs) {
    throw new Error("Upload target must stay inside data/docs");
  }

  return { absolutePath, normalizedPath };
}

function normalizeUploadTargetPath(relativePath) {
  if (typeof relativePath !== "string" || !relativePath.trim()) {
    return "";
  }

  return normalizeRelativeDocsPath(relativePath);
}

function sanitizeUploadFileName(fileName) {
  if (typeof fileName !== "string") {
    return "";
  }

  return path
    .basename(fileName)
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveAvailableUploadPath(directoryPath, fileName) {
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension) || "upload";
  let attempt = 0;

  while (attempt < 1000) {
    const candidateName = attempt === 0 ? fileName : `${baseName} (${attempt + 1})${extension}`;
    const candidatePath = path.join(directoryPath, candidateName);

    try {
      await stat(candidatePath);
      attempt += 1;
    } catch {
      return {
        fileName: candidateName,
        filePath: candidatePath,
      };
    }
  }

  throw new Error(`Unable to determine a destination for "${fileName}"`);
}

function scheduleDataChange(resource) {
  if (pendingChangeTimers.has(resource)) {
    clearTimeout(pendingChangeTimers.get(resource));
  }

  const timer = setTimeout(() => {
    pendingChangeTimers.delete(resource);
    broadcastDataChange(resource);
  }, 120);

  pendingChangeTimers.set(resource, timer);
}

function broadcastDataChange(resource) {
  nextEventId += 1;
  const payload = `data: ${JSON.stringify({
    id: nextEventId,
    resource,
    updatedAt: new Date().toISOString(),
  })}\n\n`;

  for (const client of sseClients) {
    try {
      client.response.write(payload);
    } catch {
      clearInterval(client.keepAlive);
      sseClients.delete(client);
    }
  }
}

function startDataDirectoryWatcher() {
  if (dataDirectoryWatcher) {
    return;
  }

  try {
    dataDirectoryWatcher = watch(dataDir, (eventType, fileName) => {
      const changedFile = fileName?.toString() ?? "";

      if (changedFile === "bookmarks.json") {
        scheduleDataChange("bookmarks");
        return;
      }

      if (changedFile === "docs" || !changedFile) {
        scheduleDocsWatcherSync();
      }

      if (changedFile.startsWith("docs")) {
        scheduleDataChange("notes");
      }
    });

    dataDirectoryWatcher.on("error", () => {
      dataDirectoryWatcher = null;
      setTimeout(startDataDirectoryWatcher, 250);
    });
  } catch {
    dataDirectoryWatcher = null;
  }

  // Watch .todos directory for external changes to todo-items.json
  try {
    todosDirectoryWatcher = watch(todosDir, (eventType, fileName) => {
      const changedFile = fileName?.toString() ?? "";
      if (changedFile === "todo-items.json") {
        scheduleDataChange("todo");
      }
    });

    todosDirectoryWatcher.on("error", () => {
      todosDirectoryWatcher = null;
    });
  } catch {
    todosDirectoryWatcher = null;
  }
}

function scheduleDocsWatcherSync() {
  if (docsWatcherSyncTimer) {
    clearTimeout(docsWatcherSyncTimer);
  }

  docsWatcherSyncTimer = setTimeout(() => {
    docsWatcherSyncTimer = null;
    void syncDocsDirectoryWatchers();
  }, 120);
}

async function syncDocsDirectoryWatchers() {
  await ensureDocsDirectory();
  const allDirs = [docsDir, ...additionalDocsDirs];
  const directoryPaths = new Set();

  if (supportsRecursiveDocsWatch()) {
    for (const dir of allDirs) {
      directoryPaths.add(dir);
    }
  } else {
    for (const dir of allDirs) {
      for (const d of await collectDocsDirectories(dir)) {
        directoryPaths.add(d);
      }
    }
  }

  for (const [directoryPath, watcher] of docsDirectoryWatchers) {
    if (!directoryPaths.has(directoryPath)) {
      watcher.close();
      docsDirectoryWatchers.delete(directoryPath);
    }
  }

  for (const directoryPath of directoryPaths) {
    if (!docsDirectoryWatchers.has(directoryPath)) {
      addDocsDirectoryWatcher(directoryPath);
    }
  }
}

async function collectDocsDirectories(directoryPath, directories = []) {
  directories.push(directoryPath);

  let entries = [];

  try {
    entries = await readdir(directoryPath, { withFileTypes: true });
  } catch {
    return directories;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }

    await collectDocsDirectories(path.join(directoryPath, entry.name), directories);
  }

  return directories;
}

function addDocsDirectoryWatcher(directoryPath) {
  try {
    const watcher = watch(directoryPath, getDocsWatchOptions(), (eventType, fileName) => {
      const changedFile = fileName?.toString() ?? "";

      if (!changedFile.startsWith(".")) {
        scheduleDataChange("notes");
      }

      if (eventType === "rename" || !changedFile) {
        scheduleDocsWatcherSync();
      }
    });

    watcher.on("error", () => {
      docsDirectoryWatchers.delete(directoryPath);
      scheduleDocsWatcherSync();
    });

    docsDirectoryWatchers.set(directoryPath, watcher);
  } catch {
    scheduleDocsWatcherSync();
  }
}

function supportsRecursiveDocsWatch(platform = process.platform) {
  return platform === "darwin" || platform === "win32";
}

function getDocsWatchOptions() {
  return supportsRecursiveDocsWatch() ? { recursive: true } : undefined;
}

async function fetchUnfurlData(targetUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "OrganizerWikiPreview/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    const html = await response.text();
    const finalUrl = response.url || targetUrl;
    const title =
      extractMetaContent(html, "property", "og:title") ||
      extractMetaContent(html, "name", "twitter:title") ||
      extractTitle(html);
    const description =
      extractMetaContent(html, "property", "og:description") ||
      extractMetaContent(html, "name", "description") ||
      extractMetaContent(html, "name", "twitter:description");
    const image =
      resolveUrl(
        finalUrl,
        extractMetaContent(html, "property", "og:image") ||
          extractMetaContent(html, "name", "twitter:image") ||
          extractLinkHref(html, "icon"),
      ) || null;
    const siteName = extractMetaContent(html, "property", "og:site_name") || safeDomain(finalUrl);

    return {
      url: finalUrl,
      title: decodeHtmlEntities(title || safeDomain(finalUrl)),
      description: decodeHtmlEntities(description || ""),
      image,
      siteName: decodeHtmlEntities(siteName),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractMetaContent(html, attribute, value) {
  const pattern = new RegExp(
    `<meta[^>]*${attribute}=["']${escapeRegex(value)}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    "i",
  );
  const reversePattern = new RegExp(
    `<meta[^>]*content=["']([^"']+)["'][^>]*${attribute}=["']${escapeRegex(value)}["'][^>]*>`,
    "i",
  );
  return pattern.exec(html)?.[1] || reversePattern.exec(html)?.[1] || "";
}

function extractLinkHref(html, relValue) {
  const pattern = new RegExp(
    `<link[^>]*rel=["'][^"']*${escapeRegex(relValue)}[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>`,
    "i",
  );
  const reversePattern = new RegExp(
    `<link[^>]*href=["']([^"']+)["'][^>]*rel=["'][^"']*${escapeRegex(relValue)}[^"']*["'][^>]*>`,
    "i",
  );
  return pattern.exec(html)?.[1] || reversePattern.exec(html)?.[1] || "";
}

function extractTitle(html) {
  return html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || "";
}

function resolveUrl(baseUrl, candidate) {
  if (!candidate) {
    return "";
  }

  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return "";
  }
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// --- Daily note ---

async function handleDailyNote(request, response) {
  setCorsHeaders(response);
  if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }

  if (request.method !== "POST") {
    response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const body = JSON.parse(await readRequestBody(request));
    const dateStr = typeof body.date === "string" ? body.date.slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Invalid date format, expected YYYY-MM-DD" }));
      return;
    }

    const [year, month] = dateStr.split("-");
    const journalDir = path.join(docsDir, "journal", year, month);
    const fileName = `${dateStr}.md`;
    const filePath = path.join(journalDir, fileName);
    const sourcePath = path.relative(docsDir, filePath).split(path.sep).join("/");

    try {
      const info = await stat(filePath);
      if (info.isFile()) {
        const note = await toDocNote(filePath, sourcePath);
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ sourcePath, note, created: false }));
        return;
      }
    } catch { /* file doesn't exist yet */ }

    await mkdir(journalDir, { recursive: true });
    const dateObj = new Date(dateStr + "T00:00:00");
    const dayName = dateObj.toLocaleDateString("en-US", { weekday: "long" });
    const content = `# ${dayName}, ${dateObj.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}\n\n`;
    await writeFile(filePath, content, "utf8");

    const note = await toDocNote(filePath, sourcePath);
    scheduleDataChange("notes");
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ sourcePath, note, created: true }));
  } catch (error) {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Failed to create daily note" }));
  }
}

// --- Trash / soft delete ---

async function ensureTrashMetaFile() {
  try {
    await stat(trashMetaPath);
  } catch {
    await writeFile(trashMetaPath, JSON.stringify({ entries: [] }, null, 2), "utf8");
  }
}

async function readTrashMeta() {
  try {
    const raw = await readFile(trashMetaPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    return [];
  }
}

async function writeTrashMeta(entries) {
  await writeFile(trashMetaPath, JSON.stringify({ entries }, null, 2), "utf8");
}

async function handleDocsTrash(url, request, response) {
  setCorsHeaders(response);
  if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }

  if (request.method === "GET") {
    const entries = await readTrashMeta();
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ entries }));
    return;
  }

  // POST = move a note to trash
  if (request.method === "POST") {
    try {
      const body = JSON.parse(await readRequestBody(request));
      const normalizedPath = normalizeRelativeDocsPath(body.sourcePath);
      const absolutePath = resolveNoteAbsolutePath(normalizedPath);
      const info = await stat(absolutePath);
      if (!info.isFile()) throw new Error("Only files can be trashed");

      const id = `trash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const trashFileName = `${id}${path.extname(normalizedPath)}`;
      const trashFilePath = path.join(trashDir, trashFileName);

      await moveItem(absolutePath, trashFilePath);

      const entries = await readTrashMeta();
      const titleMatch = (await readFile(trashFilePath, "utf8")).match(/^#\s+(.+)$/m);
      const fileExtension = path.extname(normalizedPath);
      entries.push({
        id,
        sourcePath: normalizedPath,
        title: titleMatch?.[1] || path.basename(normalizedPath, fileExtension),
        deletedAt: new Date().toISOString(),
        trashFileName,
      });
      await writeTrashMeta(entries);
      scheduleDataChange("notes");

      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ id, sourcePath: normalizedPath }));
    } catch (error) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Failed to trash note" }));
    }
    return;
  }

  response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "Method not allowed" }));
}

async function handleDocsTrashRestore(request, response) {
  setCorsHeaders(response);
  if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
  if (request.method !== "POST") {
    response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const body = JSON.parse(await readRequestBody(request));
    const entries = await readTrashMeta();
    const entry = entries.find((e) => e.id === body.id);
    if (!entry) throw new Error("Trash entry not found");

    const trashFilePath = path.join(trashDir, entry.trashFileName);
    const restorePath = path.resolve(docsDir, entry.sourcePath);
    const restoreDir = path.dirname(restorePath);
    await mkdir(restoreDir, { recursive: true });
    await moveItem(trashFilePath, restorePath);

    const remaining = entries.filter((e) => e.id !== body.id);
    await writeTrashMeta(remaining);
    scheduleDataChange("notes");

    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ restored: entry.sourcePath }));
  } catch (error) {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Failed to restore" }));
  }
}

async function handleDocsTrashPurge(request, response) {
  setCorsHeaders(response);
  if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
  if (request.method !== "POST") {
    response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const body = JSON.parse(await readRequestBody(request));
    const entries = await readTrashMeta();

    async function moveToSystemTrash(filePath) {
      try {
        await stat(filePath);
      } catch {
        return;
      }

      await trash([filePath]);
    }

    if (body.id) {
      const entry = entries.find((e) => e.id === body.id);
      if (entry) {
        try { await unlink(path.join(trashDir, entry.trashFileName)); } catch { /* already gone */ }
        await writeTrashMeta(entries.filter((e) => e.id !== body.id));
      }
    } else {
      // Purge all
      for (const entry of entries) {
        await moveToSystemTrash(path.join(trashDir, entry.trashFileName));
      }
      await writeTrashMeta([]);
    }

    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ purged: true }));
  } catch (error) {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Failed to purge" }));
  }
}

// --- Full-text search ---

async function handleDocsSearch(url, request, response) {
  setCorsHeaders(response);
  if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
  if (request.method !== "GET") {
    response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const query = url.searchParams.get("q") || "";
  if (!query.trim()) {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ results: [] }));
    return;
  }

  try {
    const { notes } = await readNotesCollection();
    const lowerQuery = query.toLowerCase();
    const results = [];

    for (const note of notes) {
      const contentLower = note.content.toLowerCase();
      const index = contentLower.indexOf(lowerQuery);
      if (index === -1) continue;

      // Extract context snippet around the match
      const snippetStart = Math.max(0, index - 60);
      const snippetEnd = Math.min(note.content.length, index + query.length + 60);
      const snippet = note.content.slice(snippetStart, snippetEnd);
      const matchStart = index - snippetStart;
      const matchEnd = matchStart + query.length;

      results.push({
        noteId: note.id,
        sourcePath: note.sourcePath,
        title: note.title,
        snippet,
        matchStart,
        matchEnd,
      });

      if (results.length >= 50) break;
    }

    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ results }));
  } catch (error) {
    response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Search failed" }));
  }
}

// --- Workspaces ---

async function ensureWorkspacesFile() {
  try {
    await stat(workspacesPath);
  } catch {
    const defaultWorkspace = {
      id: "default",
      label: path.basename(dataDir),
      path: dataDir,
      isActive: true,
    };
    await writeFile(workspacesPath, JSON.stringify({ workspaces: [defaultWorkspace] }, null, 2), "utf8");
  }
}

async function handleWorkspaces(request, response) {
  setCorsHeaders(response);
  if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }

  if (request.method === "GET") {
    try {
      const raw = await readFile(workspacesPath, "utf8");
      const parsed = JSON.parse(raw);
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(parsed));
    } catch {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ workspaces: [] }));
    }
    return;
  }

  if (request.method === "POST") {
    try {
      const body = JSON.parse(await readRequestBody(request));
      if (body.action === "add" && typeof body.label === "string" && typeof body.path === "string") {
        const raw = await readFile(workspacesPath, "utf8");
        const parsed = JSON.parse(raw);
        const workspaces = Array.isArray(parsed.workspaces) ? parsed.workspaces : [];
        const id = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        workspaces.push({ id, label: body.label.trim(), path: body.path.trim(), isActive: false });
        await writeFile(workspacesPath, JSON.stringify({ workspaces }, null, 2), "utf8");
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ workspaces }));
        return;
      }

      if (body.action === "switch" && typeof body.id === "string") {
        const raw = await readFile(workspacesPath, "utf8");
        const parsed = JSON.parse(raw);
        const workspaces = Array.isArray(parsed.workspaces) ? parsed.workspaces : [];
        const target = workspaces.find((w) => w.id === body.id);
        if (!target) throw new Error("Workspace not found");

        for (const ws of workspaces) ws.isActive = ws.id === body.id;
        await writeFile(workspacesPath, JSON.stringify({ workspaces }, null, 2), "utf8");

        // Re-init data directory if switching
        if (target.path !== dataDir) {
          applyDataDir(path.resolve(target.path));
          await initializeData();
        }

        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ workspaces, switched: true }));
        return;
      }

      if (body.action === "remove" && typeof body.id === "string") {
        const raw = await readFile(workspacesPath, "utf8");
        const parsed = JSON.parse(raw);
        let workspaces = Array.isArray(parsed.workspaces) ? parsed.workspaces : [];
        workspaces = workspaces.filter((w) => w.id !== body.id);
        await writeFile(workspacesPath, JSON.stringify({ workspaces }, null, 2), "utf8");
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ workspaces }));
        return;
      }

      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Invalid action" }));
    } catch (error) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Failed" }));
    }
    return;
  }

  response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "Method not allowed" }));
}
