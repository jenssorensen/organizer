import type { NoteVersion } from "../../appTypes";
import { buildMarkdownDiffRows } from "./markdownEditorUtils";

export function MarkdownRevisionDiffView({
  currentContent,
  selectedVersionIndex,
  versions,
  onRestoreVersion,
  onSelectVersion,
}: {
  currentContent: string;
  selectedVersionIndex: number | null;
  versions: NoteVersion[];
  onRestoreVersion: (index: number) => void;
  onSelectVersion: (index: number) => void;
}) {
  const selectedVersion = selectedVersionIndex !== null ? versions[selectedVersionIndex] ?? null : null;
  const diffRows = selectedVersion ? buildMarkdownDiffRows(selectedVersion.content, currentContent) : [];
  const canRestoreSelectedVersion = Boolean(selectedVersion && selectedVersion.content !== currentContent);

  return (
    <div className="markdown-revision-diff">
      <aside className="markdown-revision-diff__sidebar">
        <div className="markdown-revision-diff__sidebar-header">
          <span className="status-pill subtle">Revisions</span>
          <span className="muted">{versions.length}</span>
        </div>
        <div className="markdown-revision-diff__version-list">
          {versions.length === 0 ? (
            <p className="muted">No saved revisions yet.</p>
          ) : versions.map((version, index) => (
            <button
              className={`markdown-revision-diff__version ${selectedVersionIndex === index ? "is-active" : ""}`}
              key={version.savedAt}
              onClick={() => onSelectVersion(index)}
              type="button"
            >
              <strong>{version.label}</strong>
              <span>{new Date(version.savedAt).toLocaleString()}</span>
            </button>
          ))}
        </div>
      </aside>
      <section className="markdown-revision-diff__content" aria-label="Revision diff output">
        {!selectedVersion ? (
          <div className="markdown-revision-diff__empty">
            <p>Select a revision to compare against the current draft.</p>
          </div>
        ) : (
          <div className="markdown-revision-diff__table" role="table" aria-label="Revision diff">
            <div className="markdown-revision-diff__content-header">
              <div>
                <strong>{selectedVersion.label}</strong>
                <p className="muted">Saved {new Date(selectedVersion.savedAt).toLocaleString()}</p>
              </div>
              <button
                className="mini-action"
                disabled={!canRestoreSelectedVersion}
                onClick={() => selectedVersionIndex !== null ? onRestoreVersion(selectedVersionIndex) : undefined}
                type="button"
              >
                Restore into draft
              </button>
            </div>
            <div className="markdown-revision-diff__header" role="rowgroup">
              <div className="markdown-revision-diff__row markdown-revision-diff__row--header" role="row">
                <div className="markdown-revision-diff__cell markdown-revision-diff__cell--meta" role="columnheader">Revision</div>
                <div className="markdown-revision-diff__cell" role="columnheader">Saved content</div>
                <div className="markdown-revision-diff__cell markdown-revision-diff__cell--meta" role="columnheader">Draft</div>
                <div className="markdown-revision-diff__cell" role="columnheader">Current draft</div>
              </div>
            </div>
            <div className="markdown-revision-diff__body" role="rowgroup">
              {diffRows.map((row, index) => (
                <div className={`markdown-revision-diff__row is-${row.kind}`} key={`${index}-${row.beforeLineNumber}-${row.afterLineNumber}`} role="row">
                  <div className="markdown-revision-diff__cell markdown-revision-diff__cell--meta" role="cell">{row.beforeLineNumber ?? ""}</div>
                  <pre className="markdown-revision-diff__cell markdown-revision-diff__cell--code" role="cell">{row.beforeText || " "}</pre>
                  <div className="markdown-revision-diff__cell markdown-revision-diff__cell--meta" role="cell">{row.afterLineNumber ?? ""}</div>
                  <pre className="markdown-revision-diff__cell markdown-revision-diff__cell--code" role="cell">{row.afterText || " "}</pre>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}