import type { RefObject } from "react";
import { Bold, CheckSquare2, ChevronDown, ChevronUp, IndentDecrease, Italic, Link2, List, Paintbrush, Pilcrow, Search, Sigma, TableOfContents } from "lucide-react";

import type { MarkdownEditorPopoverPosition } from "./useMarkdownEditorPopovers";

const codeBlockLanguageOptions = [
  { value: "bash", label: "Bash", iconUrl: "https://cdn.simpleicons.org/gnubash" },
  { value: "c", label: "C", iconUrl: "https://cdn.simpleicons.org/c" },
  { value: "cpp", label: "C++", iconUrl: "https://cdn.simpleicons.org/cplusplus" },
  { value: "csharp", label: "C#", iconUrl: "https://cdn.simpleicons.org/dotnet" },
  { value: "css", label: "CSS", iconUrl: "https://cdn.simpleicons.org/css" },
  { value: "go", label: "Go", iconUrl: "https://cdn.simpleicons.org/go" },
  { value: "html", label: "HTML", iconUrl: "https://cdn.simpleicons.org/html5" },
  { value: "java", label: "Java", iconUrl: "https://cdn.simpleicons.org/openjdk" },
  { value: "javascript", label: "JavaScript", iconUrl: "https://cdn.simpleicons.org/javascript" },
  { value: "json", label: "JSON", iconUrl: "https://cdn.simpleicons.org/json" },
  { value: "kotlin", label: "Kotlin", iconUrl: "https://cdn.simpleicons.org/kotlin" },
  { value: "mermaid", label: "Mermaid diagram", iconUrl: "https://cdn.simpleicons.org/mermaid" },
  { value: "php", label: "PHP", iconUrl: "https://cdn.simpleicons.org/php" },
  { value: "uml", label: "UML", iconUrl: "https://cdn.simpleicons.org/uml" },
  { value: "python", label: "Python", iconUrl: "https://cdn.simpleicons.org/python" },
  { value: "ruby", label: "Ruby", iconUrl: "https://cdn.simpleicons.org/ruby" },
  { value: "rust", label: "Rust", iconUrl: "https://cdn.simpleicons.org/rust" },
  { value: "sql", label: "SQL", iconUrl: "https://cdn.simpleicons.org/mysql" },
  { value: "swift", label: "Swift", iconUrl: "https://cdn.simpleicons.org/swift" },
  { value: "text", label: "Text", iconUrl: "https://cdn.simpleicons.org/textpattern" },
  { value: "typescript", label: "TypeScript", iconUrl: "https://cdn.simpleicons.org/typescript" },
  { value: "yaml", label: "YAML", iconUrl: "https://cdn.simpleicons.org/yaml" },
] as const;

