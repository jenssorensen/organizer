import { lazy, Suspense, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkEmoji from "remark-emoji";
import remarkGithubBlockquoteAlert from "remark-github-blockquote-alert";
import remarkGfm from "remark-gfm";

import { apiFetch as fetch } from "../../apiFetch";
import { getMarkdownLinkAttributes } from "../../markdownLinks";
import type { UnfurlResponse } from "../../types";
import { parseMarkdownEmbedDirective, resolveMarkdownEmbed } from "./markdownEditorUtils";
import { MermaidDiagram } from "./MermaidDiagram";
import { hasMarkdownMathSyntax } from "./markdownMath";
import { resolveNoteAssetUrl } from "./MarkdownPreviewFrame";
import { WikiUnfurlCard } from "./WikiUnfurlCard";

const LazyCodeBlockHighlighter = lazy(async () => {
  const module = await import("./CodeBlockHighlighter");
  return { default: module.CodeBlockHighlighter };
});

const markdownSanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "details", "summary", "section", "sup", "sub", "span"],
  attributes: {
    ...defaultSchema.attributes,
    "*": [...((defaultSchema.attributes?.["*"] as string[] | undefined) ?? []), "className", "id", "data-sourcepos"],
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
  remarkBreaks,
  remarkEmoji,
  remarkGithubBlockquoteAlert,
];

const markdownRehypePlugins: any[] = [
  function addSourcePositionAttributes() {
    return (tree: any) => {
      visitNode(tree);
    };
  },
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
];

function visitNode(node: any) {
  if (!node || typeof node !== "object") {
    return;
  }

  if (node.type === "element" && node.position?.start && node.position?.end) {
    const { start, end } = node.position;
    node.properties = {
      ...(node.properties ?? {}),
      "data-sourcepos": `${start.line}:${start.column}-${end.line}:${end.column}`,
    };
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      visitNode(child);
    }
  }
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

function ExternalMediaEmbed({
  allowScripts,
  embedUrl,
  provider,
  sourceUrl,
  title,
}: {
  allowScripts: boolean;
  embedUrl: string;
  provider: string;
  sourceUrl: string;
  title: string;
}) {
  return (
    <div className="markdown-external-embed" data-provider={provider}>
      <div className="markdown-external-embed__header">
        <span className="status-pill subtle">{title}</span>
        <a href={sourceUrl} rel="noreferrer noopener" target="_blank">Open original</a>
      </div>
      <iframe
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        className="markdown-external-embed__frame"
        sandbox={[
          "allow-downloads",
          "allow-forms",
          "allow-popups",
          "allow-popups-to-escape-sandbox",
          "allow-presentation",
          "allow-same-origin",
          allowScripts ? "allow-scripts" : "",
        ].filter(Boolean).join(" ")}
        src={embedUrl}
        title={`${title} embed`}
      />
    </div>
  );
}

