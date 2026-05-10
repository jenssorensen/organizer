import { useState, type RefObject, type UIEvent } from "react";

type TableCursorContext = {
  blockStart: number;
  blockEnd: number;
  blockLines: string[];
  tableStartLine: number;
  tableLines: string[];
  activeTableLine: number;
  activeCol: number;
  columnCount: number;
};

type SelectionTransformResult = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

type SelectionTransformContext = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  selectedText: string;
};

export function toggleWrapSelectionInMarkdown({
  value,
  selectionStart,
  selectionEnd,
  prefix,
  suffix,
  placeholder,
}: {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  prefix: string;
  suffix: string;
  placeholder: string;
}) {
  const selectedText = value.slice(selectionStart, selectionEnd);
  const hasWrappedSelection =
    selectedText.length >= prefix.length + suffix.length
    && selectedText.startsWith(prefix)
    && selectedText.endsWith(suffix);

  if (hasWrappedSelection) {
    const unwrapped = selectedText.slice(prefix.length, selectedText.length - suffix.length);
    return {
      value: value.slice(0, selectionStart) + unwrapped + value.slice(selectionEnd),
      selectionStart,
      selectionEnd: selectionStart + unwrapped.length,
    };
  }

  const hasWrappedAroundSelection =
    selectionStart >= prefix.length
    && selectionEnd + suffix.length <= value.length
    && value.slice(selectionStart - prefix.length, selectionStart) === prefix
    && value.slice(selectionEnd, selectionEnd + suffix.length) === suffix;

  if (hasWrappedAroundSelection) {
    const wrappedStart = selectionStart - prefix.length;
    const wrappedEnd = selectionEnd + suffix.length;
    const unwrapped = value.slice(selectionStart, selectionEnd);
    return {
      value: value.slice(0, wrappedStart) + unwrapped + value.slice(wrappedEnd),
      selectionStart: wrappedStart,
      selectionEnd: wrappedStart + unwrapped.length,
    };
  }

  const before = value.slice(0, selectionStart);
  const after = value.slice(selectionEnd);
  const content = selectedText || placeholder;
  const nextValue = `${before}${prefix}${content}${suffix}${after}`;
  const contentStart = selectionStart + prefix.length;
  const contentEnd = contentStart + content.length;

  return {
    value: nextValue,
    selectionStart: selectedText ? selectionStart : contentStart,
    selectionEnd: selectedText ? selectionEnd + prefix.length + suffix.length : contentEnd,
  };
}

export function insertLinkWithUrlInMarkdown({
  value,
  selectionStart,
  selectionEnd,
  url,
}: {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  url: string;
}) {
  const selectedText = value.slice(selectionStart, selectionEnd);
  const before = value.slice(0, selectionStart);
  const after = value.slice(selectionEnd);
  const linkText = selectedText || "link text";
  return {
    value: `${before}[${linkText}](${url})${after}`,
    selectionStart,
    selectionEnd: selectionStart + linkText.length + 3 + url.length + 2,
  };
}

export function buildMarkdownTable(rows: number, cols: number) {
  const clampedRows = Math.max(1, rows);
  const clampedCols = Math.max(1, cols);
  const header = `| ${Array.from({ length: clampedCols }, (_, index) => `Column ${index + 1}`).join(" | ")} |`;
  const divider = `| ${Array.from({ length: clampedCols }, () => "---").join(" | ")} |`;
  const body = Array.from({ length: clampedRows }, () => `| ${Array.from({ length: clampedCols }, () => " ").join(" | ")} |`).join("\n");
  return `\n${header}\n${divider}\n${body}\n`;
}

function parseRowCells(line: string) {
  let normalized = line.trim();
  if (normalized.startsWith("|")) normalized = normalized.slice(1);
  if (normalized.endsWith("|")) normalized = normalized.slice(0, -1);
  return normalized.split("|").map((cell) => cell.trim());
}

function formatRowCells(cells: string[]) {
  return `| ${cells.join(" | ")} |`;
}

function formatDivider(columnCount: number) {
  return `| ${Array.from({ length: columnCount }, () => "---").join(" | ")} |`;
}