export function MarkdownEditorFormattingToolbar({
  isBoldActive,
  isItalicActive,
  isOutlineVisible,
  isStrikeActive,
  isHeadingMenuOpen,
  isTableMenuOpen,
  isLinkEditorOpen,
  isCodeLanguagePickerOpen,
  isCursorInsideTable,
  activeDataRowNumber,
  activeColumnNumber,
  tablePickerRows,
  tablePickerCols,
  headingMenuPosition,
  tableMenuPosition,
  linkEditorPosition,
  codeLanguagePickerPosition,
  headingButtonRef,
  tableButtonRef,
  linkEditorButtonRef,
  codeLanguagePickerButtonRef,
  headingPopoverRef,
  tablePopoverRef,
  linkEditorPopoverRef,
  codeLanguagePickerPopoverRef,
  linkEditorInputRef,
  linkEditorUrl,
  onLinkEditorUrlChange,
  onToggleHeadingMenu,
  onToggleTableMenu,
  onToggleLinkEditor,
  onToggleCodeLanguagePicker,
  onApplyHeading,
  onToggleBold,
  onToggleItalic,
  onToggleStrike,
  onInsertNumberedList,
  onToggleList,
  onToggleTaskList,
  onInsertBlockquote,
  onIndent,
  onOutdent,
  onInsertImage,
  onInsertToc,
  onInsertFootnote,
  onInsertInlineCode,
  onInsertMath,
  onInsertHorizontalRule,
  onOpenFindReplace,
  onToggleOutline,
  onClearFormatting,
  onUpdateTablePicker,
  onClearTablePickerSelection,
  onInsertTable,
  onInsertTableRow,
  onRemoveTableRow,
  onInsertTableColumn,
  onRemoveTableColumn,
  onSubmitLink,
  onInsertCodeBlockWithLanguage,
}: {
  isBoldActive: boolean;
  isItalicActive: boolean;
  isOutlineVisible: boolean;
  isStrikeActive: boolean;
  isHeadingMenuOpen: boolean;
  isTableMenuOpen: boolean;
  isLinkEditorOpen: boolean;
  isCodeLanguagePickerOpen: boolean;
  isCursorInsideTable: boolean;
  activeDataRowNumber: number | null;
  activeColumnNumber: number | null;
  tablePickerRows: number;
  tablePickerCols: number;
  headingMenuPosition: MarkdownEditorPopoverPosition;
  tableMenuPosition: MarkdownEditorPopoverPosition;
  linkEditorPosition: MarkdownEditorPopoverPosition;
  codeLanguagePickerPosition: MarkdownEditorPopoverPosition;
  headingButtonRef: RefObject<HTMLButtonElement | null>;
  tableButtonRef: RefObject<HTMLButtonElement | null>;
  linkEditorButtonRef: RefObject<HTMLButtonElement | null>;
  codeLanguagePickerButtonRef: RefObject<HTMLButtonElement | null>;
  headingPopoverRef: RefObject<HTMLDivElement | null>;
  tablePopoverRef: RefObject<HTMLDivElement | null>;
  linkEditorPopoverRef: RefObject<HTMLDivElement | null>;
  codeLanguagePickerPopoverRef: RefObject<HTMLDivElement | null>;
  linkEditorInputRef: RefObject<HTMLInputElement | null>;
  linkEditorUrl: string;
  onLinkEditorUrlChange: (value: string) => void;
  onToggleHeadingMenu: () => void;
  onToggleTableMenu: () => void;
  onToggleLinkEditor: () => void;
  onToggleCodeLanguagePicker: () => void;
  onApplyHeading: (level: number) => void;
  onToggleBold: () => void;
  onToggleItalic: () => void;
  onToggleStrike: () => void;
  onInsertNumberedList: () => void;
  onToggleList: () => void;
  onToggleTaskList: () => void;
  onInsertBlockquote: () => void;
  onIndent: () => void;
  onOutdent: () => void;
  onInsertImage: () => void;
  onInsertToc: () => void;
  onInsertFootnote: () => void;
  onInsertInlineCode: () => void;
  onInsertMath: () => void;
  onInsertHorizontalRule: () => void;
  onOpenFindReplace: () => void;
  onToggleOutline: () => void;
  onClearFormatting: () => void;
  onUpdateTablePicker: (rows: number, cols: number) => void;
  onClearTablePickerSelection: () => void;
  onInsertTable: (rows: number, cols: number) => void;
  onInsertTableRow: () => void;
  onRemoveTableRow: () => void;
  onInsertTableColumn: () => void;
  onRemoveTableColumn: () => void;
  onSubmitLink: () => void;
  onInsertCodeBlockWithLanguage: (language: string) => void;
}) {
  return (
    <>
      <div aria-label="Markdown formatting" className="markdown-format-toolbar" role="toolbar">
        <button
          ref={headingButtonRef}
          className={`markdown-format-toolbar__button ${isHeadingMenuOpen ? "is-active" : ""}`}
          onClick={onToggleHeadingMenu}
          title="Heading"
          type="button"
        >
          H
        </button>
        <button aria-label="Make it bold" className={`markdown-format-toolbar__button ${isBoldActive ? "is-active" : ""}`} onClick={onToggleBold} title="Make it bold" type="button"><Bold size={14} /></button>
        <button aria-label="Make it italic" className={`markdown-format-toolbar__button ${isItalicActive ? "is-active" : ""}`} onClick={onToggleItalic} title="Make it italic" type="button"><Italic size={14} /></button>
        <button aria-label="Make it strike through" className={`markdown-format-toolbar__button ${isStrikeActive ? "is-active" : ""}`} onClick={onToggleStrike} title="Make it strike through" type="button"><span className="markdown-format-toolbar__glyph-strike">A</span></button>
        <span aria-hidden="true" className="markdown-format-toolbar__separator" />
        <button className="markdown-format-toolbar__button" onClick={onInsertNumberedList} title="Numbered list" type="button">1.</button>
        <button className="markdown-format-toolbar__button" onClick={onToggleList} title="Toggle list" type="button"><List size={14} /></button>
        <button className="markdown-format-toolbar__button" onClick={onToggleTaskList} title="Task list" type="button"><CheckSquare2 size={14} /></button>
        <button className="markdown-format-toolbar__button" onClick={onInsertBlockquote} title="Blockquote" type="button">&gt;</button>
        <button className="markdown-format-toolbar__button" onClick={onIndent} title="Indent" type="button">⇥</button>
        <button className="markdown-format-toolbar__button" onClick={onOutdent} title="Outdent" type="button"><IndentDecrease size={14} /></button>
        <span aria-hidden="true" className="markdown-format-toolbar__separator" />
        <button
          ref={tableButtonRef}
          className={`markdown-format-toolbar__button ${isTableMenuOpen ? "is-active" : ""}`}
          onClick={onToggleTableMenu}
          title="Table"
          type="button"
        >
          ⊞
        </button>
        <button
          ref={linkEditorButtonRef}
          className={`markdown-format-toolbar__button ${isLinkEditorOpen ? "is-active" : ""}`}
          onClick={onToggleLinkEditor}
          title="Link with URL"
          type="button"
        >
          <Link2 size={14} />
        </button>
        <button className="markdown-format-toolbar__button" onClick={onInsertImage} title="Image" type="button">IMG</button>
        <button className="markdown-format-toolbar__button" onClick={onOpenFindReplace} title="Find and replace" type="button"><Search size={14} /></button>
        <button className="markdown-format-toolbar__button" onClick={onInsertToc} title="Insert table of contents" type="button"><TableOfContents size={14} /></button>
        <button className="markdown-format-toolbar__button" onClick={onInsertFootnote} title="Footnote" type="button"><Pilcrow size={14} /></button>
        <span aria-hidden="true" className="markdown-format-toolbar__separator" />
        <button className="markdown-format-toolbar__button" onClick={onInsertInlineCode} title="Inline code" type="button">&lt;/&gt;</button>
        <button
          ref={codeLanguagePickerButtonRef}
          className={`markdown-format-toolbar__button ${isCodeLanguagePickerOpen ? "is-active" : ""}`}
          onClick={onToggleCodeLanguagePicker}
          title="Code block"
          type="button"
        >
          CB
        </button>
        <button className="markdown-format-toolbar__button" onClick={onInsertMath} title="Inline math" type="button"><Sigma size={14} /></button>
        <span aria-hidden="true" className="markdown-format-toolbar__separator" />
        <button className="markdown-format-toolbar__button" onClick={onInsertHorizontalRule} title="Horizontal rule" type="button">---</button>
        <span aria-hidden="true" className="markdown-format-toolbar__separator" />
        <span aria-hidden="true" className="markdown-format-toolbar__spacer" />
        <button className="markdown-format-toolbar__button" onClick={onClearFormatting} title="Clear formatting" type="button"><Paintbrush size={14} /></button>
        <button
          aria-label={isOutlineVisible ? "Hide outline" : "Show outline"}
          className={`markdown-format-toolbar__button markdown-format-toolbar__button--outline ${isOutlineVisible ? "is-active" : ""}`.trim()}
          onClick={onToggleOutline}
          title={isOutlineVisible ? "Hide outline" : "Show outline"}
          type="button"
        >
          {isOutlineVisible ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
      {isHeadingMenuOpen ? (
        <div
          className="markdown-toolbar-popover markdown-toolbar-popover--heading"
          ref={headingPopoverRef}
          style={{ left: headingMenuPosition.left, top: headingMenuPosition.top }}
        >
          {[1, 2, 3, 4, 5, 6].map((level) => (
            <button className="markdown-toolbar-popover__option" key={level} onClick={() => onApplyHeading(level)} title={`Apply heading ${level}`} type="button">
              {`${"#".repeat(level)} Heading ${level}`}
            </button>
          ))}
        </div>
      ) : null}
      {isTableMenuOpen ? (
        <div
          className="markdown-toolbar-popover markdown-toolbar-popover--table"
          ref={tablePopoverRef}
          style={{ left: tableMenuPosition.left, top: tableMenuPosition.top }}
        >
          <p className="markdown-toolbar-popover__label">
            {isCursorInsideTable
              ? `Table selected - row ${activeDataRowNumber}, column ${activeColumnNumber}`
              : tablePickerRows > 0 && tablePickerCols > 0
                ? `${tablePickerRows} x ${tablePickerCols}`
                : "Select table size"}
          </p>
          <div className={`markdown-table-picker-grid ${isCursorInsideTable ? "is-disabled" : ""}`} onMouseLeave={onClearTablePickerSelection}>
            {Array.from({ length: 8 }, (_, rowIndex) => (
              <div className="markdown-table-picker-grid__row" key={`row-${rowIndex + 1}`}>
                {Array.from({ length: 8 }, (_, colIndex) => {
                  const row = rowIndex + 1;
                  const col = colIndex + 1;
                  const isActive = row <= tablePickerRows && col <= tablePickerCols;

                  return (
                    <button
                      className={`markdown-table-picker-grid__cell ${isActive ? "is-active" : ""}`}
                      disabled={isCursorInsideTable}
                      key={`cell-${row}-${col}`}
                      onClick={() => onInsertTable(row, col)}
                      onMouseEnter={() => {
                        if (!isCursorInsideTable) {
                          onUpdateTablePicker(row, col);
                        }
                      }}
                      title={isCursorInsideTable ? "Move cursor outside table to insert a new table" : `${row} x ${col}`}
                      type="button"
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div className="markdown-toolbar-popover__table-actions">
            <button aria-label="Add Row" className="markdown-toolbar-popover__table-action-button" disabled={!isCursorInsideTable} onClick={onInsertTableRow} title="Add Row" type="button">+R</button>
            <button aria-label="Remove Row" className="markdown-toolbar-popover__table-action-button" disabled={!isCursorInsideTable} onClick={onRemoveTableRow} title="Remove Row" type="button">-R</button>
            <button aria-label="Add Column" className="markdown-toolbar-popover__table-action-button" disabled={!isCursorInsideTable} onClick={onInsertTableColumn} title="Add Column" type="button">+C</button>
            <button aria-label="Remove Column" className="markdown-toolbar-popover__table-action-button" disabled={!isCursorInsideTable} onClick={onRemoveTableColumn} title="Remove Column" type="button">-C</button>
          </div>
        </div>
      ) : null}
      {isLinkEditorOpen ? (
        <div
          className="markdown-toolbar-popover markdown-toolbar-popover--link-editor"
          ref={linkEditorPopoverRef}
          style={{ left: linkEditorPosition.left, top: linkEditorPosition.top }}
        >
          <div className="markdown-link-editor">
            <input
              ref={linkEditorInputRef}
              className="markdown-link-editor__input"
              onChange={(event) => onLinkEditorUrlChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onSubmitLink();
                }
              }}
              placeholder="https://example.com"
              type="url"
              value={linkEditorUrl}
            />
            <button className="markdown-link-editor__button" onClick={onSubmitLink} title="Insert link" type="button">Insert</button>
          </div>
        </div>
      ) : null}
      {isCodeLanguagePickerOpen ? (
        <div
          className="markdown-toolbar-popover markdown-toolbar-popover--code-languages"
          ref={codeLanguagePickerPopoverRef}
          style={{ left: codeLanguagePickerPosition.left, top: codeLanguagePickerPosition.top }}
        >
          {codeBlockLanguageOptions.map((languageOption) => (
            <button className="markdown-toolbar-popover__option markdown-toolbar-popover__option--language" key={languageOption.value} onClick={() => onInsertCodeBlockWithLanguage(languageOption.value)} title={`Code block: ${languageOption.label}`} type="button">
              <img alt="" aria-hidden="true" className="markdown-language-icon" loading="lazy" src={languageOption.iconUrl} />
              <span>{languageOption.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}