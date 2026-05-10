import { useEffect, useMemo, useState, type RefObject } from "react";
import { Folder, Plus, X } from "lucide-react";

import type { Note } from "../../types";

export function NoteLinkAutocomplete({
  notes,
  textareaRef,
  onInsertLink,
}: {
  notes: Note[];
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onInsertLink: (linkText: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    function handleInput(event: Event) {
      const target = event.target as HTMLTextAreaElement;
      const selection = target.selectionStart;
      const text = target.value.slice(0, selection);
      const lastBrackets = text.lastIndexOf("[[");

      if (lastBrackets !== -1 && !text.slice(lastBrackets).includes("]]")) {
        const partial = text.slice(lastBrackets + 2);
        setFilter(partial);
        setIsOpen(true);

        const lines = text.split("\n");
        const lineNumber = lines.length - 1;
        const charPosition = lines[lineNumber].length;
        setPosition({ top: lineNumber * 20 + 24, left: Math.min(charPosition * 8, 300) });
        return;
      }

      setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    textarea.addEventListener("input", handleInput);
    textarea.addEventListener("keydown", handleKeyDown);
    return () => {
      textarea.removeEventListener("input", handleInput);
      textarea.removeEventListener("keydown", handleKeyDown);
    };
  }, [textareaRef]);

  const filteredNotes = useMemo(() => {
    if (!isOpen || !filter) {
      return notes.slice(0, 15);
    }

    const normalizedFilter = filter.toLowerCase();
    return notes.filter((note) => note.title.toLowerCase().includes(normalizedFilter)).slice(0, 15);
  }, [filter, isOpen, notes]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="note-link-autocomplete" style={{ left: position.left, top: position.top }}>
      {filteredNotes.length === 0 ? (
        <div className="note-link-autocomplete__empty">No matching notes</div>
      ) : (
        filteredNotes.map((note) => (
          <button
            className="note-link-autocomplete__item"
            key={note.id}
            onClick={() => {
              onInsertLink(`[[${note.title}]]`);
              setIsOpen(false);
            }}
            type="button"
          >
            {note.title}
          </button>
        ))
      )}
    </div>
  );
}

export function FullTextSearchResults({
  results,
  query,
  onSelectNote,
}: {
  results: Array<{ noteId: string; sourcePath: string; title: string; snippet: string; matchStart: number; matchEnd: number }>;
  query: string;
  onSelectNote: (sourcePath: string) => void;
}) {
  if (results.length === 0 && query) {
    return (
      <article className="bookmark-empty">
        <h4>No results</h4>
        <p>No notes matched "{query}".</p>
      </article>
    );
  }

  return (
    <div className="fulltext-results">
      {results.map((result, index) => (
        <button className="fulltext-results__item" key={`${result.noteId}-${index}`} onClick={() => onSelectNote(result.sourcePath)} type="button">
          <strong>{result.title}</strong>
          <p className="fulltext-results__snippet">
            {result.snippet.slice(0, result.matchStart)}
            <mark>{result.snippet.slice(result.matchStart, result.matchEnd)}</mark>
            {result.snippet.slice(result.matchEnd)}
          </p>
          <span className="muted">{result.sourcePath}</span>
        </button>
      ))}
    </div>
  );
}

export function SmartFoldersList({
  folders,
  onSelect,
  onDelete,
  onAdd,
}: {
  folders: Array<{ id: string; label: string; query: string }>;
  onSelect: (query: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="smart-folders">
      <div className="smart-folders__header">
        <h5>Smart Folders</h5>
        <button className="mini-action" onClick={onAdd} type="button">
          <Plus size={14} /> New
        </button>
      </div>
      {folders.length === 0 ? (
        <p className="muted">No smart folders yet. Create one from a search query.</p>
      ) : (
        <div className="smart-folders__list">
          {folders.map((folder) => (
            <div className="smart-folders__item" key={folder.id}>
              <button className="smart-folders__item-main" onClick={() => onSelect(folder.query)} type="button">
                <Folder size={14} />
                <span>{folder.label}</span>
                <span className="muted">{folder.query}</span>
              </button>
              <button aria-label={`Remove smart folder ${folder.label}`} className="icon-action" onClick={() => onDelete(folder.id)} title="Remove" type="button">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}