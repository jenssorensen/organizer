import { useState, useEffect, useId, useMemo, useRef, type CSSProperties, type ReactNode, type RefObject, type UIEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import mermaid from "mermaid";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import ReactMarkdown from "react-markdown";
import remarkEmoji from "remark-emoji";
import remarkGithubBlockquoteAlert from "remark-github-blockquote-alert";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import c from "react-syntax-highlighter/dist/esm/languages/prism/c";
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import csharp from "react-syntax-highlighter/dist/esm/languages/prism/csharp";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import kotlin from "react-syntax-highlighter/dist/esm/languages/prism/kotlin";
import php from "react-syntax-highlighter/dist/esm/languages/prism/php";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import ruby from "react-syntax-highlighter/dist/esm/languages/prism/ruby";
import swift from "react-syntax-highlighter/dist/esm/languages/prism/swift";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Bold, Check, CheckSquare2, Copy, Eye, EyeOff, Italic, Link2, List, Minus, Pencil, Plus, Trash2, SplitSquareHorizontal, SplitSquareVertical, X } from "lucide-react";
import { getMarkdownLinkAttributes } from "../markdownLinks";
import {
  clampEditorSplitPercent,
  getPreviewScrollTopForEditorSelection,
  getSyncedPreviewScrollTop,
} from "../noteEditing";
import type { UnfurlResponse } from "../types";

function resolveNoteAssetUrl(src: string, noteSourcePath: string | undefined): string {
  if (!src || !noteSourcePath) return src;
  if (/^https?:\/\/|^data:/i.test(src)) return src;
  if (src.startsWith("/")) return src;

  const noteDir = noteSourcePath.includes("/")
    ? noteSourcePath.slice(0, noteSourcePath.lastIndexOf("/"))
    : "";
  const assetPath = noteDir ? `${noteDir}/${src}` : src;
  return `/api/docs/file?path=${encodeURIComponent(assetPath)}`;
}

function PdfEmbed({ src, title }: { src: string; title?: string }) {
  return (
    <div className="markdown-pdf-embed">
      <div className="markdown-pdf-embed__header">
        <span className="status-pill subtle">PDF</span>
        <a href={src} rel="noreferrer noopener" target="_blank">{title || "Open PDF"}</a>
      </div>
      <iframe className="markdown-pdf-embed__frame" src={src} title={title || "PDF preview"} />
    </div>
  );
}

