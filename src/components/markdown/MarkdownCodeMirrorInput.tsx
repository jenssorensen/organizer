import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, type DragEventHandler } from "react";

import { autocompletion, closeCompletion, completionKeymap, type CompletionContext } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { foldCode, foldKeymap, unfoldCode } from "@codemirror/language";
import { linter } from "@codemirror/lint";
import { markdown as markdownLanguage } from "@codemirror/lang-markdown";
import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { closeSearchPanel, openSearchPanel, search, searchKeymap } from "@codemirror/search";
import { drawSelection, dropCursor, EditorView, highlightActiveLine, highlightSpecialChars, hoverTooltip, keymap, rectangularSelection } from "@codemirror/view";

import type { Note } from "../../types";
import {
  buildMarkdownUrlPasteInsertion,
  findWikiLinkMatches,
  getMarkdownSlashCommands,
  isMarkdownEmbedDirectivePrefix,
  moveMarkdownSection,
} from "./markdownEditorUtils";
import { buildMarkdownEditorFileInsertions, uploadMarkdownEditorFiles } from "./useMarkdownEditorFileDrop";

type SelectionRange = {
  selectionStart: number;
  selectionEnd: number;
};

type ScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

export type MarkdownCodeMirrorHandle = {
  focus: () => void;
  getSelection: () => SelectionRange | null;
  setSelectionRange: (selectionStart: number, selectionEnd: number) => void;
  getScrollMetrics: () => ScrollMetrics | null;
  setScrollTop: (scrollTop: number) => void;
  openSearch: () => void;
  closeSearch: () => void;
  foldLine: (lineNumber: number) => boolean;
  unfoldLine: (lineNumber: number) => boolean;
};

type MarkdownKeyCommands = {
  applyHeading: (level: number) => void;
  toggleList: () => void;
  toggleTaskList: () => void;
  insertCallout: (kind: "note" | "tip" | "warning") => void;
  openActionPalette: () => void;
  toggleFocusedPreview: () => void;
  cycleRevision: (direction: -1 | 1) => void;
};

function buildWikiTargets(notes: { title: string; sourcePath?: string }[]) {
  const targets = new Set<string>();

  for (const note of notes) {
    if (note.title.trim()) {
      targets.add(note.title.trim());
    }

    const fileName = note.sourcePath?.split("/").pop()?.replace(/\.[^.]+$/, "");
    if (fileName) {
      targets.add(fileName);
    }
  }

  return [...targets].sort((left, right) => left.localeCompare(right));
}

function buildWikiNoteLookup(notes: Note[]) {
  const lookup = new Map<string, Note>();

  for (const note of notes) {
    const title = note.title.trim().toLowerCase();
    if (title && !lookup.has(title)) {
      lookup.set(title, note);
    }

    const fileName = note.sourcePath?.split("/").pop()?.replace(/\.[^.]+$/, "").trim().toLowerCase();
    if (fileName && !lookup.has(fileName)) {
      lookup.set(fileName, note);
    }
  }

  return lookup;
}

function getWikiLinkAtOffset(markdown: string, offset: number) {
  return findWikiLinkMatches(markdown).find((match) => offset >= match.from && offset <= match.to) ?? null;
}

