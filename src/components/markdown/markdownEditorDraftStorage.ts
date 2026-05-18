const MARKDOWN_EDITOR_DRAFT_KEY_PREFIX = "organizer:markdown-editor-draft:";

export type StoredMarkdownEditorDraft = {
  content: string;
  savedAt: number;
};

function getMarkdownEditorDraftKey(sourcePath: string) {
  return `${MARKDOWN_EDITOR_DRAFT_KEY_PREFIX}${sourcePath}`;
}

export function loadMarkdownEditorDraft(sourcePath: string): StoredMarkdownEditorDraft | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getMarkdownEditorDraftKey(sourcePath));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredMarkdownEditorDraft>;
    if (typeof parsed.content !== "string" || typeof parsed.savedAt !== "number") {
      return null;
    }

    return {
      content: parsed.content,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function saveMarkdownEditorDraft(sourcePath: string, content: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    getMarkdownEditorDraftKey(sourcePath),
    JSON.stringify({ content, savedAt: Date.now() } satisfies StoredMarkdownEditorDraft),
  );
}

export function clearMarkdownEditorDraft(sourcePath: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(getMarkdownEditorDraftKey(sourcePath));
}
