import { useState, type DragEvent, type RefObject } from "react";
import { apiFetch as fetch } from "../../apiFetch";

export function useMarkdownEditorFileDrop({
  markdown,
  noteSourcePath,
  onChange,
  editorInputRef,
}: {
  markdown: string;
  noteSourcePath?: string;
  onChange: (value: string) => void;
  editorInputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  function hasFilePayload(event: DragEvent<HTMLTextAreaElement>) {
    return event.dataTransfer.types.includes("Files");
  }

  async function handleFileDrop(event: DragEvent<HTMLTextAreaElement>) {
    event.preventDefault();
    setIsDragOver(false);

    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0 || !noteSourcePath) {
      return;
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

    try {
      const response = await fetch("/api/docs/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetPath: noteDir, files: filePayloads }),
      });

      if (!response.ok) {
        return;
      }

      const result = await response.json();
      const insertions = (result.uploaded as { fileName: string; sourcePath: string; indexed: boolean }[])
        .map((uploaded) => {
          const isImage = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(uploaded.fileName);
          const relativePath = noteDir
            ? uploaded.sourcePath.startsWith(noteDir + "/")
              ? uploaded.sourcePath.slice(noteDir.length + 1)
              : uploaded.sourcePath
            : uploaded.sourcePath;
          return isImage
            ? `![${uploaded.fileName}](${relativePath})`
            : `[${uploaded.fileName}](${relativePath})`;
        })
        .join("\n");

      const editor = editorInputRef.current;
      if (!editor) {
        return;
      }

      const position = editor.selectionStart;
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
    handleDragEnter(event: DragEvent<HTMLTextAreaElement>) {
      if (!hasFilePayload(event)) {
        return;
      }

      event.preventDefault();
      setIsDragOver(true);
    },
    handleDragLeave() {
      setIsDragOver(false);
    },
    handleDragOver(event: DragEvent<HTMLTextAreaElement>) {
      if (!hasFilePayload(event)) {
        return;
      }

      event.preventDefault();
    },
    handleFileDrop,
  };
}