export function useResolvedTheme(): "dark" | "light" {
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

export function MarkdownFencedCodeBlock({
  code,
  language,
  theme,
}: {
  code: string;
  language: string;
  theme: "dark" | "light";
}) {
  return (
    <Suspense fallback={<pre className="markdown-code-fallback"><code>{code}</code></pre>}>
      <LazyCodeBlockHighlighter code={code} language={language} theme={theme} />
    </Suspense>
  );
}

export function RenderedMarkdownDocument({
  markdown,
  noteSourcePath,
  allowIframeScripts = false,
  contentScale,
  focusCurrentBlockOnly = false,
  hasToolbar,
  theme,
  frameMode = false,
  onSourcePositionSelect,
  activeSourceLine,
}: {
  markdown: string;
  noteSourcePath?: string;
  allowIframeScripts?: boolean;
  contentScale: number;
  focusCurrentBlockOnly?: boolean;
  hasToolbar: boolean;
  theme: "dark" | "light";
  frameMode?: boolean;
  onSourcePositionSelect?: (sourcePosition: string) => void;
  activeSourceLine?: number | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const shouldRenderMath = hasMarkdownMathSyntax(markdown);
  const [mathPlugins, setMathPlugins] = useState<{ remarkMath: unknown; rehypeKatex: unknown } | null>(null);

  useEffect(() => {
    if (!shouldRenderMath) {
      setMathPlugins(null);
      return;
    }

    let cancelled = false;

    void import("./MarkdownMathPlugins").then((module) => {
      if (!cancelled) {
        setMathPlugins({
          remarkMath: module.remarkMath,
          rehypeKatex: module.rehypeKatex,
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [shouldRenderMath]);

  const remarkPlugins = shouldRenderMath && mathPlugins
    ? [...markdownRemarkPlugins, mathPlugins.remarkMath]
    : markdownRemarkPlugins;
  const rehypePlugins = shouldRenderMath && mathPlugins
    ? [...markdownRehypePlugins, mathPlugins.rehypeKatex]
    : markdownRehypePlugins;

  function handleSourcePositionClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (!onSourcePositionSelect) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const sourceElement = target.closest("[data-sourcepos]");
    const sourcePosition = sourceElement?.getAttribute("data-sourcepos");
    if (sourcePosition) {
      onSourcePositionSelect(sourcePosition);
    }
  }

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const scope = root.firstElementChild instanceof HTMLElement ? root.firstElementChild : root;

    for (const element of root.querySelectorAll("[data-active-source='true']")) {
      element.removeAttribute("data-active-source");
    }
    for (const element of scope.querySelectorAll(":scope > [data-top-source='true']")) {
      element.removeAttribute("data-top-source");
      element.removeAttribute("data-active-top-source");
    }

    for (const child of Array.from(scope.children)) {
      if (child instanceof HTMLElement && child.hasAttribute("data-sourcepos")) {
        child.setAttribute("data-top-source", "true");
      }
    }

    if (!activeSourceLine) {
      return;
    }

    const activeElement = findActiveSourceElement(root, activeSourceLine);
    activeElement?.setAttribute("data-active-source", "true");
    const activeTopLevelElement = activeElement ? findTopLevelSourceElement(activeElement, scope) : null;
    activeTopLevelElement?.setAttribute("data-active-top-source", "true");
  }, [activeSourceLine, markdown]);

  return (
    <div
      className={frameMode ? "markdown-body__frame-root" : "markdown-body__content"}
      data-focus-current-block={focusCurrentBlockOnly ? "true" : "false"}
      onClickCapture={handleSourcePositionClick}
      ref={rootRef}
      style={{ fontSize: `${contentScale}%`, paddingTop: hasToolbar ? undefined : 0 }}
    >
      <div className={frameMode ? "markdown-body__content markdown-body__content--frame-inner" : undefined}>
        <ReactMarkdown
          rehypePlugins={rehypePlugins}
          remarkPlugins={remarkPlugins}
          components={{
            a(props) {
              const { href, children, ...rest } = props;
              const resolvedHref = resolveNoteAssetUrl(href ?? "", noteSourcePath);
              if (resolvedHref && /\.pdf$/i.test(resolvedHref.split("?")[0])) {
                return <PdfEmbed src={resolvedHref} title={typeof children === "string" ? children : undefined} />;
              }
              const linkProps = getMarkdownLinkAttributes(resolvedHref || href);
              return <a {...rest} {...linkProps}>{children}</a>;
            },
            p(props) {
              const { children, ...rest } = props;
              const childArray = Array.isArray(children) ? children : [children];
              const nonEmpty = childArray.filter((child) => child !== "\n" && child !== "");
              if (nonEmpty.length === 1 && typeof nonEmpty[0] === "string") {
                const embedUrl = parseMarkdownEmbedDirective(nonEmpty[0]);
                const embed = embedUrl ? resolveMarkdownEmbed(embedUrl) : null;
                if (embed) {
                  return (
                    <div {...rest}>
                      <ExternalMediaEmbed
                        allowScripts={allowIframeScripts}
                        embedUrl={embed.embedUrl}
                        provider={embed.provider}
                        sourceUrl={embed.url}
                        title={embed.title}
                      />
                    </div>
                  );
                }
              }

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
                  return <div {...rest}><LinkPreviewCard href={linkHref}>{linkChildren}</LinkPreviewCard></div>;
                }
              }
              return <p {...rest}>{children}</p>;
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
    </div>
  );
}

function findActiveSourceElement(root: HTMLDivElement, activeSourceLine: number) {
  const blockTags = new Set(["P", "PRE", "BLOCKQUOTE", "LI", "TABLE", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "HR", "IMG", "DIV", "SECTION", "DETAILS"]);
  let bestMatch: Element | null = null;
  let bestSpan = Number.POSITIVE_INFINITY;

  for (const element of root.querySelectorAll("[data-sourcepos]")) {
    if (!blockTags.has(element.tagName)) {
      continue;
    }

    const sourcePos = element.getAttribute("data-sourcepos");
    const rangeMatch = sourcePos?.match(/^(\d+):\d+-(\d+):\d+$/);
    if (!rangeMatch) {
      continue;
    }

    const startLine = Number(rangeMatch[1]);
    const endLine = Number(rangeMatch[2]);
    if (activeSourceLine < startLine || activeSourceLine > endLine) {
      continue;
    }

    const span = endLine - startLine;
    if (span <= bestSpan) {
      bestSpan = span;
      bestMatch = element;
    }
  }

  return bestMatch;
}

function findTopLevelSourceElement(activeElement: Element, scope: HTMLElement) {
  let current: Element | null = activeElement;

  while (current && current.parentElement && current.parentElement !== scope) {
    current = current.parentElement;
  }

  return current instanceof HTMLElement ? current : null;
}