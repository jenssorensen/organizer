import { constants } from "node:fs";
import { copyFile, mkdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeRelativeDocsPath } from "./notePersistence.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultGettingStartedTemplatePath = path.resolve(__dirname, "..", "docs", "getting-started.md");

export async function createMarkdownDoc(docsDir, targetPath, fileName) {
  const { absolutePath, normalizedPath } = resolveDocsTargetPath(docsDir, targetPath);
  await mkdir(absolutePath, { recursive: true });

  const sanitizedName = sanitizeMarkdownFileName(fileName);
  if (!sanitizedName) {
    throw new Error("Document name is required");
  }

  const destination = path.join(absolutePath, sanitizedName);

  try {
    const existing = await stat(destination);
    if (existing.isFile()) {
      throw new Error(`Document "${sanitizedName}" already exists`);
    }
    throw new Error(`Path "${sanitizedName}" is not available`);
  } catch (error) {
    if (!(error instanceof Error) || "code" in error === false || error.code !== "ENOENT") {
      throw error;
    }
  }

  await writeFile(destination, "", "utf8");

  return {
    fileName: sanitizedName,
    sourcePath: path.relative(docsDir, destination).split(path.sep).join("/"),
    targetPath: normalizedPath,
  };
}

export async function createDocsFolder(docsDir, targetPath, folderName) {
  const { absolutePath, normalizedPath } = resolveDocsTargetPath(docsDir, targetPath);
  await mkdir(absolutePath, { recursive: true });

  const sanitizedName = sanitizeFolderName(folderName);
  if (!sanitizedName) {
    throw new Error("Folder name is required");
  }

  const destination = path.join(absolutePath, sanitizedName);

  try {
    const existing = await stat(destination);
    if (existing.isDirectory()) {
      throw new Error(`Folder "${sanitizedName}" already exists`);
    }
    throw new Error(`Path "${sanitizedName}" is not available`);
  } catch (error) {
    if (!(error instanceof Error) || "code" in error === false || error.code !== "ENOENT") {
      throw error;
    }
  }

  await mkdir(destination, { recursive: false });
  await writeFile(path.join(destination, "readme.md"), `# ${sanitizedName}\n`, "utf8");

  return {
    folderName: sanitizedName,
    sourcePath: path.relative(docsDir, destination).split(path.sep).join("/"),
    targetPath: normalizedPath,
  };
}

export async function renameMarkdownDoc(docsDir, sourcePath, fileName) {
  const { absolutePath: sourceAbsPath } = resolveDocsFilePath(docsDir, sourcePath);
  const sourceInfo = await stat(sourceAbsPath);
  if (!sourceInfo.isFile()) {
    throw new Error("Source must be a file");
  }

  const sanitizedName = sanitizeMarkdownFileName(fileName);
  if (!sanitizedName) {
    throw new Error("Document name is required");
  }

  const targetAbsPath = path.join(path.dirname(sourceAbsPath), sanitizedName);
  const nextSourcePath = path.relative(docsDir, targetAbsPath).split(path.sep).join("/");

  if (sourceAbsPath === targetAbsPath) {
    return {
      fileName: sanitizedName,
      sourcePath: nextSourcePath,
    };
  }

  try {
    await stat(targetAbsPath);
    throw new Error(`Document "${sanitizedName}" already exists`);
  } catch (error) {
    if (!(error instanceof Error) || "code" in error === false || error.code !== "ENOENT") {
      throw error;
    }
  }

  await rename(sourceAbsPath, targetAbsPath);

  return {
    fileName: sanitizedName,
    sourcePath: nextSourcePath,
  };
}

export async function ensureGettingStartedDoc(docsDir, templatePath = defaultGettingStartedTemplatePath) {
  const destination = path.join(docsDir, "getting-started.md");

  await mkdir(docsDir, { recursive: true });

  try {
    await copyFile(templatePath, destination, constants.COPYFILE_EXCL);
    return { created: true, sourcePath: "getting-started.md" };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      return { created: false, sourcePath: "getting-started.md" };
    }

    throw error;
  }
}

function resolveDocsTargetPath(docsDir, relativePath) {
  const normalizedPath = normalizeUploadTargetPath(relativePath);
  const absolutePath = path.resolve(docsDir, normalizedPath);
  const insideDocs = absolutePath === docsDir || absolutePath.startsWith(`${docsDir}${path.sep}`);

  if (!insideDocs) {
    throw new Error("Upload target must stay inside data/docs");
  }

  return { absolutePath, normalizedPath };
}

function resolveDocsFilePath(docsDir, relativePath) {
  const normalizedPath = normalizeUploadTargetPath(relativePath);
  if (!normalizedPath) {
    throw new Error("Source path is required");
  }

  const absolutePath = path.resolve(docsDir, normalizedPath);
  const insideDocs = absolutePath === docsDir || absolutePath.startsWith(`${docsDir}${path.sep}`);
  if (!insideDocs) {
    throw new Error("Source path must stay inside data/docs");
  }

  return { absolutePath, normalizedPath };
}

function normalizeUploadTargetPath(relativePath) {
  if (typeof relativePath !== "string" || !relativePath.trim()) {
    return "";
  }

  return normalizeRelativeDocsPath(relativePath);
}

export function sanitizeMarkdownFileName(fileName) {
  if (typeof fileName !== "string") {
    return "";
  }

  const trimmed = fileName.trim();
  if (!trimmed) {
    return "";
  }

  const extension = path.extname(trimmed).toLowerCase();
  const baseName = path.basename(trimmed, extension || undefined);
  const normalizedBase = baseName
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .trim();

  if (!normalizedBase) {
    return "";
  }

  return `${normalizedBase}.md`;
}

function sanitizeFolderName(folderName) {
  if (typeof folderName !== "string") {
    return "";
  }

  return folderName
    .trim()
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .trim();
}
