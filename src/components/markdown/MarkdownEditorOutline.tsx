import { useState, type DragEvent } from "react";

import type { MarkdownOutlineEntry } from "./markdownEditorUtils";

export function MarkdownEditorOutline({
  entries,
  activeEntryId,
  onSelectEntry,
  onFoldEntry,
  onUnfoldEntry,
  onFoldAll,
  onUnfoldAll,
  onMoveEntry,
}: {
  entries: MarkdownOutlineEntry[];
  activeEntryId: string | null;
  onSelectEntry: (entry: MarkdownOutlineEntry) => void;
  onFoldEntry: (entry: MarkdownOutlineEntry) => void;
  onUnfoldEntry: (entry: MarkdownOutlineEntry) => void;
  onFoldAll: () => void;
  onUnfoldAll: () => void;
  onMoveEntry: (sourceEntry: MarkdownOutlineEntry, targetEntry: MarkdownOutlineEntry) => void;
}) {
  const [draggedEntryId, setDraggedEntryId] = useState<string | null>(null);
  const [dropTargetEntryId, setDropTargetEntryId] = useState<string | null>(null);

  if (entries.length === 0) {
    return null;
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>, entryId: string) {
    event.preventDefault();
    if (draggedEntryId && draggedEntryId !== entryId) {
      setDropTargetEntryId(entryId);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, targetEntry: MarkdownOutlineEntry) {
    event.preventDefault();
    const sourceEntry = entries.find((entry) => entry.id === draggedEntryId);
    setDraggedEntryId(null);
    setDropTargetEntryId(null);

    if (!sourceEntry || sourceEntry.id === targetEntry.id) {
      return;
    }

    onMoveEntry(sourceEntry, targetEntry);
  }

  return (
    <section className="markdown-editor__outline" aria-label="Document outline">
      <div className="markdown-editor__outline-header">
        <div className="markdown-editor__outline-summary">
          <span className="status-pill subtle">Outline</span>
          <span className="muted">{entries.length} heading{entries.length === 1 ? "" : "s"}</span>
        </div>
        <div className="markdown-editor__outline-actions">
          <button className="mini-action" onClick={onFoldAll} type="button">Fold all</button>
          <button className="mini-action" onClick={onUnfoldAll} type="button">Unfold all</button>
        </div>
      </div>
      <div className="markdown-editor__outline-list">
        {entries.map((entry) => (
          <div
            className={[
              "markdown-editor__outline-item",
              activeEntryId === entry.id ? "is-active" : "",
              draggedEntryId === entry.id ? "is-dragging" : "",
              dropTargetEntryId === entry.id ? "is-drop-target" : "",
            ].filter(Boolean).join(" ")}
            draggable
            key={entry.id}
            onDragEnd={() => {
              setDraggedEntryId(null);
              setDropTargetEntryId(null);
            }}
            onDragOver={(event) => handleDragOver(event, entry.id)}
            onDragStart={(event) => {
              setDraggedEntryId(entry.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", entry.id);
            }}
            onDrop={(event) => handleDrop(event, entry)}
          >
            <button
              className="markdown-editor__outline-link"
              onClick={() => onSelectEntry(entry)}
              style={{ paddingLeft: `${12 + (entry.level - 1) * 14}px` }}
              type="button"
            >
              <span className="markdown-editor__outline-level">H{entry.level}</span>
              <span className="markdown-editor__outline-title">{entry.title}</span>
            </button>
            <div className="markdown-editor__outline-item-actions">
              <button className="markdown-editor__outline-icon-button" onClick={() => onFoldEntry(entry)} title="Fold section" type="button">−</button>
              <button className="markdown-editor__outline-icon-button" onClick={() => onUnfoldEntry(entry)} title="Unfold section" type="button">+</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