function getTableCursorContext(value: string, selectionStart: number): TableCursorContext | null {
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const lineEndIndex = value.indexOf("\n", selectionStart);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const currentLine = value.slice(lineStart, lineEnd);
  if (!currentLine.includes("|")) {
    return null;
  }

  let blockStart = lineStart;
  let blockEnd = lineEnd;

  while (blockStart > 0) {
    const previousLineEnd = blockStart - 1;
    const previousLineStart = value.lastIndexOf("\n", previousLineEnd - 1) + 1;
    const previousLine = value.slice(previousLineStart, previousLineEnd);
    if (!previousLine.includes("|")) {
      break;
    }
    blockStart = previousLineStart;
  }

  while (blockEnd < value.length) {
    const nextLineStart = blockEnd + 1;
    const nextLineEndIndex = value.indexOf("\n", nextLineStart);
    const nextLineEnd = nextLineEndIndex === -1 ? value.length : nextLineEndIndex;
    const nextLine = value.slice(nextLineStart, nextLineEnd);
    if (!nextLine.includes("|")) {
      break;
    }
    blockEnd = nextLineEnd;
  }

  const blockText = value.slice(blockStart, blockEnd);
  const blockLines = blockText.split("\n");
  const dividerRegex = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;
  const dividerLine = blockLines.findIndex((line) => dividerRegex.test(line));
  if (dividerLine <= 0) {
    return null;
  }

  const tableStartLine = dividerLine - 1;
  const tableLines = blockLines.slice(tableStartLine);
  const headerCells = parseRowCells(tableLines[0]);
  const columnCount = Math.max(1, headerCells.length);

  const currentBlockLine = value.slice(blockStart, lineStart).split("\n").length - 1;
  const activeTableLine = Math.min(Math.max(currentBlockLine - tableStartLine, 0), tableLines.length - 1);

  const currentLineText = blockLines[currentBlockLine] ?? "";
  const cursorOffsetInLine = selectionStart - lineStart;
  const beforeCursor = currentLineText.slice(0, Math.max(0, cursorOffsetInLine));
  const pipeCount = (beforeCursor.match(/\|/g) ?? []).length;
  const startsWithPipe = currentLineText.trimStart().startsWith("|");
  const activeCol = Math.min(Math.max((startsWithPipe ? pipeCount - 1 : pipeCount), 0), columnCount - 1);

  return {
    blockStart,
    blockEnd,
    blockLines,
    tableStartLine,
    tableLines,
    activeTableLine,
    activeCol,
    columnCount,
  };
}

function replaceTableBlock(value: string, context: TableCursorContext, nextTableLines: string[], selectionStart: number) {
  const nextBlockLines = [
    ...context.blockLines.slice(0, context.tableStartLine),
    ...nextTableLines,
  ];
  const nextBlock = nextBlockLines.join("\n");
  const nextValue = value.slice(0, context.blockStart) + nextBlock + value.slice(context.blockEnd);
  const safeCursor = Math.min(context.blockStart + nextBlock.length, selectionStart);
  return {
    value: nextValue,
    selectionStart: safeCursor,
    selectionEnd: safeCursor,
  };
}

export function insertTableRowBelowCursorInMarkdown(value: string, selectionStart: number, selectionEnd: number) {
  const context = getTableCursorContext(value, selectionStart);
  if (!context) {
    return { value, selectionStart, selectionEnd };
  }

  const header = parseRowCells(context.tableLines[0]);
  const dataRows = context.tableLines.slice(2).map((line) => {
    const cells = parseRowCells(line);
    return Array.from({ length: context.columnCount }, (_, index) => cells[index] ?? " ");
  });

  const insertIndex = context.activeTableLine <= 1 ? 0 : Math.min(context.activeTableLine - 1, dataRows.length);
  dataRows.splice(insertIndex, 0, Array.from({ length: context.columnCount }, () => " "));

  return replaceTableBlock(value, context, [
    formatRowCells(header),
    formatDivider(context.columnCount),
    ...dataRows.map((row) => formatRowCells(row)),
  ], selectionStart);
}