function buildTooltipPreview(note: Note) {
  const summary = note.summary.trim() || note.content.replace(/^#+\s+/gm, "").trim().slice(0, 220) || "Empty note";
  const root = document.createElement("div");
  root.className = "markdown-editor__hover-card";

  const title = document.createElement("strong");
  title.className = "markdown-editor__hover-card-title";
  title.textContent = note.title;
  root.append(title);

  if (note.sourcePath) {
    const path = document.createElement("div");
    path.className = "markdown-editor__hover-card-path";
    path.textContent = note.sourcePath;
    root.append(path);
  }

  const body = document.createElement("p");
  body.className = "markdown-editor__hover-card-body";
  body.textContent = summary;
  root.append(body);

  return root;
}

function indentSelectedLines(value: string, selectionStart: number, selectionEnd: number) {
  const blockStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const blockEndIndex = value.indexOf("\n", selectionEnd);
  const blockEnd = blockEndIndex === -1 ? value.length : blockEndIndex;
  const lines = value.slice(blockStart, blockEnd).split("\n");
  const nextBlock = lines.map((line) => `  ${line}`).join("\n");

  return {
    value: value.slice(0, blockStart) + nextBlock + value.slice(blockEnd),
    selectionStart: blockStart,
    selectionEnd: blockStart + nextBlock.length,
  };
}

function outdentSelectedLines(value: string, selectionStart: number, selectionEnd: number) {
  const blockStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const blockEndIndex = value.indexOf("\n", selectionEnd);
  const blockEnd = blockEndIndex === -1 ? value.length : blockEndIndex;
  const lines = value.slice(blockStart, blockEnd).split("\n");
  const nextBlock = lines
    .map((line) => line.startsWith("    ") ? line.slice(4) : line.startsWith("  ") ? line.slice(2) : line.startsWith("\t") ? line.slice(1) : line)
    .join("\n");

  return {
    value: value.slice(0, blockStart) + nextBlock + value.slice(blockEnd),
    selectionStart: blockStart,
    selectionEnd: blockStart + nextBlock.length,
  };
}

function moveSelectedLines(value: string, selectionStart: number, selectionEnd: number, direction: -1 | 1) {
  const lines = value.split("\n");
  const lineStarts = [0];

  for (let index = 0; index < lines.length - 1; index += 1) {
    lineStarts.push(lineStarts[index] + lines[index].length + 1);
  }

  const selectionAnchor = Math.max(0, selectionStart);
  const selectionHead = Math.max(selectionAnchor, Math.max(selectionEnd - 1, selectionAnchor));
  let startLineIndex = 0;
  let endLineIndex = 0;

  for (let index = lineStarts.length - 1; index >= 0; index -= 1) {
    if (lineStarts[index] <= selectionAnchor) {
      startLineIndex = index;
      break;
    }
  }

  for (let index = lineStarts.length - 1; index >= 0; index -= 1) {
    if (lineStarts[index] <= selectionHead) {
      endLineIndex = index;
      break;
    }
  }

  if ((direction === -1 && startLineIndex <= 0) || (direction === 1 && endLineIndex >= lines.length - 1)) {
    return null;
  }

  const nextLines = [...lines];
  const block = nextLines.splice(startLineIndex, endLineIndex - startLineIndex + 1);
  const insertIndex = direction === -1 ? startLineIndex - 1 : startLineIndex + 1;
  nextLines.splice(insertIndex, 0, ...block);

  const nextValue = nextLines.join("\n");
  const nextLineStarts = [0];
  for (let index = 0; index < nextLines.length - 1; index += 1) {
    nextLineStarts.push(nextLineStarts[index] + nextLines[index].length + 1);
  }

  const nextStartLineIndex = startLineIndex + direction;
  const nextEndLineIndex = endLineIndex + direction;
  const nextSelectionStart = nextLineStarts[nextStartLineIndex] ?? 0;
  const nextSelectionEnd = (nextLineStarts[nextEndLineIndex] ?? 0) + (nextLines[nextEndLineIndex]?.length ?? 0);

  return {
    value: nextValue,
    selectionStart: nextSelectionStart,
    selectionEnd: nextSelectionEnd,
  };
}

function duplicateSelectionOrLine(value: string, selectionStart: number, selectionEnd: number) {
  if (selectionStart !== selectionEnd) {
    const selectedText = value.slice(selectionStart, selectionEnd);
    const nextValue = value.slice(0, selectionEnd) + selectedText + value.slice(selectionEnd);
    return {
      value: nextValue,
      selectionStart: selectionEnd,
      selectionEnd: selectionEnd + selectedText.length,
    };
  }

  const lineStart = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const lineEndIndex = value.indexOf("\n", selectionStart);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const lineText = value.slice(lineStart, lineEnd);
  const insertion = `${lineText}\n`;
  const insertAt = lineEndIndex === -1 ? value.length : lineEnd + 1;
  const nextValue = value.slice(0, insertAt) + insertion + value.slice(insertAt);
  return {
    value: nextValue,
    selectionStart: insertAt,
    selectionEnd: insertAt + lineText.length,
  };
}

function getTableCellNavigationTarget(value: string, selectionStart: number, direction: -1 | 1) {
  const lineStart = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const lineEndIndex = value.indexOf("\n", selectionStart);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const line = value.slice(lineStart, lineEnd);
  if (!/^\s*\|.*\|\s*$/.test(line)) {
    return null;
  }

  const cursorInLine = selectionStart - lineStart;
  const pipeOffsets = [...line.matchAll(/\|/g)].map((match) => match.index ?? -1).filter((offset) => offset >= 0);
  if (pipeOffsets.length < 2) {
    return null;
  }

  if (direction === 1) {
    const nextPipe = pipeOffsets.find((offset) => offset > cursorInLine);
    return nextPipe === undefined ? null : lineStart + Math.min(nextPipe + 2, line.length);
  }

  const previousPipe = [...pipeOffsets].reverse().find((offset) => offset < cursorInLine - 1);
  return previousPipe === undefined ? null : lineStart + previousPipe + 2;
}

function buildMarkdownTableFromTsv(value: string) {
  const rows = value
    .replace(/\r\n/g, "\n")
    .trim()
    .split("\n")
    .map((row) => row.split("\t").map((cell) => cell.trim()));

  if (rows.length < 2 || !rows.every((row) => row.length > 1)) {
    return null;
  }

  const columnCount = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) => Array.from({ length: columnCount }, (_, index) => row[index] ?? ""));
  const [header, ...body] = normalizedRows;

  return [
    `| ${header.join(" | ")} |`,
    `| ${Array.from({ length: columnCount }, () => "---").join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function isUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

function shouldUseStandaloneUrlPreview(value: string, selectionStart: number, selectionEnd: number) {
  if (selectionStart !== selectionEnd) {
    return false;
  }

  const lineStart = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const lineEndIndex = value.indexOf("\n", selectionStart);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const lineText = value.slice(lineStart, lineEnd);
  return lineText.trim().length === 0;
}

function isEmbedDirectivePasteTarget(value: string, selectionStart: number, selectionEnd: number) {
  const lineStart = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const lineEndIndex = value.indexOf("\n", Math.max(selectionStart, selectionEnd));
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const lineText = value.slice(lineStart, lineEnd);
  return isMarkdownEmbedDirectivePrefix(lineText);
}

function buildEditorTheme() {
  return EditorView.theme({
    "&": {
      height: "100%",
      background: "transparent",
      color: "var(--text)",
      fontFamily: "var(--font-mono)",
      fontSize: "1rem",
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: "inherit",
      lineHeight: "1.65",
    },
    ".cm-content": {
      minHeight: "220px",
      padding: "18px",
      caretColor: "var(--accent-warm)",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
    },
    ".cm-line": {
      padding: 0,
    },
    ".cm-focused": {
      outline: "none",
    },
    ".cm-selectionBackground, ::selection": {
      backgroundColor: "color-mix(in srgb, var(--accent) 22%, transparent)",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--accent-warm)",
    },
    ".cm-panels": {
      background: "rgba(7, 15, 27, 0.96)",
      color: "var(--text)",
      borderBottom: "1px solid rgba(136, 167, 209, 0.12)",
    },
    ".cm-tooltip": {
      border: "1px solid rgba(136, 167, 209, 0.16)",
      borderRadius: "12px",
      background: "rgba(7, 15, 27, 0.96)",
      color: "var(--text)",
      boxShadow: "0 10px 24px rgba(0, 0, 0, 0.24)",
    },
    ".cm-foldPlaceholder": {
      border: "1px solid rgba(136, 167, 209, 0.18)",
      borderRadius: "6px",
      background: "rgba(255, 255, 255, 0.03)",
      color: "var(--muted)",
    },
  }, { dark: true });
}

export const MarkdownCodeMirrorInput = forwardRef<MarkdownCodeMirrorHandle, {
  markdown: string;
  noteSourcePath?: string;
  notes: Note[];
  isDragOver: boolean;
  initialScrollRatio: number;
  onChange: (value: string) => void;
  onSelectionChange: (selectionStart: number) => void;
  onScroll: (metrics: ScrollMetrics) => void;
  onCreateMissingNote?: (label: string) => void;
  keyCommands: MarkdownKeyCommands;
  onDragEnter?: DragEventHandler<HTMLDivElement>;
  onDragLeave?: DragEventHandler<HTMLDivElement>;
  onDragOver?: DragEventHandler<HTMLDivElement>;
  onDrop?: DragEventHandler<HTMLDivElement>;
}>(({
  markdown,
  noteSourcePath,
  notes,
  isDragOver,
  initialScrollRatio,
  onChange,
  onSelectionChange,
  onScroll,
  onCreateMissingNote,
  keyCommands,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
}, ref) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const latestMarkdownRef = useRef(markdown);
  const latestNotesRef = useRef(notes);
  const latestOnChangeRef = useRef(onChange);
  const latestOnSelectionChangeRef = useRef(onSelectionChange);
  const latestOnScrollRef = useRef(onScroll);
  const latestOnCreateMissingNoteRef = useRef(onCreateMissingNote);
  const latestKeyCommandsRef = useRef(keyCommands);
  const latestNoteSourcePathRef = useRef(noteSourcePath);
  const hasAppliedInitialScrollRef = useRef(false);
  const editorTheme = useMemo(() => buildEditorTheme(), []);
  latestMarkdownRef.current = markdown;
  latestNotesRef.current = notes;
  latestOnChangeRef.current = onChange;
  latestOnSelectionChangeRef.current = onSelectionChange;
  latestOnScrollRef.current = onScroll;
  latestOnCreateMissingNoteRef.current = onCreateMissingNote;
  latestKeyCommandsRef.current = keyCommands;
  latestNoteSourcePathRef.current = noteSourcePath;

  useImperativeHandle(ref, () => ({
    focus() {
      viewRef.current?.focus();
    },
    getSelection() {
      const view = viewRef.current;
      if (!view) {
        return null;
      }

      return {
        selectionStart: view.state.selection.main.from,
        selectionEnd: view.state.selection.main.to,
      };
    },
    setSelectionRange(selectionStart, selectionEnd) {
      const view = viewRef.current;
      if (!view) {
        return;
      }

      const safeStart = Math.max(0, Math.min(selectionStart, view.state.doc.length));
      const safeEnd = Math.max(safeStart, Math.min(selectionEnd, view.state.doc.length));
      view.dispatch({ selection: EditorSelection.range(safeStart, safeEnd), scrollIntoView: true });
      view.focus();
    },
    getScrollMetrics() {
      const view = viewRef.current;
      if (!view) {
        return null;
      }

      return {
        scrollTop: view.scrollDOM.scrollTop,
        scrollHeight: view.scrollDOM.scrollHeight,
        clientHeight: view.scrollDOM.clientHeight,
      };
    },
    setScrollTop(scrollTop) {
      const view = viewRef.current;
      if (!view) {
        return;
      }

      view.scrollDOM.scrollTop = scrollTop;
    },
    openSearch() {
      const view = viewRef.current;
      if (!view) {
        return;
      }

      openSearchPanel(view);
      view.focus();
    },
    closeSearch() {
      const view = viewRef.current;
      if (!view) {
        return;
      }

      closeSearchPanel(view);
      view.focus();
    },
    foldLine(lineNumber) {
      const view = viewRef.current;
      if (!view) {
        return false;
      }

      const line = view.state.doc.line(Math.max(1, Math.min(lineNumber, view.state.doc.lines)));
      view.dispatch({ selection: EditorSelection.cursor(line.from) });
      return foldCode(view);
    },
    unfoldLine(lineNumber) {
      const view = viewRef.current;
      if (!view) {
        return false;
      }

      const line = view.state.doc.line(Math.max(1, Math.min(lineNumber, view.state.doc.lines)));
      view.dispatch({ selection: EditorSelection.cursor(line.from) });
      return unfoldCode(view);
    },
  }), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const wikiLinkCompletions = (context: CompletionContext) => {
      const match = context.matchBefore(/\[\[[^\]\n]*$/);
      if (!match) {
        return null;
      }

      const query = match.text.slice(2).toLowerCase();
      const options = buildWikiTargets(latestNotesRef.current)
        .filter((target) => target.toLowerCase().includes(query))
        .slice(0, 12)
        .map((target) => ({
          label: target,
          type: "text" as const,
          apply(view: EditorView, _completion: unknown, from: number, to: number) {
            const insert = `[[${target}]]`;
            view.dispatch({
              changes: { from, to, insert },
              selection: EditorSelection.cursor(from + insert.length),
            });
          },
        }));

      return {
        from: match.from,
        options,
        validFor: /\[\[[^\]\n]*$/,
      };
    };

    const slashCommandCompletions = (context: CompletionContext) => {
      const match = context.matchBefore(/\/[a-z-]*$/i);
      if (!match) {
        return null;
      }

      const line = context.state.doc.lineAt(match.from);
      const prefix = line.text.slice(0, match.from - line.from);
      if (prefix.trim().length > 0) {
        return null;
      }

      const query = match.text.slice(1).toLowerCase();
      const options = getMarkdownSlashCommands()
        .filter((command) => {
          const searchable = [command.id, command.label.slice(1), command.detail, ...command.aliases].join(" ").toLowerCase();
          return searchable.includes(query);
        })
        .map((command) => ({
          label: command.label,
          detail: command.detail,
          type: "keyword" as const,
          apply(view: EditorView, _completion: unknown, from: number, to: number) {
            view.dispatch({
              changes: { from, to, insert: command.insert },
              selection: EditorSelection.cursor(from + command.cursorOffset),
            });
          },
        }));

      return options.length > 0
        ? {
          from: match.from,
          options,
          validFor: /\/[a-z-]*$/i,
        }
        : null;
    };

    async function handlePaste(event: ClipboardEvent, view: EditorView) {
      const clipboardData = event.clipboardData;
      if (!clipboardData) {
        return;
      }

      const files = Array.from(clipboardData.files ?? []).filter((file) => file.size > 0);
      if (files.length > 0 && latestNoteSourcePathRef.current) {
        try {
          const uploaded = await uploadMarkdownEditorFiles(latestNoteSourcePathRef.current, files);
          if (uploaded.length === 0) {
            return;
          }

          const insertions = buildMarkdownEditorFileInsertions(latestNoteSourcePathRef.current, uploaded);
          const selection = view.state.selection.main;
          view.dispatch({
            changes: { from: selection.from, to: selection.to, insert: `${insertions}\n` },
            selection: EditorSelection.cursor(selection.from + insertions.length + 1),
          });
        } catch {
          return;
        }
        return;
      }

      const text = clipboardData.getData("text/plain").trim();
      if (!text) {
        return;
      }

      const selection = view.state.selection.main;
      const selectedText = view.state.doc.sliceString(selection.from, selection.to);
      const tableInsert = buildMarkdownTableFromTsv(text);
      if (tableInsert) {
        view.dispatch({
          changes: { from: selection.from, to: selection.to, insert: tableInsert },
          selection: EditorSelection.cursor(selection.from + tableInsert.length),
        });
        return;
      }

      if (isUrl(text)) {
        if (isEmbedDirectivePasteTarget(view.state.doc.toString(), selection.from, selection.to)) {
          return;
        }

        const insert = buildMarkdownUrlPasteInsertion({
          url: text,
          selectedText,
          useStandalonePreview: shouldUseStandaloneUrlPreview(view.state.doc.toString(), selection.from, selection.to),
        });
        if (!insert) {
          return;
        }

        view.dispatch({
          changes: { from: selection.from, to: selection.to, insert: insert.insert },
          selection: EditorSelection.cursor(selection.from + insert.insert.length),
        });
      }
    }

    const wikiLinkDiagnostics = linter((view) => {
      const validTargets = new Set(buildWikiTargets(latestNotesRef.current).map((target) => target.toLowerCase()));
      return findWikiLinkMatches(view.state.doc.toString())
        .filter((match) => !validTargets.has(match.label.toLowerCase()))
        .map((match) => ({
          from: match.from,
          to: match.to,
          severity: "warning" as const,
          message: `Linked note \"${match.label}\" does not exist.`,
          actions: latestOnCreateMissingNoteRef.current
            ? [{
              name: `Create \"${match.label}\"`,
              apply() {
                latestOnCreateMissingNoteRef.current?.(match.label);
              },
            }]
            : [],
        }));
    });

    const wikiHoverTooltip = hoverTooltip((view, pos) => {
      const match = getWikiLinkAtOffset(view.state.doc.toString(), pos);
      if (!match) {
        return null;
      }

      const note = buildWikiNoteLookup(latestNotesRef.current).get(match.label.toLowerCase());
      if (!note) {
        return null;
      }

      return {
        pos: match.from,
        end: match.to,
        above: true,
        create() {
          return { dom: buildTooltipPreview(note) };
        },
      };
    });

    const customKeymap = keymap.of([
      {
        key: "Escape",
        run(view) {
          return closeCompletion(view);
        },
      },
      {
        key: "Mod-Shift-p",
        preventDefault: true,
        run() {
          latestKeyCommandsRef.current.openActionPalette();
          return true;
        },
      },
      {
        key: "Mod-Alt-p",
        preventDefault: true,
        run() {
          latestKeyCommandsRef.current.toggleFocusedPreview();
          return true;
        },
      },
      {
        key: "Mod-f",
        preventDefault: true,
        run(view) {
          openSearchPanel(view);
          return true;
        },
      },
      {
        key: "Alt-PageUp",
        preventDefault: true,
        run() {
          latestKeyCommandsRef.current.cycleRevision(-1);
          return true;
        },
      },
      {
        key: "Alt-PageDown",
        preventDefault: true,
        run() {
          latestKeyCommandsRef.current.cycleRevision(1);
          return true;
        },
      },
      {
        key: "Tab",
        preventDefault: true,
        run(view) {
          const selection = view.state.selection.main;
          if (selection.empty) {
            const nextTableCell = getTableCellNavigationTarget(view.state.doc.toString(), selection.from, 1);
            if (nextTableCell !== null) {
              view.dispatch({ selection: EditorSelection.cursor(nextTableCell), scrollIntoView: true });
              return true;
            }
          }

          const next = indentSelectedLines(view.state.doc.toString(), selection.from, selection.to);
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: next.value },
            selection: EditorSelection.range(next.selectionStart, next.selectionEnd),
          });
          return true;
        },
      },
      {
        key: "Shift-Tab",
        preventDefault: true,
        run(view) {
          const selection = view.state.selection.main;
          if (selection.empty) {
            const previousTableCell = getTableCellNavigationTarget(view.state.doc.toString(), selection.from, -1);
            if (previousTableCell !== null) {
              view.dispatch({ selection: EditorSelection.cursor(previousTableCell), scrollIntoView: true });
              return true;
            }
          }

          const next = outdentSelectedLines(view.state.doc.toString(), selection.from, selection.to);
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: next.value },
            selection: EditorSelection.range(next.selectionStart, next.selectionEnd),
          });
          return true;
        },
      },
      {
        key: "Alt-ArrowUp",
        preventDefault: true,
        run(view) {
          const selection = view.state.selection.main;
          const next = moveSelectedLines(view.state.doc.toString(), selection.from, selection.to, -1);
          if (!next) {
            return true;
          }

          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: next.value },
            selection: EditorSelection.range(next.selectionStart, next.selectionEnd),
          });
          return true;
        },
      },
      {
        key: "Alt-ArrowDown",
        preventDefault: true,
        run(view) {
          const selection = view.state.selection.main;
          const next = moveSelectedLines(view.state.doc.toString(), selection.from, selection.to, 1);
          if (!next) {
            return true;
          }

          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: next.value },
            selection: EditorSelection.range(next.selectionStart, next.selectionEnd),
          });
          return true;
        },
      },
      {
        key: "Alt-Shift-ArrowUp",
        preventDefault: true,
        run(view) {
          const selection = view.state.selection.main;
          const next = moveMarkdownSection(view.state.doc.toString(), selection.from, -1);
          if (!next) {
            return true;
          }

          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: next.markdown },
            selection: EditorSelection.range(next.selectionStart, next.selectionStart),
          });
          return true;
        },
      },
      {
        key: "Alt-Shift-ArrowDown",
        preventDefault: true,
        run(view) {
          const selection = view.state.selection.main;
          const next = moveMarkdownSection(view.state.doc.toString(), selection.from, 1);
          if (!next) {
            return true;
          }

          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: next.markdown },
            selection: EditorSelection.range(next.selectionStart, next.selectionStart),
          });
          return true;
        },
      },
      {
        key: "Mod-Shift-d",
        preventDefault: true,
        run(view) {
          const selection = view.state.selection.main;
          const next = duplicateSelectionOrLine(view.state.doc.toString(), selection.from, selection.to);
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: next.value },
            selection: EditorSelection.range(next.selectionStart, next.selectionEnd),
          });
          return true;
        },
      },
      {
        key: "Mod-Alt-1",
        preventDefault: true,
        run() {
          latestKeyCommandsRef.current.applyHeading(1);
          return true;
        },
      },
      {
        key: "Mod-Alt-2",
        preventDefault: true,
        run() {
          latestKeyCommandsRef.current.applyHeading(2);
          return true;
        },
      },
      {
        key: "Mod-Alt-3",
        preventDefault: true,
        run() {
          latestKeyCommandsRef.current.applyHeading(3);
          return true;
        },
      },
      {
        key: "Mod-Shift-8",
        preventDefault: true,
        run() {
          latestKeyCommandsRef.current.toggleList();
          return true;
        },
      },
      {
        key: "Mod-Shift-9",
        preventDefault: true,
        run() {
          latestKeyCommandsRef.current.toggleTaskList();
          return true;
        },
      },
      {
        key: "Mod-Alt-c",
        preventDefault: true,
        run() {
          latestKeyCommandsRef.current.insertCallout("note");
          return true;
        },
      },
      {
        key: "Mod-h",
        preventDefault: true,
        run(view) {
          openSearchPanel(view);
          return true;
        },
      },
    ]);

    const extensions: Extension[] = [
      highlightSpecialChars(),
      history(),
      drawSelection(),
      dropCursor(),
      highlightActiveLine(),
      EditorView.lineWrapping,
      rectangularSelection(),
      markdownLanguage(),
      search({ top: true }),
      EditorView.contentAttributes.of({ spellcheck: "true" }),
      EditorView.domEventHandlers({
        paste(event, view) {
          const clipboardData = event.clipboardData;
          if (!clipboardData) {
            return false;
          }

          const files = Array.from(clipboardData.files ?? []).filter((file) => file.size > 0);
          if (files.length > 0 && latestNoteSourcePathRef.current) {
            event.preventDefault();
            void handlePaste(event, view);
            return true;
          }

          const text = clipboardData.getData("text/plain").trim();
          if (!text) {
            return false;
          }

          const tableInsert = buildMarkdownTableFromTsv(text);
          if (tableInsert) {
            event.preventDefault();
            void handlePaste(event, view);
            return true;
          }

          if (isUrl(text)) {
            event.preventDefault();
            void handlePaste(event, view);
            return true;
          }

          return false;
        },
      }),
      autocompletion({
        activateOnTyping: true,
        closeOnBlur: false,
        defaultKeymap: false,
        icons: false,
        override: [slashCommandCompletions, wikiLinkCompletions],
      }),
      wikiLinkDiagnostics,
      wikiHoverTooltip,
      keymap.of([
        ...completionKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        ...foldKeymap,
        indentWithTab,
      ]),
      customKeymap,
      editorTheme,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          latestOnChangeRef.current(update.state.doc.toString());
        }

        if (update.selectionSet || update.docChanged) {
          latestOnSelectionChangeRef.current(update.state.selection.main.head);
        }
      }),
    ];

    const view = new EditorView({
      state: EditorState.create({ doc: latestMarkdownRef.current, extensions }),
      parent: host,
    });
    viewRef.current = view;

    const handleScroll = () => {
      latestOnScrollRef.current({
        scrollTop: view.scrollDOM.scrollTop,
        scrollHeight: view.scrollDOM.scrollHeight,
        clientHeight: view.scrollDOM.clientHeight,
      });
    };

    view.scrollDOM.addEventListener("scroll", handleScroll);
    latestOnSelectionChangeRef.current(view.state.selection.main.head);

    return () => {
      view.scrollDOM.removeEventListener("scroll", handleScroll);
      view.destroy();
      viewRef.current = null;
    };
  }, [editorTheme]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    if (view.state.doc.toString() === markdown) {
      return;
    }

    const selection = view.state.selection.main;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: markdown },
      selection: EditorSelection.range(
        Math.min(selection.from, markdown.length),
        Math.min(selection.to, markdown.length),
      ),
    });
  }, [markdown]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || hasAppliedInitialScrollRef.current) {
      return;
    }

    const maxScrollTop = Math.max(view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight, 0);
    view.scrollDOM.scrollTop = initialScrollRatio * maxScrollTop;
    hasAppliedInitialScrollRef.current = true;
  }, [initialScrollRatio]);

  return (
    <div
      className={`markdown-editor__input ${isDragOver ? "is-drag-over" : ""}`.trim()}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      ref={hostRef}
    />
  );
});

MarkdownCodeMirrorInput.displayName = "MarkdownCodeMirrorInput";