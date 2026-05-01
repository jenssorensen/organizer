type EditableNote = {
  kind: "note" | "wiki";
  sourcePath?: string;
} | null;

const MIN_EDITOR_SPLIT_PERCENT = 25;
const MAX_EDITOR_SPLIT_PERCENT = 75;

export function canEditNote(note: EditableNote) {
  if (!note || typeof note.sourcePath !== "string") {
    return false;
  }

  return isEditableNoteSourcePath(note.sourcePath);
}

export function isEditableNoteSourcePath(sourcePath: string) {
  return /\.md$/i.test(sourcePath) && !/^[a-z]+:\/\//i.test(sourcePath);
}

export function clampEditorSplitPercent(percent: number) {
  if (!Number.isFinite(percent)) {
    return 50;
  }

  return Math.min(MAX_EDITOR_SPLIT_PERCENT, Math.max(MIN_EDITOR_SPLIT_PERCENT, Math.round(percent)));
}

export function getSyncedPreviewScrollTop({
  sourceScrollTop,
  sourceScrollHeight,
  sourceClientHeight,
  targetScrollHeight,
  targetClientHeight,
}: {
  sourceScrollTop: number;
  sourceScrollHeight: number;
  sourceClientHeight: number;
  targetScrollHeight: number;
  targetClientHeight: number;
}) {
  const sourceScrollable = Math.max(0, sourceScrollHeight - sourceClientHeight);
  const targetScrollable = Math.max(0, targetScrollHeight - targetClientHeight);

  if (sourceScrollable === 0 || targetScrollable === 0) {
    return 0;
  }

  return Math.round((sourceScrollTop / sourceScrollable) * targetScrollable);
}

export function getPreviewScrollTopForEditorSelection({
  markdown,
  selectionStart,
  currentPreviewScrollTop,
  targetScrollHeight,
  targetClientHeight,
}: {
  markdown: string;
  selectionStart: number;
  currentPreviewScrollTop: number;
  targetScrollHeight: number;
  targetClientHeight: number;
}) {
  const targetScrollable = Math.max(0, targetScrollHeight - targetClientHeight);
  if (targetScrollable === 0) {
    return 0;
  }

  const clampedSelectionStart = Math.min(Math.max(selectionStart, 0), markdown.length);
  const lines = markdown.split("\n");
  const totalLines = Math.max(lines.length, 1);
  const activeLineIndex = markdown.slice(0, clampedSelectionStart).split("\n").length - 1;
  const activeLineRatio = totalLines <= 1 ? 0 : activeLineIndex / (totalLines - 1);
  const targetLineOffset = Math.round(activeLineRatio * targetScrollable);
  const topVisibilityMargin = Math.round(targetClientHeight * 0.2);
  const bottomVisibilityMargin = Math.round(targetClientHeight * 0.35);
  const visibleTop = currentPreviewScrollTop + topVisibilityMargin;
  const visibleBottom = currentPreviewScrollTop + targetClientHeight - bottomVisibilityMargin;

  if (targetLineOffset < visibleTop) {
    return Math.max(0, targetLineOffset - topVisibilityMargin);
  }

  if (targetLineOffset > visibleBottom) {
    return Math.min(targetScrollable, targetLineOffset - targetClientHeight + bottomVisibilityMargin);
  }

  return currentPreviewScrollTop;
}