export function removeTableColumnAtCursorInMarkdown(value: string, selectionStart: number, selectionEnd: number) {
  const context = getTableCursorContext(value, selectionStart);
  if (!context || context.columnCount <= 1) {
    return { value, selectionStart, selectionEnd };
  }

  const header = Array.from({ length: context.columnCount }, (_, index) => parseRowCells(context.tableLines[0])[index] ?? `Column ${index + 1}`);
  const dataRows = context.tableLines.slice(2).map((line) => {
    const cells = parseRowCells(line);
    return Array.from({ length: context.columnCount }, (_, index) => cells[index] ?? " ");
  });

  const removeCol = Math.min(context.activeCol, context.columnCount - 1);
  header.splice(removeCol, 1);
  dataRows.forEach((row) => row.splice(removeCol, 1));

  return replaceTableBlock(value, context, [
    formatRowCells(header),
    formatDivider(context.columnCount - 1),
    ...dataRows.map((row) => formatRowCells(row)),
  ], selectionStart);
}

export function useMarkdownEditorFormatting({
  markdown,
  onChange,
  editorInputRef,
}: {
  markdown: string;
  onChange: (value: string) => void;
  editorInputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [editorSelection, setEditorSelection] = useState(0);
  const [tablePickerRows, setTablePickerRows] = useState(2);
  const [tablePickerCols, setTablePickerCols] = useState(2);

  function commitEditorValue(nextValue: string, nextSelectionStart: number, nextSelectionEnd: number) {
    onChange(nextValue);

    window.requestAnimationFrame(() => {
      const editor = editorInputRef.current;
      if (!editor) {
        return;
      }

      editor.focus();
      editor.setSelectionRange(nextSelectionStart, nextSelectionEnd);
      setEditorSelection(nextSelectionEnd);
    });
  }

  function withSelection(transform: (context: SelectionTransformContext) => SelectionTransformResult | null) {
    const editor = editorInputRef.current;
    if (!editor) {
      return;
    }

    const selectionStart = editor.selectionStart;
    const selectionEnd = editor.selectionEnd;
    const selectedText = markdown.slice(selectionStart, selectionEnd);
    const next = transform({ value: markdown, selectionStart, selectionEnd, selectedText });
    if (!next) {
      return;
    }

    commitEditorValue(next.value, next.selectionStart, next.selectionEnd);
  }

  function wrapSelection(prefix: string, suffix: string, placeholder: string) {
    withSelection(({ value, selectionStart, selectionEnd, selectedText }) => {
      const before = value.slice(0, selectionStart);
      const after = value.slice(selectionEnd);
      const content = selectedText || placeholder;
      const nextValue = `${before}${prefix}${content}${suffix}${after}`;
      const contentStart = selectionStart + prefix.length;
      const contentEnd = contentStart + content.length;

      return {
        value: nextValue,
        selectionStart: selectedText ? selectionStart : contentStart,
        selectionEnd: selectedText ? selectionEnd + prefix.length + suffix.length : contentEnd,
      };
    });
  }

  function toggleWrapSelection(prefix: string, suffix: string, placeholder: string) {
    withSelection(({ value, selectionStart, selectionEnd }) => {
      return toggleWrapSelectionInMarkdown({ value, selectionStart, selectionEnd, prefix, suffix, placeholder });
    });
  }

  function isSelectionWrapped(prefix: string, suffix: string) {
    const editor = editorInputRef.current;
    if (!editor) {
      return false;
    }

    const selectionStart = editor.selectionStart;
    const selectionEnd = editor.selectionEnd;
    const selectedText = markdown.slice(selectionStart, selectionEnd);

    if (
      selectedText.length >= prefix.length + suffix.length
      && selectedText.startsWith(prefix)
      && selectedText.endsWith(suffix)
    ) {
      return true;
    }

    return (
      selectionStart >= prefix.length
      && selectionEnd + suffix.length <= markdown.length
      && markdown.slice(selectionStart - prefix.length, selectionStart) === prefix
      && markdown.slice(selectionEnd, selectionEnd + suffix.length) === suffix
    );
  }

  function prefixSelectedLines(prefixBuilder: (lineIndex: number) => string) {
    withSelection(({ value, selectionStart, selectionEnd }) => {
      const blockStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
      const blockEndIndex = value.indexOf("\n", selectionEnd);
      const blockEnd = blockEndIndex === -1 ? value.length : blockEndIndex;
      const selectedBlock = value.slice(blockStart, blockEnd);
      const lines = selectedBlock.split("\n");
      const prefixedLines = lines.map((line, index) => `${prefixBuilder(index)}${line}`);
      const nextBlock = prefixedLines.join("\n");
      const nextValue = value.slice(0, blockStart) + nextBlock + value.slice(blockEnd);

      return {
        value: nextValue,
        selectionStart: blockStart,
        selectionEnd: blockStart + nextBlock.length,
      };
    });
  }

  function insertAtCursor(snippet: string, cursorOffset = snippet.length) {
    withSelection(({ value, selectionStart, selectionEnd }) => {
      const before = value.slice(0, selectionStart);
      const after = value.slice(selectionEnd);
      const nextValue = `${before}${snippet}${after}`;
      const nextCursor = selectionStart + cursorOffset;

      return {
        value: nextValue,
        selectionStart: nextCursor,
        selectionEnd: nextCursor,
      };
    });
  }

  function toggleTaskLists() {
    withSelection(({ value, selectionStart, selectionEnd }) => {
      const blockStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
      const blockEndIndex = value.indexOf("\n", selectionEnd);
      const blockEnd = blockEndIndex === -1 ? value.length : blockEndIndex;
      const selectedBlock = value.slice(blockStart, blockEnd);
      const lines = selectedBlock.split("\n");

      const toggledLines = lines.map((line) => {
        const taskCheckMatch = line.match(/^(\s*[-*])\s\[([ x])\]\s/);
        const bulletMatch = line.match(/^(\s*[-*])\s/);

        if (taskCheckMatch) {
          const isChecked = taskCheckMatch[2] === "x";
          return line.replace(/\s\[([ x])\]\s/, ` [${isChecked ? " " : "x"}] `);
        }

        if (bulletMatch) {
          return line.replace(bulletMatch[0], `${bulletMatch[1]} [ ] `);
        }

        return `- [ ] ${line}`;
      });

      const nextBlock = toggledLines.join("\n");
      const nextValue = value.slice(0, blockStart) + nextBlock + value.slice(blockEnd);

      return {
        value: nextValue,
        selectionStart: blockStart,
        selectionEnd: blockStart + nextBlock.length,
      };
    });
  }

  function toggleListMarkers() {
    withSelection(({ value, selectionStart, selectionEnd }) => {
      const blockStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
      const blockEndIndex = value.indexOf("\n", selectionEnd);
      const blockEnd = blockEndIndex === -1 ? value.length : blockEndIndex;
      const selectedBlock = value.slice(blockStart, blockEnd);
      const lines = selectedBlock.split("\n");

      const isBulletList = lines.some((line) => /^\s*[-*]\s/.test(line));
      const isNumberedList = lines.some((line) => /^\s*\d+\.\s/.test(line));

      const toggledLines = lines.map((line) => {
        if (isBulletList || isNumberedList) {
          return line.replace(/^(\s*)[-*]\s|^(\s*)\d+\.\s/, "$1$2");
        }
        return line.replace(/^(\s*)/, "$1- ");
      });

      const nextBlock = toggledLines.join("\n");
      const nextValue = value.slice(0, blockStart) + nextBlock + value.slice(blockEnd);

      return {
        value: nextValue,
        selectionStart: blockStart,
        selectionEnd: blockStart + nextBlock.length,
      };
    });
  }

  function clearFormatting() {
    withSelection(({ value, selectionStart, selectionEnd, selectedText }) => {
      const cleaned = selectedText
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/__(.*?)__/g, "$1")
        .replace(/\*(.*?)\*/g, "$1")
        .replace(/_(.*?)_/g, "$1")
        .replace(/~~(.*?)~~/g, "$1")
        .replace(/`(.*?)`/g, "$1");

      const nextValue = value.slice(0, selectionStart) + cleaned + value.slice(selectionEnd);

      return {
        value: nextValue,
        selectionStart,
        selectionEnd: selectionStart + cleaned.length,
      };
    });
  }

  function insertLinkWithUrl(url: string) {
    withSelection(({ value, selectionStart, selectionEnd }) => {
      return insertLinkWithUrlInMarkdown({ value, selectionStart, selectionEnd, url });
    });
  }

  function insertCodeBlockWithLanguage(language: string) {
    if (language === "mermaid") {
      const snippet = "\n```mermaid\nsequenceDiagram\n\n```\n";
      insertAtCursor(snippet, "\n```mermaid\nsequenceDiagram".length);
      return;
    }

    insertAtCursor(`\n\`\`\`${language}\n\n\`\`\`\n`, 4 + language.length);
  }

  function applyHeading(level: number) {
    prefixSelectedLines(() => `${"#".repeat(level)} `);
  }

  function outdentSelectedLines() {
    withSelection(({ value, selectionStart, selectionEnd }) => {
      const blockStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
      const blockEndIndex = value.indexOf("\n", selectionEnd);
      const blockEnd = blockEndIndex === -1 ? value.length : blockEndIndex;
      const lines = value.slice(blockStart, blockEnd).split("\n");
      const outdented = lines.map((line) => line.startsWith("    ") ? line.slice(4) : line.startsWith("  ") ? line.slice(2) : line.startsWith("\t") ? line.slice(1) : line);
      const nextBlock = outdented.join("\n");
      const nextValue = value.slice(0, blockStart) + nextBlock + value.slice(blockEnd);
      return { value: nextValue, selectionStart: blockStart, selectionEnd: blockStart + nextBlock.length };
    });
  }

  function insertMath() {
    withSelection(({ value, selectionStart, selectionEnd, selectedText }) => {
      const before = value.slice(0, selectionStart);
      const after = value.slice(selectionEnd);
      const inner = selectedText || "expression";
      const nextValue = `${before}$${inner}$${after}`;
      return { value: nextValue, selectionStart: selectionStart + 1, selectionEnd: selectionStart + 1 + inner.length };
    });
  }

  function insertFootnote() {
    withSelection(({ value, selectionEnd }) => {
      const existingRefs = [...value.matchAll(/\[\^(\d+)\]/g)].map((match) => Number(match[1]));
      const nextNum = existingRefs.length > 0 ? Math.max(...existingRefs) + 1 : 1;
      const ref = `[^${nextNum}]`;
      const definition = `\n[^${nextNum}]: `;
      const before = value.slice(0, selectionEnd);
      const after = value.slice(selectionEnd);
      const nextValue = `${before}${ref}${after}${definition}`;
      const refEnd = selectionEnd + ref.length;
      return { value: nextValue, selectionStart: refEnd, selectionEnd: refEnd };
    });
  }

  function insertToc() {
    withSelection(({ value }) => {
      const headingLines = value.split("\n").filter((line) => /^#{1,6} /.test(line));
      if (headingLines.length === 0) {
        return null;
      }

      const minLevel = Math.min(...headingLines.map((line) => line.match(/^(#{1,6})/)?.[1].length ?? 1));

      const tocLines = headingLines.map((line) => {
        const match = line.match(/^(#{1,6}) (.+)$/);
        if (!match) {
          return null;
        }

        const level = match[1].length;
        const title = match[2].trim();
        const anchor = title.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
        const indent = "  ".repeat(level - minLevel);
        return `${indent}- [${title}](#${anchor})`;
      }).filter(Boolean);

      const tocBlock = `## Table of Contents\n\n${tocLines.join("\n")}\n\n`;
      const nextValue = tocBlock + value;
      return { value: nextValue, selectionStart: 0, selectionEnd: 0 };
    });
  }

  function insertTable(rows: number, cols: number) {
    insertAtCursor(buildMarkdownTable(rows, cols));
  }

  function updateTablePicker(rows: number, cols: number) {
    setTablePickerRows(rows);
    setTablePickerCols(cols);
  }

  function clearTablePickerSelection() {
    setTablePickerRows(0);
    setTablePickerCols(0);
  }

  function insertTableRowBelowCursor() {
    withSelection(({ value, selectionStart, selectionEnd }) => {
      return insertTableRowBelowCursorInMarkdown(value, selectionStart, selectionEnd);
    });
  }

  function removeTableRowAtCursor() {
    withSelection(({ value, selectionStart, selectionEnd }) => {
      const context = getTableCursorContext(value, selectionStart);
      if (!context) {
        return { value, selectionStart, selectionEnd };
      }

      const header = parseRowCells(context.tableLines[0]);
      const dataRows = context.tableLines.slice(2).map((line) => {
        const cells = parseRowCells(line);
        return Array.from({ length: context.columnCount }, (_, index) => cells[index] ?? " ");
      });

      if (dataRows.length <= 1) {
        return { value, selectionStart, selectionEnd };
      }

      const removeIndex = context.activeTableLine <= 1 ? 0 : Math.min(context.activeTableLine - 2, dataRows.length - 1);
      dataRows.splice(removeIndex, 1);

      const nextTableLines = [
        formatRowCells(header),
        formatDivider(context.columnCount),
        ...dataRows.map((row) => formatRowCells(row)),
      ];

      return replaceTableBlock(value, context, nextTableLines, selectionStart);
    });
  }

  function insertTableColumnRightOfCursor() {
    withSelection(({ value, selectionStart, selectionEnd }) => {
      const context = getTableCursorContext(value, selectionStart);
      if (!context) {
        return { value, selectionStart, selectionEnd };
      }

      const header = Array.from({ length: context.columnCount }, (_, index) => parseRowCells(context.tableLines[0])[index] ?? `Column ${index + 1}`);
      const dataRows = context.tableLines.slice(2).map((line) => {
        const cells = parseRowCells(line);
        return Array.from({ length: context.columnCount }, (_, index) => cells[index] ?? " ");
      });

      const insertCol = Math.min(context.activeCol + 1, context.columnCount);
      header.splice(insertCol, 0, `Column ${context.columnCount + 1}`);
      dataRows.forEach((row) => row.splice(insertCol, 0, " "));

      const nextColumnCount = context.columnCount + 1;
      const nextTableLines = [
        formatRowCells(header),
        formatDivider(nextColumnCount),
        ...dataRows.map((row) => formatRowCells(row)),
      ];

      return replaceTableBlock(value, context, nextTableLines, selectionStart);
    });
  }

  function removeTableColumnAtCursor() {
    withSelection(({ value, selectionStart, selectionEnd }) => {
      return removeTableColumnAtCursorInMarkdown(value, selectionStart, selectionEnd);
    });
  }

  function handleEditorCursorActivity(event: UIEvent<HTMLTextAreaElement>) {
    setEditorSelection(event.currentTarget.selectionStart);
  }

  const cursorTableContext = getTableCursorContext(markdown, editorSelection);
  const isCursorInsideTable = Boolean(cursorTableContext);
  const activeDataRowNumber = cursorTableContext ? Math.max(cursorTableContext.activeTableLine - 1, 1) : null;
  const activeColumnNumber = cursorTableContext ? cursorTableContext.activeCol + 1 : null;

  return {
    editorSelection,
    setEditorSelection,
    tablePickerRows,
    tablePickerCols,
    isBoldActive: isSelectionWrapped("**", "**"),
    isItalicActive: isSelectionWrapped("*", "*"),
    isStrikeActive: isSelectionWrapped("~~", "~~"),
    isCursorInsideTable,
    activeDataRowNumber,
    activeColumnNumber,
    wrapSelection,
    toggleWrapSelection,
    toggleTaskLists,
    toggleListMarkers,
    clearFormatting,
    insertLinkWithUrl,
    insertCodeBlockWithLanguage,
    prefixSelectedLines,
    insertAtCursor,
    applyHeading,
    outdentSelectedLines,
    insertMath,
    insertFootnote,
    insertToc,
    insertTable,
    updateTablePicker,
    clearTablePickerSelection,
    insertTableRowBelowCursor,
    removeTableRowAtCursor,
    insertTableColumnRightOfCursor,
    removeTableColumnAtCursor,
    handleEditorCursorActivity,
  };
}