function LinkPreviewCard({ href, children }: { href: string; children: ReactNode }) {
  const [unfurl, setUnfurl] = useState<UnfurlResponse | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!href || !/^https?:\/\//i.test(href)) return;
    let cancelled = false;

    fetch(`/api/unfurl?url=${encodeURIComponent(href)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && (data.title || data.description)) {
          setUnfurl(data);
        }
        if (!cancelled) setLoaded(true);
      })
      .catch(() => { if (!cancelled) setLoaded(true); });

    return () => { cancelled = true; };
  }, [href]);

  if (!loaded || !unfurl) {
    const linkProps = getMarkdownLinkAttributes(href);
    return <a {...linkProps}>{children}</a>;
  }

  return <WikiUnfurlCard unfurl={unfurl} />;
}

const markdownSanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "details", "summary", "section", "sup", "sub", "span"],
  attributes: {
    ...defaultSchema.attributes,
    "*": [...((defaultSchema.attributes?.["*"] as string[] | undefined) ?? []), "className", "id"],
    a: [
      ...((defaultSchema.attributes?.a as string[] | undefined) ?? []),
      "ariaLabel",
      "dataFootnoteRef",
      "dataFootnoteBackref",
      "dataFootnoteBackref",
      "id",
    ],
    img: [...((defaultSchema.attributes?.img as string[] | undefined) ?? []), "loading"],
    section: [...((defaultSchema.attributes?.section as string[] | undefined) ?? []), "dataFootnotes", "className"],
    li: [...((defaultSchema.attributes?.li as string[] | undefined) ?? []), "id"],
    sup: [...((defaultSchema.attributes?.sup as string[] | undefined) ?? []), "id"],
    details: [...((defaultSchema.attributes?.details as string[] | undefined) ?? []), "open"],
  },
  protocols: {
    ...defaultSchema.protocols,
    src: [...((defaultSchema.protocols?.src as string[] | undefined) ?? []), ""],
  },
};

const markdownRemarkPlugins: any[] = [
  remarkGfm,
  remarkMath,
  remarkEmoji,
  remarkGithubBlockquoteAlert,
];

const markdownRehypePlugins: any[] = [
  rehypeRaw,
  [rehypeSanitize, markdownSanitizeSchema],
  rehypeSlug,
  [
    rehypeAutolinkHeadings,
    {
      behavior: "append",
      properties: {
        className: ["markdown-heading-anchor"],
        ariaLabel: "Link to heading",
      },
      content: {
        type: "element",
        tagName: "span",
        properties: { ariaHidden: "true" },
        children: [{ type: "text", value: "" }],
      },
    },
  ],
  rehypeKatex,
];

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

SyntaxHighlighter.registerLanguage("c", c);
SyntaxHighlighter.registerLanguage("cpp", cpp);
SyntaxHighlighter.registerLanguage("c++", cpp);
SyntaxHighlighter.registerLanguage("csharp", csharp);
SyntaxHighlighter.registerLanguage("cs", csharp);
SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("go", go);
SyntaxHighlighter.registerLanguage("golang", go);
SyntaxHighlighter.registerLanguage("html", markup);
SyntaxHighlighter.registerLanguage("markup", markup);
SyntaxHighlighter.registerLanguage("xml", markup);
SyntaxHighlighter.registerLanguage("java", java);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("js", javascript);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("kotlin", kotlin);
SyntaxHighlighter.registerLanguage("php", php);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("ruby", ruby);
SyntaxHighlighter.registerLanguage("swift", swift);
SyntaxHighlighter.registerLanguage("yaml", yaml);
SyntaxHighlighter.registerLanguage("yml", yaml);

function useResolvedTheme(): "dark" | "light" {
  const [theme, setTheme] = useState<"dark" | "light">(() => getResolvedTheme());

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const observer = new MutationObserver(() => setTheme(getResolvedTheme()));
    const handleThemeChange = () => setTheme(getResolvedTheme());

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });
    mediaQuery.addEventListener("change", handleThemeChange);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener("change", handleThemeChange);
    };
  }, []);

  return theme;
}

function getResolvedTheme(): "dark" | "light" {
  if (typeof window === "undefined") {
    return "dark";
  }

  const root = document.documentElement;
  const explicitTheme = root.dataset.theme;
  if (explicitTheme === "light" || root.classList.contains("theme-light")) {
    return "light";
  }
  if (explicitTheme === "dark" || root.classList.contains("theme-dark")) {
    return "dark";
  }

  const colorScheme = getComputedStyle(root).colorScheme;
  if (colorScheme.includes("light") && !colorScheme.includes("dark")) {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function hashString(value: string) {
  let hash = 0;

  for (const character of value) {
    hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  }

  return hash.toString(36);
}

function MarkdownFencedCodeBlock({
  code,
  language,
  theme,
}: {
  code: string;
  language: string;
  theme: "dark" | "light";
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="markdown-code-copy-shell">
      <button
        aria-label={copied ? "Copied" : "Copy code"}
        className="mini-action markdown-code-copy-button"
        onClick={() => void handleCopyCode()}
        type="button"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? "Copied" : "Copy"}
      </button>
      <SyntaxHighlighter
        PreTag="div"
        language={language}
        style={theme === "dark" ? oneDark : oneLight}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

function MarkdownContent({
  markdown,
  noteSourcePath,
  isImmersive = false,
  contentScale = 100,
  contentRef,
  omitRootWrapper = false,
  toolbarLeading,
  toolbarActions,
}: {
  markdown: string;
  noteSourcePath?: string;
  isImmersive?: boolean;
  contentScale?: number;
  contentRef?: RefObject<HTMLDivElement | null>;
  omitRootWrapper?: boolean;
  toolbarLeading?: ReactNode;
  toolbarActions?: ReactNode;
}) {
  const theme = useResolvedTheme();
  const hasToolbar = Boolean(toolbarLeading || toolbarActions);
  const contentNode = (
    <div
      className="markdown-body__content"
      ref={contentRef}
      style={{ fontSize: `${contentScale}%`, paddingTop: hasToolbar ? undefined : 0 }}
    >
      <ReactMarkdown
        rehypePlugins={markdownRehypePlugins}
        remarkPlugins={markdownRemarkPlugins}
        components={{
          a(props) {
            const { href, children } = props;
            const resolvedHref = resolveNoteAssetUrl(href ?? "", noteSourcePath);
            if (resolvedHref && /\.pdf$/i.test(resolvedHref.split("?")[0])) {
              return <PdfEmbed src={resolvedHref} title={typeof children === "string" ? children : undefined} />;
            }
            const linkProps = getMarkdownLinkAttributes(resolvedHref || href);
            return (
              <a {...linkProps}>
                {children}
              </a>
            );
          },
          p(props) {
            const { children } = props;
            const childArray = Array.isArray(children) ? children : [children];
            const nonEmpty = childArray.filter((c) => c !== "\n" && c !== "");
            if (
              nonEmpty.length === 1 &&
              nonEmpty[0] &&
              typeof nonEmpty[0] === "object" &&
              "type" in nonEmpty[0] &&
              nonEmpty[0].type === "a" &&
              nonEmpty[0].props?.href
            ) {
              const linkHref = nonEmpty[0].props.href as string;
              const linkChildren = nonEmpty[0].props.children;
              const isAutoLink = typeof linkChildren === "string" && linkChildren === linkHref;
              if (isAutoLink && /^https?:\/\//i.test(linkHref)) {
                return <LinkPreviewCard href={linkHref}>{linkChildren}</LinkPreviewCard>;
              }
            }
            return <p>{children}</p>;
          },
          img(props) {
            const { src, alt, width, height, ...rest } = props;
            const resolvedSrc = resolveNoteAssetUrl(src ?? "", noteSourcePath);
            return <img {...rest} alt={alt} height={height} loading="lazy" src={resolvedSrc} width={width} />;
          },
          code(props) {
            const { children, className } = props;
            const match = /language-([\w+-]+)/.exec(className || "");
            const code = String(children).replace(/\n$/, "");
            const language = match?.[1]?.toLowerCase() ?? "";

            if (language === "mermaid") {
              return <MermaidDiagram chart={code} theme={theme} />;
            }

            return match ? (
              <MarkdownFencedCodeBlock code={code} language={language} theme={theme} />
            ) : (
              <code className={className}>{children}</code>
            );
          },
          h2(props) {
            return <h2 {...props} />;
          },
          h3(props) {
            return <h3 {...props} />;
          },
          h4(props) {
            return <h4 {...props} />;
          },
          blockquote(props) {
            return <blockquote {...props} />;
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );

  if (omitRootWrapper) {
    return (
      <>
        {hasToolbar ? (
          <div className="markdown-body__toolbar">
            {toolbarLeading ? <div className="markdown-body__toolbar-side is-leading">{toolbarLeading}</div> : <div />}
            {toolbarActions ? <div className="markdown-body__toolbar-side is-trailing">{toolbarActions}</div> : null}
          </div>
        ) : null}
        {contentNode}
      </>
    );
  }

  return (
    <div className={`markdown-body ${isImmersive ? "is-immersive" : ""}`}>
      {hasToolbar ? (
        <div className="markdown-body__toolbar">
          {toolbarLeading ? <div className="markdown-body__toolbar-side is-leading">{toolbarLeading}</div> : <div />}
          {toolbarActions ? <div className="markdown-body__toolbar-side is-trailing">{toolbarActions}</div> : null}
        </div>
      ) : null}
      {contentNode}
    </div>
  );
}

function MarkdownEditor({
  documentPath,
  noteSourcePath,
  markdown,
  onChange,
  onCancel,
  onZoomIn,
  onZoomOut,
  onSave,
  previewContentScale = 100,
  previewLayout,
  resizePercent,
  setResizePercent,
  setPreviewLayout,
  showPreview,
  setShowPreview,
  initialScrollRatio,
  saveState,
  saveError,
}: {
  documentPath: string;
  noteSourcePath?: string;
  markdown: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onSave: () => void;
  previewContentScale?: number;
  previewLayout: "below" | "side-by-side";
  resizePercent: number;
  setResizePercent: (value: number) => void;
  setPreviewLayout: (value: "below" | "side-by-side" | ((current: "below" | "side-by-side") => "below" | "side-by-side")) => void;
  showPreview: boolean;
  setShowPreview: (value: boolean | ((current: boolean) => boolean)) => void;
  initialScrollRatio: number;
  saveState: "idle" | "saving" | "saved" | "error";
  saveError: string | null;
}) {
  const editorRootRef = useRef<HTMLDivElement>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  const editorInputRef = useRef<HTMLTextAreaElement>(null);
  const previewBodyRef = useRef<HTMLDivElement>(null);
  const hasAppliedInitialScrollRef = useRef(false);
  const [isResizing, setIsResizing] = useState(false);
  const [editorSelection, setEditorSelection] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isHeadingMenuOpen, setIsHeadingMenuOpen] = useState(false);
  const [isTableMenuOpen, setIsTableMenuOpen] = useState(false);
  const [tablePickerRows, setTablePickerRows] = useState(2);
  const [tablePickerCols, setTablePickerCols] = useState(2);
  const [isLinkEditorOpen, setIsLinkEditorOpen] = useState(false);
  const [linkEditorUrl, setLinkEditorUrl] = useState("");
  const [isCodeLanguagePickerOpen, setIsCodeLanguagePickerOpen] = useState(false);
  const [headingMenuPosition, setHeadingMenuPosition] = useState({ top: 0, left: 0 });
  const [tableMenuPosition, setTableMenuPosition] = useState({ top: 0, left: 0 });
  const [linkEditorPosition, setLinkEditorPosition] = useState({ top: 0, left: 0 });
  const [codeLanguagePickerPosition, setCodeLanguagePickerPosition] = useState({ top: 0, left: 0 });
  const headingMenuRef = useRef<HTMLDivElement>(null);
  const tableMenuRef = useRef<HTMLDivElement>(null);
  const linkEditorRef = useRef<HTMLDivElement>(null);
  const codeLanguagePickerRef = useRef<HTMLDivElement>(null);
  const headingPopoverRef = useRef<HTMLDivElement>(null);
  const tablePopoverRef = useRef<HTMLDivElement>(null);
  const linkEditorPopoverRef = useRef<HTMLDivElement>(null);
  const codeLanguagePickerPopoverRef = useRef<HTMLDivElement>(null);
  const headingButtonRef = useRef<HTMLButtonElement>(null);
  const tableButtonRef = useRef<HTMLButtonElement>(null);
  const linkEditorButtonRef = useRef<HTMLButtonElement>(null);
  const codeLanguagePickerButtonRef = useRef<HTMLButtonElement>(null);
  const linkEditorInputRef = useRef<HTMLInputElement>(null);

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

  function withSelection(transform: (context: {
    value: string;
    selectionStart: number;
    selectionEnd: number;
    selectedText: string;
  }) => {
    value: string;
    selectionStart: number;
    selectionEnd: number;
  }) {
    const editor = editorInputRef.current;
    if (!editor) {
      return;
    }

    const selectionStart = editor.selectionStart;
    const selectionEnd = editor.selectionEnd;
    const selectedText = markdown.slice(selectionStart, selectionEnd);
    const next = transform({ value: markdown, selectionStart, selectionEnd, selectedText });
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
    withSelection(({ value, selectionStart, selectionEnd, selectedText }) => {
      const hasWrappedSelection =
        selectedText.length >= prefix.length + suffix.length &&
        selectedText.startsWith(prefix) &&
        selectedText.endsWith(suffix);

      if (hasWrappedSelection) {
        const unwrapped = selectedText.slice(prefix.length, selectedText.length - suffix.length);
        const nextValue = value.slice(0, selectionStart) + unwrapped + value.slice(selectionEnd);

        return {
          value: nextValue,
          selectionStart,
          selectionEnd: selectionStart + unwrapped.length,
        };
      }

      const hasWrappedAroundSelection =
        selectionStart >= prefix.length &&
        selectionEnd + suffix.length <= value.length &&
        value.slice(selectionStart - prefix.length, selectionStart) === prefix &&
        value.slice(selectionEnd, selectionEnd + suffix.length) === suffix;

      if (hasWrappedAroundSelection) {
        const wrappedStart = selectionStart - prefix.length;
        const wrappedEnd = selectionEnd + suffix.length;
        const unwrapped = value.slice(selectionStart, selectionEnd);
        const nextValue = value.slice(0, wrappedStart) + unwrapped + value.slice(wrappedEnd);

        return {
          value: nextValue,
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
      selectedText.length >= prefix.length + suffix.length &&
      selectedText.startsWith(prefix) &&
      selectedText.endsWith(suffix)
    ) {
      return true;
    }

    return (
      selectionStart >= prefix.length &&
      selectionEnd + suffix.length <= markdown.length &&
      markdown.slice(selectionStart - prefix.length, selectionStart) === prefix &&
      markdown.slice(selectionEnd, selectionEnd + suffix.length) === suffix
    );
  }

  const isBoldActive = isSelectionWrapped("**", "**");
  const isItalicActive = isSelectionWrapped("*", "*");
  const isStrikeActive = isSelectionWrapped("~~", "~~");

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
        } else if (bulletMatch) {
          return line.replace(bulletMatch[0], `${bulletMatch[1]} [ ] `);
        } else {
          return `- [ ] ${line}`;
        }
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
        } else {
          return line.replace(/^(\s*)/, "$1- ");
        }
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
      let cleaned = selectedText
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

  function insertLinkWithUrl() {
    const url = linkEditorUrl || "https://";
    withSelection(({ value, selectionStart, selectionEnd, selectedText }) => {
      const before = value.slice(0, selectionStart);
      const after = value.slice(selectionEnd);
      const linkText = selectedText || "link text";
      const nextValue = `${before}[${linkText}](${url})${after}`;
      
      return {
        value: nextValue,
        selectionStart,
        selectionEnd: selectionStart + linkText.length + 3 + url.length + 2,
      };
    });
    setIsLinkEditorOpen(false);
    setLinkEditorUrl("");
  }

  function insertCodeBlockWithLanguage(language: string) {
    if (language === "mermaid") {
      const snippet = "\n```mermaid\nsequenceDiagram\n\n```\n";
      insertAtCursor(snippet, "\n```mermaid\nsequenceDiagram".length);
      setIsCodeLanguagePickerOpen(false);
      return;
    }

    insertAtCursor(`\n\`\`\`${language}\n\n\`\`\`\n`, 4 + language.length);
    setIsCodeLanguagePickerOpen(false);
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

  function getPopoverPosition(trigger: HTMLElement | null) {
    const root = editorRootRef.current;
    if (!root || !trigger) {
      return { top: 0, left: 0 };
    }

    const rootRect = root.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();

    return {
      top: triggerRect.bottom - rootRect.top + 8,
      left: triggerRect.left - rootRect.left,
    };
  }

  function applyHeading(level: number) {
    prefixSelectedLines(() => `${"#".repeat(level)} `);
    setIsHeadingMenuOpen(false);
  }

  function buildMarkdownTable(rows: number, cols: number) {
    const clampedRows = Math.max(1, rows);
    const clampedCols = Math.max(1, cols);
    const header = `| ${Array.from({ length: clampedCols }, (_, index) => `Column ${index + 1}`).join(" | ")} |`;
    const divider = `| ${Array.from({ length: clampedCols }, () => "---").join(" | ")} |`;
    const body = Array.from({ length: clampedRows }, () => `| ${Array.from({ length: clampedCols }, () => " ").join(" | ")} |`).join("\n");
    return `\n${header}\n${divider}\n${body}\n`;
  }

  function insertTable(rows: number, cols: number) {
    const snippet = buildMarkdownTable(rows, cols);
    insertAtCursor(snippet);
    setIsTableMenuOpen(false);
  }

  function updateTablePicker(rows: number, cols: number) {
    setTablePickerRows(rows);
    setTablePickerCols(cols);
  }

  function clearTablePickerSelection() {
    setTablePickerRows(0);
    setTablePickerCols(0);
  }

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
      const prevLineEnd = blockStart - 1;
      const prevLineStart = value.lastIndexOf("\n", prevLineEnd - 1) + 1;
      const prevLine = value.slice(prevLineStart, prevLineEnd);
      if (!prevLine.includes("|")) {
        break;
      }
      blockStart = prevLineStart;
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
    const activeTableLine = Math.min(
      Math.max(currentBlockLine - tableStartLine, 0),
      tableLines.length - 1,
    );

    const currentLineText = blockLines[currentBlockLine] ?? "";
    const cursorOffsetInLine = selectionStart - lineStart;
    const beforeCursor = currentLineText.slice(0, Math.max(0, cursorOffsetInLine));
    const pipeCount = (beforeCursor.match(/\|/g) ?? []).length;
    const startsWithPipe = currentLineText.trimStart().startsWith("|");
    const activeCol = Math.min(
      Math.max((startsWithPipe ? pipeCount - 1 : pipeCount), 0),
      columnCount - 1,
    );

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

  function replaceTableBlock(
    value: string,
    context: TableCursorContext,
    nextTableLines: string[],
    selectionStart: number,
  ) {
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

  function insertTableRowBelowCursor() {
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

      const insertIndex = context.activeTableLine <= 1
        ? 0
        : Math.min(context.activeTableLine - 1, dataRows.length);
      dataRows.splice(insertIndex, 0, Array.from({ length: context.columnCount }, () => " "));

      const nextTableLines = [
        formatRowCells(header),
        formatDivider(context.columnCount),
        ...dataRows.map((row) => formatRowCells(row)),
      ];

      return replaceTableBlock(value, context, nextTableLines, selectionStart);
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

      const removeIndex = context.activeTableLine <= 1
        ? 0
        : Math.min(context.activeTableLine - 2, dataRows.length - 1);
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

      const nextColumnCount = context.columnCount - 1;
      const nextTableLines = [
        formatRowCells(header),
        formatDivider(nextColumnCount),
        ...dataRows.map((row) => formatRowCells(row)),
      ];

      return replaceTableBlock(value, context, nextTableLines, selectionStart);
    });
  }

  const cursorTableContext = getTableCursorContext(markdown, editorSelection);
  const isCursorInsideTable = Boolean(cursorTableContext);
  const activeDataRowNumber = cursorTableContext
    ? Math.max(cursorTableContext.activeTableLine - 1, 1)
    : null;
  const activeColumnNumber = cursorTableContext
    ? cursorTableContext.activeCol + 1
    : null;

  const layoutStyle = useMemo<CSSProperties>(
    () => ({
      ...(previewLayout === "side-by-side"
        ? { gridTemplateColumns: `minmax(280px, ${resizePercent}fr) auto minmax(280px, ${100 - resizePercent}fr)` }
        : { gridTemplateRows: `minmax(160px, ${resizePercent}fr) auto minmax(160px, ${100 - resizePercent}fr)` }),
    }),
    [previewLayout, resizePercent],
  );

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      const bounds = splitRef.current?.getBoundingClientRect();
      if (!bounds) {
        return;
      }

      const nextPercent =
        previewLayout === "side-by-side"
          ? ((event.clientX - bounds.left) / bounds.width) * 100
          : ((event.clientY - bounds.top) / bounds.height) * 100;
      setResizePercent(clampEditorSplitPercent(nextPercent));
    }

    function handlePointerUp() {
      setIsResizing(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizing, previewLayout, setResizePercent]);

  useEffect(() => {
    function updateOpenPopoverPositions() {
      if (isHeadingMenuOpen) {
        setHeadingMenuPosition(getPopoverPosition(headingButtonRef.current));
      }
      if (isTableMenuOpen) {
        setTableMenuPosition(getPopoverPosition(tableButtonRef.current));
      }
      if (isLinkEditorOpen) {
        setLinkEditorPosition(getPopoverPosition(linkEditorButtonRef.current));
      }
      if (isCodeLanguagePickerOpen) {
        setCodeLanguagePickerPosition(getPopoverPosition(codeLanguagePickerButtonRef.current));
      }
    }

    updateOpenPopoverPositions();
    window.addEventListener("resize", updateOpenPopoverPositions);
    window.addEventListener("scroll", updateOpenPopoverPositions, true);

    return () => {
      window.removeEventListener("resize", updateOpenPopoverPositions);
      window.removeEventListener("scroll", updateOpenPopoverPositions, true);
    };
  }, [isHeadingMenuOpen, isTableMenuOpen, isLinkEditorOpen, isCodeLanguagePickerOpen]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      const withinHeading =
        headingMenuRef.current?.contains(target) ||
        headingPopoverRef.current?.contains(target);
      const withinTable =
        tableMenuRef.current?.contains(target) ||
        tablePopoverRef.current?.contains(target);
      const withinLinkEditor =
        linkEditorRef.current?.contains(target) ||
        linkEditorPopoverRef.current?.contains(target);
      const withinCodeLanguagePicker =
        codeLanguagePickerRef.current?.contains(target) ||
        codeLanguagePickerPopoverRef.current?.contains(target);

      if (!withinHeading) {
        setIsHeadingMenuOpen(false);
      }
      if (!withinTable) {
        setIsTableMenuOpen(false);
      }
      if (!withinLinkEditor) {
        setIsLinkEditorOpen(false);
      }
      if (!withinCodeLanguagePicker) {
        setIsCodeLanguagePickerOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    const editorInput = editorInputRef.current;
    if (!editorInput) {
      return;
    }

    if (hasAppliedInitialScrollRef.current) {
      return;
    }

    const maxEditorScrollTop = Math.max(editorInput.scrollHeight - editorInput.clientHeight, 0);
    editorInput.scrollTop = initialScrollRatio * maxEditorScrollTop;
    hasAppliedInitialScrollRef.current = true;
  }, [initialScrollRatio]);

  useEffect(() => {
    const editorInput = editorInputRef.current;
    const previewBody = previewBodyRef.current;
    if (!editorInput || !previewBody || !showPreview) {
      return;
    }

    previewBody.scrollTop = getSyncedPreviewScrollTop({
      sourceScrollTop: editorInput.scrollTop,
      sourceScrollHeight: editorInput.scrollHeight,
      sourceClientHeight: editorInput.clientHeight,
      targetScrollHeight: previewBody.scrollHeight,
      targetClientHeight: previewBody.clientHeight,
    });
  }, [markdown, showPreview]);

  useEffect(() => {
    const previewBody = previewBodyRef.current;
    if (!previewBody || !showPreview) {
      return;
    }

    previewBody.scrollTop = getPreviewScrollTopForEditorSelection({
      markdown,
      selectionStart: editorSelection,
      currentPreviewScrollTop: previewBody.scrollTop,
      targetScrollHeight: previewBody.scrollHeight,
      targetClientHeight: previewBody.clientHeight,
    });
  }, [editorSelection, markdown, showPreview]);

  function handleResizeStart(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsResizing(true);
  }

  function handleEditorScroll(event: UIEvent<HTMLTextAreaElement>) {
    const previewBody = previewBodyRef.current;
    if (!previewBody) {
      return;
    }

    previewBody.scrollTop = getSyncedPreviewScrollTop({
      sourceScrollTop: event.currentTarget.scrollTop,
      sourceScrollHeight: event.currentTarget.scrollHeight,
      sourceClientHeight: event.currentTarget.clientHeight,
      targetScrollHeight: previewBody.scrollHeight,
      targetClientHeight: previewBody.clientHeight,
    });
  }

  function handleEditorCursorActivity(event: UIEvent<HTMLTextAreaElement>) {
    setEditorSelection(event.currentTarget.selectionStart);
  }

  async function handleFileDrop(event: React.DragEvent<HTMLTextAreaElement>) {
    event.preventDefault();
    setIsDragOver(false);

    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0 || !noteSourcePath) return;

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

      if (!response.ok) return;
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
      if (editor) {
        const pos = editor.selectionStart;
        const before = markdown.slice(0, pos);
        const after = markdown.slice(pos);
        const separator = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
        onChange(before + separator + insertions + "\n" + after);
      }
    } catch {
      // Upload failed silently
    }
  }

  return (
    <div className="markdown-editor" ref={editorRootRef}>
      <div className="markdown-body__toolbar markdown-editor__toolbar">
        <button
          aria-pressed={showPreview}
          className="mini-action"
          disabled={saveState === "saving"}
          onClick={() => setShowPreview((current) => !current)}
          title={showPreview ? "Hide preview" : "Show preview"}
          type="button"
        >
          {showPreview ? <EyeOff size={16} /> : <Eye size={16} />}
          {showPreview ? "Hide preview" : "Show preview"}
        </button>
        <button
          aria-label={previewLayout === "side-by-side" ? "Below preview" : "Side by side"}
          className="mini-action"
          disabled={saveState === "saving"}
          onClick={() =>
            setPreviewLayout((current) => (current === "side-by-side" ? "below" : "side-by-side"))
          }
          title={previewLayout === "side-by-side" ? "Switch to below preview" : "Switch to side-by-side preview"}
          type="button"
        >
          {previewLayout === "side-by-side" ? <SplitSquareVertical size={16} /> : <SplitSquareHorizontal size={16} />}
          {previewLayout === "side-by-side" ? "Below preview" : "Side by side"}
        </button>
        <div className={`markdown-body__toolbar-side ${showPreview ? "" : "is-disabled"}`.trim()}>
          <button
            aria-label="Zoom out"
            className="icon-action markdown-body__zoom"
            disabled={saveState === "saving" || !showPreview}
            onClick={onZoomOut}
            title="Zoom out"
            type="button"
          >
            <Minus size={16} />
          </button>
          <span className="markdown-body__zoom-value">{previewContentScale}%</span>
          <button
            aria-label="Zoom in"
            className="icon-action markdown-body__zoom"
            disabled={saveState === "saving" || !showPreview}
            onClick={onZoomIn}
            title="Zoom in"
            type="button"
          >
            <Plus size={16} />
          </button>
        </div>
        <button
          className="mini-action"
          disabled={saveState === "saving"}
          onClick={onCancel}
          title="Cancel editing"
          type="button"
        >
          <X size={16} />
          Cancel
        </button>
        <button
          className="mini-action markdown-editor__save"
          disabled={saveState === "saving"}
          onClick={onSave}
          title={saveState === "saving" ? "Saving note" : "Save note"}
          type="button"
        >
          <Pencil size={16} />
          {saveState === "saving" ? "Saving..." : "Save"}
        </button>
      </div>
      <div
        className={`markdown-editor__split ${showPreview && previewLayout === "side-by-side" ? "markdown-editor__split--side-by-side" : ""}`}
        ref={splitRef}
        style={showPreview ? layoutStyle : undefined}
      >
        <section className="markdown-editor__pane markdown-editor__pane--input">
          <div className="markdown-editor__pane-header">
            <span className="markdown-editor__document-path" title={documentPath}>{documentPath}</span>
            <span className="muted">{markdown.length} chars</span>
          </div>
          <div aria-label="Markdown formatting" className="markdown-format-toolbar" role="toolbar">
            <div className="markdown-format-toolbar__item" ref={headingMenuRef}>
              <button
                ref={headingButtonRef}
                className={`markdown-format-toolbar__button ${isHeadingMenuOpen ? "is-active" : ""}`}
                onClick={() => {
                  setIsHeadingMenuOpen((current) => !current);
                  setIsTableMenuOpen(false);
                  setHeadingMenuPosition(getPopoverPosition(headingButtonRef.current));
                }}
                title="Heading"
                type="button"
              >
                H
              </button>
            </div>
            <button aria-label="Make it bold" className={`markdown-format-toolbar__button ${isBoldActive ? "is-active" : ""}`} onClick={() => toggleWrapSelection("**", "**", "bold text")} title="Make it bold" type="button"><Bold size={14} /></button>
            <button aria-label="Make it italic" className={`markdown-format-toolbar__button ${isItalicActive ? "is-active" : ""}`} onClick={() => toggleWrapSelection("*", "*", "italic text")} title="Make it italic" type="button"><Italic size={14} /></button>
            <button aria-label="Make it strike through" className={`markdown-format-toolbar__button ${isStrikeActive ? "is-active" : ""}`} onClick={() => toggleWrapSelection("~~", "~~", "strikethrough")} title="Make it strike through" type="button"><span className="markdown-format-toolbar__glyph-strike">A</span></button>
            <span aria-hidden="true" className="markdown-format-toolbar__separator" />
            <button className="markdown-format-toolbar__button" onClick={() => insertAtCursor("\n---\n")} title="Horizontal rule" type="button">―</button>
            <span aria-hidden="true" className="markdown-format-toolbar__separator" />
            <button className="markdown-format-toolbar__button" onClick={() => prefixSelectedLines((lineIndex) => `${lineIndex + 1}. `)} title="Numbered list" type="button">1.</button>
            <button className="markdown-format-toolbar__button" onClick={() => prefixSelectedLines(() => "> ")} title="Blockquote" type="button">❯</button>
            <button className="markdown-format-toolbar__button" onClick={() => prefixSelectedLines(() => "  ")} title="Indent" type="button">⇥</button>
            <span aria-hidden="true" className="markdown-format-toolbar__separator" />
            <button className="markdown-format-toolbar__button" onClick={() => toggleTaskLists()} title="Task list" type="button"><CheckSquare2 size={14} /></button>
            <button className="markdown-format-toolbar__button" onClick={() => toggleListMarkers()} title="Toggle list" type="button"><List size={14} /></button>
            <span aria-hidden="true" className="markdown-format-toolbar__separator" />
            <div className="markdown-format-toolbar__item" ref={tableMenuRef}>
              <button
                ref={tableButtonRef}
                className={`markdown-format-toolbar__button ${isTableMenuOpen ? "is-active" : ""}`}
                onClick={() => {
                  setIsTableMenuOpen((current) => !current);
                  setIsHeadingMenuOpen(false);
                  setIsLinkEditorOpen(false);
                  setIsCodeLanguagePickerOpen(false);
                  setTableMenuPosition(getPopoverPosition(tableButtonRef.current));
                }}
                title="Table"
                type="button"
              >
                ⊞
              </button>
            </div>
            <div className="markdown-format-toolbar__item" ref={linkEditorRef}>
              <button
                ref={linkEditorButtonRef}
                className={`markdown-format-toolbar__button ${isLinkEditorOpen ? "is-active" : ""}`}
                onClick={() => {
                  setIsLinkEditorOpen((current) => !current);
                  setIsHeadingMenuOpen(false);
                  setIsTableMenuOpen(false);
                  setIsCodeLanguagePickerOpen(false);
                  setLinkEditorPosition(getPopoverPosition(linkEditorButtonRef.current));
                  setTimeout(() => linkEditorInputRef.current?.focus(), 0);
                }}
                title="Link with URL"
                type="button"
              >
                <Link2 size={14} />
              </button>
            </div>
            <button className="markdown-format-toolbar__button" onClick={() => wrapSelection("![", "](image.png)", "alt text")} title="Image" type="button">🖼</button>
            <span aria-hidden="true" className="markdown-format-toolbar__separator" />
            <button className="markdown-format-toolbar__button" onClick={() => wrapSelection("`", "`", "code")} title="Inline code" type="button">&lt;/&gt;</button>
            <div className="markdown-format-toolbar__item" ref={codeLanguagePickerRef}>
              <button
                ref={codeLanguagePickerButtonRef}
                className={`markdown-format-toolbar__button ${isCodeLanguagePickerOpen ? "is-active" : ""}`}
                onClick={() => {
                  setIsCodeLanguagePickerOpen((current) => !current);
                  setIsHeadingMenuOpen(false);
                  setIsTableMenuOpen(false);
                  setIsLinkEditorOpen(false);
                  setCodeLanguagePickerPosition(getPopoverPosition(codeLanguagePickerButtonRef.current));
                }}
                title="Code block"
                type="button"
              >
                CB
              </button>
            </div>
            <button className="markdown-format-toolbar__button" onClick={() => clearFormatting()} title="Clear formatting" type="button"><Trash2 size={14} /></button>
          </div>
          <textarea
            aria-label="Raw markdown editor"
            className={`markdown-editor__input ${isDragOver ? "is-drag-over" : ""}`}
            onChange={(event) => {
              onChange(event.target.value);
              setEditorSelection(event.currentTarget.selectionStart);
            }}
            onDragEnter={(event) => {
              if (event.dataTransfer.types.includes("Files")) {
                event.preventDefault();
                setIsDragOver(true);
              }
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes("Files")) {
                event.preventDefault();
              }
            }}
            onDrop={handleFileDrop}
            onKeyUp={handleEditorCursorActivity}
            onScroll={handleEditorScroll}
            onSelect={handleEditorCursorActivity}
            ref={editorInputRef}
            spellCheck
            value={markdown}
          />
        </section>
        {showPreview ? (
          <>
            <button
              aria-label="Resize editor panes"
              aria-orientation={showPreview && previewLayout === "side-by-side" ? "vertical" : "horizontal"}
              className={`markdown-editor__resize-handle ${
                showPreview && previewLayout === "side-by-side" ? "markdown-editor__resize-handle--vertical" : ""
              }`}
              onPointerDown={handleResizeStart}
              type="button"
            >
              <span className="markdown-editor__resize-line" />
            </button>
            <section className="markdown-editor__pane markdown-editor__pane--preview">
              <div className="markdown-editor__pane-header">
                <span className="status-pill subtle">Markdown preview</span>
              </div>
              <div className="markdown-editor__preview-body" ref={previewBodyRef}>
                <MarkdownContent contentScale={previewContentScale} markdown={markdown} noteSourcePath={noteSourcePath} />
              </div>
            </section>
          </>
        ) : null}
      </div>
      {isHeadingMenuOpen ? (
        <div
          className="markdown-toolbar-popover markdown-toolbar-popover--heading"
          ref={headingPopoverRef}
          style={{ left: headingMenuPosition.left, top: headingMenuPosition.top }}
        >
          {[1, 2, 3, 4, 5, 6].map((level) => (
            <button
              className="markdown-toolbar-popover__option"
              key={level}
              onClick={() => applyHeading(level)}
              title={`Apply heading ${level}`}
              type="button"
            >
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
          <div
            className={`markdown-table-picker-grid ${isCursorInsideTable ? "is-disabled" : ""}`}
            onMouseLeave={clearTablePickerSelection}
          >
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
                      onMouseEnter={() => {
                        if (!isCursorInsideTable) {
                          updateTablePicker(row, col);
                        }
                      }}
                      onClick={() => insertTable(row, col)}
                      title={isCursorInsideTable ? "Move cursor outside table to insert a new table" : `${row} x ${col}`}
                      type="button"
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div className="markdown-toolbar-popover__table-actions">
            <button
              aria-label="Add Row"
              className="markdown-toolbar-popover__table-action-button"
              disabled={!isCursorInsideTable}
              onClick={() => {
                insertTableRowBelowCursor();
              }}
              title="Add Row"
              type="button"
            >
              +≡
            </button>
            <button
              aria-label="Remove Row"
              className="markdown-toolbar-popover__table-action-button"
              disabled={!isCursorInsideTable}
              onClick={() => {
                removeTableRowAtCursor();
              }}
              title="Remove Row"
              type="button"
            >
              -≡
            </button>
            <button
              aria-label="Add Column"
              className="markdown-toolbar-popover__table-action-button"
              disabled={!isCursorInsideTable}
              onClick={() => {
                insertTableColumnRightOfCursor();
              }}
              title="Add Column"
              type="button"
            >
              +‖
            </button>
            <button
              aria-label="Remove Column"
              className="markdown-toolbar-popover__table-action-button"
              disabled={!isCursorInsideTable}
              onClick={() => {
                removeTableColumnAtCursor();
              }}
              title="Remove Column"
              type="button"
            >
              -‖
            </button>
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
              type="url"
              placeholder="https://example.com"
              value={linkEditorUrl}
              onChange={(e) => setLinkEditorUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  insertLinkWithUrl();
                }
              }}
            />
            <button
              className="markdown-link-editor__button"
              onClick={() => insertLinkWithUrl()}
              title="Insert link"
              type="button"
            >
              Insert
            </button>
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
            <button
              className="markdown-toolbar-popover__option markdown-toolbar-popover__option--language"
              key={languageOption.value}
              onClick={() => insertCodeBlockWithLanguage(languageOption.value)}
              title={`Code block: ${languageOption.label}`}
              type="button"
            >
              <img alt="" aria-hidden="true" className="markdown-language-icon" loading="lazy" src={languageOption.iconUrl} />
              <span>{languageOption.label}</span>
            </button>
          ))}
        </div>
      ) : null}
      {saveError ? <p className="markdown-editor__error">{saveError}</p> : null}
    </div>
  );
}

