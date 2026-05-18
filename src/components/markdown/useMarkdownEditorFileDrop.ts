import { useState, type DragEvent } from "react";
import { apiFetch as fetch } from "../../apiFetch";

export async function uploadMarkdownEditorFiles(noteSourcePath: string, files: File[]) {
  if (files.length === 0) {
    return [] as { fileName: string; sourcePath: string; indexed: boolean }[];
  }

  const noteDir = noteSourcePath.includes("/")
    ? noteSourcePath.slice(0, noteSourcePath.lastIndexOf("/"))
    : "";

  const filePayloads: { name: string; contentBase64: string }[] = [];
  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ""),
    );
    filePayloads.push({ name: file.name, contentBase64: base64 });
  }

  const response = await fetch("/api/docs/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetPath: noteDir, files: filePayloads }),
  });

  if (!response.ok) {
    return [] as { fileName: string; sourcePath: string; indexed: boolean }[];
  }

  const result = await response.json();
  return (result.uploaded as { fileName: string; sourcePath: string; indexed: boolean }[]) ?? [];
}

export function buildMarkdownEditorFileInsertions(noteSourcePath: string, uploaded: { fileName: string; sourcePath: string }[]) {
  const noteDir = noteSourcePath.includes("/")
    ? noteSourcePath.slice(0, noteSourcePath.lastIndexOf("/"))
    : "";

  return uploaded
    .map((entry) => {
      const isImage = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(entry.fileName);
      const relativePath = noteDir
        ? entry.sourcePath.startsWith(`${noteDir}/`)
          ? entry.sourcePath.slice(noteDir.length + 1)
          : entry.sourcePath
        : entry.sourcePath;
      return isImage
        ? `![${entry.fileName}](${relativePath})`
        : `[${entry.fileName}](${relativePath})`;
    })
    .join("\n");
}

export function useMarkdownEditorFileDrop({
  markdown,
  noteSourcePath,
  onChange,
  getSelectionStart,
}: {
  markdown: string;
  noteSourcePath?: string;
  onChange: (value: string) => void;
  getSelectionStart: () => number;
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  function hasFilePayload(event: DragEvent<HTMLElement>) {
    return event.dataTransfer.types.includes("Files");
  }

  async function handleFileDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragOver(false);

    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0 || !noteSourcePath) {
      return;
    }

    try {
      const uploaded = await uploadMarkdownEditorFiles(noteSourcePath, files);
      if (uploaded.length === 0) {
        return;
      }
      const insertions = buildMarkdownEditorFileInsertions(noteSourcePath, uploaded);

      const position = getSelectionStart();
      const before = markdown.slice(0, position);
      const after = markdown.slice(position);
      const separator = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
      onChange(before + separator + insertions + "\n" + after);
    } catch {
      // Upload failed silently
    }
  }

  return {
    isDragOver,
    handleDragEnter(event: DragEvent<HTMLElement>) {
      if (!hasFilePayload(event)) {
        return;
      }

      event.preventDefault();
      setIsDragOver(true);
    },
    handleDragLeave() {
      setIsDragOver(false);
    },
    handleDragOver(event: DragEvent<HTMLElement>) {
      if (!hasFilePayload(event)) {
        return;
      }

      event.preventDefault();
    },
    handleFileDrop,
  };
}