function WikiUnfurlCard({ unfurl }: { unfurl: UnfurlResponse }) {
  return (
    <aside className="wiki-unfurl-card">
      <div className="wiki-unfurl-card__meta">
        <span className="status-pill subtle">Page preview</span>
        <a href={unfurl.url} rel="noreferrer noopener" target="_blank">
          Open source
        </a>
      </div>
      {unfurl.image ? <img alt={unfurl.title} className="wiki-unfurl-card__image" src={unfurl.image} /> : null}
      <div className="wiki-unfurl-card__body">
        <p className="eyebrow">{unfurl.siteName}</p>
        <h4>{unfurl.title}</h4>
        {unfurl.description ? <p>{unfurl.description}</p> : null}
      </div>
    </aside>
  );
}

function MermaidDiagram({ chart, theme }: { chart: string; theme: "dark" | "light" }) {
  const renderId = useId().replace(/:/g, "");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const [pngSizeMenuOpen, setPngSizeMenuOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<"idle" | "text" | "image" | "svg">("idle");
  const [copyMenuPosition, setCopyMenuPosition] = useState({ top: 0, left: 0 });
  const [pngSubmenuPosition, setPngSubmenuPosition] = useState({ top: 0, left: 0 });
  const copyTriggerRef = useRef<HTMLButtonElement>(null);
  const copyMenuRef = useRef<HTMLDivElement>(null);
  const pngMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const pngSubmenuRef = useRef<HTMLDivElement>(null);
  const pngSubmenuCloseTimeoutRef = useRef<number | null>(null);

  function getFloatingMenuPosition(anchor: HTMLElement, xOffset = 0, yOffset = 6) {
    const rect = anchor.getBoundingClientRect();
    return {
      top: Math.round(rect.bottom + yOffset),
      left: Math.round(rect.left + xOffset),
    };
  }

  function getDiagramFileBaseName() {
    return `mermaid-${hashString(chart).slice(0, 8)}`;
  }

  async function renderPngBlob(size: "small" | "medium" | "large" | "xlarge") {
    if (!svg) {
      return null;
    }

    const maxEdgeBySize: Record<"small" | "medium" | "large" | "xlarge", number> = {
      small: 512,
      medium: 1024,
      large: 2048,
      xlarge: 4096,
    };

    const source = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(source);

    try {
      const image = new Image();
      const loaded = await new Promise<HTMLImageElement>((resolve, reject) => {
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Unable to load diagram image"));
        image.src = svgUrl;
      });

      const canvas = document.createElement("canvas");
      const baseWidth = Math.max(1, Math.ceil(loaded.naturalWidth || loaded.width || 1));
      const baseHeight = Math.max(1, Math.ceil(loaded.naturalHeight || loaded.height || 1));
      const maxDimension = 8192;
      const longestEdge = Math.max(baseWidth, baseHeight);
      const targetLongestEdge = maxEdgeBySize[size];
      const scale = targetLongestEdge / longestEdge;

      canvas.width = Math.min(maxDimension, Math.max(1, Math.round(baseWidth * scale)));
      canvas.height = Math.min(maxDimension, Math.max(1, Math.round(baseHeight * scale)));

      const context = canvas.getContext("2d");
      if (!context) {
        return null;
      }

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(loaded, 0, 0, canvas.width, canvas.height);

      return await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => resolve(blob), "image/png");
      });
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  }

  async function copyDiagramText() {
    try {
      await navigator.clipboard.writeText(chart);
      setCopyFeedback("text");
      window.setTimeout(() => setCopyFeedback("idle"), 1200);
      setCopyMenuOpen(false);
      setPngSizeMenuOpen(false);
    } catch {
      setCopyFeedback("idle");
    }
  }

  async function copyDiagramPng(size: "small" | "medium" | "large" | "xlarge") {
    const pngBlob = await renderPngBlob(size);
    if (!pngBlob || !window.ClipboardItem) {
      return;
    }

    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": pngBlob,
        }),
      ]);

      setCopyFeedback("image");
      window.setTimeout(() => setCopyFeedback("idle"), 1200);
      setCopyMenuOpen(false);
      setPngSizeMenuOpen(false);
    } catch {
      setCopyFeedback("idle");
    }
  }

  function saveDiagramSvg() {
    if (!svg) {
      return;
    }

    const source = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(source);
    const link = document.createElement("a");
    link.href = svgUrl;
    link.download = `${getDiagramFileBaseName()}.svg`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(svgUrl);

    setCopyFeedback("svg");
    window.setTimeout(() => setCopyFeedback("idle"), 1200);
    setCopyMenuOpen(false);
    setPngSizeMenuOpen(false);
  }

  function closePngSubmenuSoon() {
    if (pngSubmenuCloseTimeoutRef.current) {
      window.clearTimeout(pngSubmenuCloseTimeoutRef.current);
    }
    pngSubmenuCloseTimeoutRef.current = window.setTimeout(() => {
      setPngSizeMenuOpen(false);
      pngSubmenuCloseTimeoutRef.current = null;
    }, 120);
  }

  function cancelPngSubmenuClose() {
    if (pngSubmenuCloseTimeoutRef.current) {
      window.clearTimeout(pngSubmenuCloseTimeoutRef.current);
      pngSubmenuCloseTimeoutRef.current = null;
    }
  }

  function openPngSubmenu() {
    cancelPngSubmenuClose();
    setPngSizeMenuOpen(true);
    if (pngMenuTriggerRef.current) {
      const rect = pngMenuTriggerRef.current.getBoundingClientRect();
      setPngSubmenuPosition({ top: Math.round(rect.top), left: Math.round(rect.right + 6) });
    }
  }

  useEffect(() => {
    if (!copyMenuOpen) {
      return;
    }

    function updateCopyMenuPosition() {
      const trigger = copyTriggerRef.current;
      if (!trigger) {
        return;
      }
      setCopyMenuPosition(getFloatingMenuPosition(trigger));
    }

    updateCopyMenuPosition();
    window.addEventListener("resize", updateCopyMenuPosition);
    window.addEventListener("scroll", updateCopyMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateCopyMenuPosition);
      window.removeEventListener("scroll", updateCopyMenuPosition, true);
    };
  }, [copyMenuOpen]);

  useEffect(() => {
    return () => {
      if (pngSubmenuCloseTimeoutRef.current) {
        window.clearTimeout(pngSubmenuCloseTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!pngSizeMenuOpen) {
      return;
    }

    function updateSubmenuPosition() {
      const trigger = pngMenuTriggerRef.current;
      if (!trigger) {
        return;
      }
      const rect = trigger.getBoundingClientRect();
      setPngSubmenuPosition({
        top: Math.round(rect.top),
        left: Math.round(rect.right + 6),
      });
    }

    updateSubmenuPosition();
    window.addEventListener("resize", updateSubmenuPosition);
    window.addEventListener("scroll", updateSubmenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateSubmenuPosition);
      window.removeEventListener("scroll", updateSubmenuPosition, true);
    };
  }, [pngSizeMenuOpen]);

  useEffect(() => {
    if (!copyMenuOpen) {
      return;
    }

    function handleOutsidePointer(event: MouseEvent) {
      const target = event.target as Node;
      const withinTrigger = copyTriggerRef.current?.contains(target);
      const withinMenu = copyMenuRef.current?.contains(target);
      const withinSubmenu = pngSubmenuRef.current?.contains(target);

      if (!withinTrigger && !withinMenu && !withinSubmenu) {
        setCopyMenuOpen(false);
        setPngSizeMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", handleOutsidePointer);
    return () => {
      window.removeEventListener("mousedown", handleOutsidePointer);
    };
  }, [copyMenuOpen]);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      try {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          theme: theme === "dark" ? "dark" : "default",
        });

        const { svg: renderedSvg } = await mermaid.render(`mermaid-${renderId}-${hashString(chart)}`, chart);

        if (!cancelled) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (renderError) {
        if (!cancelled) {
          setError(renderError instanceof Error ? renderError.message : "Unable to render mermaid diagram");
          setSvg("");
        }
      }
    }

    void renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [chart, renderId, theme]);

  if (error) {
    return (
      <div className="mermaid-diagram mermaid-diagram--error">
        <p>Mermaid render failed: {error}</p>
        <pre>{chart}</pre>
      </div>
    );
  }

  if (!svg) {
    return <div className="mermaid-diagram mermaid-diagram--loading">Rendering diagram...</div>;
  }

  return (
    <>
      <div className="mermaid-diagram">
      <div className="mermaid-diagram__copy-actions">
        <button
          ref={copyTriggerRef}
          aria-label={copyFeedback === "idle" ? "Copy diagram" : copyFeedback === "text" ? "Copied text" : copyFeedback === "image" ? "Copied image" : "Saved SVG"}
          className="mini-action mermaid-diagram__copy-trigger"
          onClick={() => {
            setCopyMenuOpen((current) => {
              const next = !current;
              if (next && copyTriggerRef.current) {
                setCopyMenuPosition(getFloatingMenuPosition(copyTriggerRef.current));
              }
              return next;
            });
            setPngSizeMenuOpen(false);
          }}
          title={copyFeedback === "idle" ? "Copy" : copyFeedback === "text" ? "Copied text" : copyFeedback === "image" ? "Copied image" : "Saved SVG"}
          type="button"
        >
          {copyFeedback === "idle" ? <Copy size={14} /> : <Check size={14} />}
          {copyFeedback === "idle" ? "Copy" : copyFeedback === "svg" ? "Saved" : "Copied"}
        </button>
      </div>
      <div dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
      {copyMenuOpen && typeof document !== "undefined" ? createPortal(
        <div
          className="mermaid-diagram__copy-menu mermaid-diagram__copy-menu--floating"
          ref={copyMenuRef}
          role="menu"
          style={{ left: copyMenuPosition.left, top: copyMenuPosition.top }}
        >
          <button className="mermaid-diagram__copy-option" onClick={() => void copyDiagramText()} role="menuitem" type="button">Copy Text</button>
          <div className="mermaid-diagram__copy-option-row">
            <button
              className="mermaid-diagram__copy-option mermaid-diagram__copy-option--submenu"
              onFocus={openPngSubmenu}
              onMouseEnter={openPngSubmenu}
              onMouseLeave={closePngSubmenuSoon}
              ref={pngMenuTriggerRef}
              role="menuitem"
              type="button"
            >
              <span>Copy PNG</span>
              <span aria-hidden="true">▸</span>
            </button>
          </div>
          <button className="mermaid-diagram__copy-option" onClick={() => saveDiagramSvg()} role="menuitem" type="button">Save as SVG</button>
        </div>,
        document.body,
      ) : null}
      {copyMenuOpen && pngSizeMenuOpen && typeof document !== "undefined" ? createPortal(
        <div
          className="mermaid-diagram__copy-submenu mermaid-diagram__copy-submenu--floating"
          ref={pngSubmenuRef}
          onMouseEnter={cancelPngSubmenuClose}
          onMouseLeave={() => setPngSizeMenuOpen(false)}
          role="menu"
          style={{ left: pngSubmenuPosition.left, top: pngSubmenuPosition.top }}
        >
          <button className="mermaid-diagram__copy-option" onClick={() => void copyDiagramPng("small")} role="menuitem" type="button">Small</button>
          <button className="mermaid-diagram__copy-option" onClick={() => void copyDiagramPng("medium")} role="menuitem" type="button">Medium</button>
          <button className="mermaid-diagram__copy-option" onClick={() => void copyDiagramPng("large")} role="menuitem" type="button">Large</button>
          <button className="mermaid-diagram__copy-option" onClick={() => void copyDiagramPng("xlarge")} role="menuitem" type="button">X-large</button>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

export { MarkdownFencedCodeBlock, MarkdownContent, MarkdownEditor, WikiUnfurlCard, MermaidDiagram };
