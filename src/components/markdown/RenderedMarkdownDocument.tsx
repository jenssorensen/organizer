import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
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
  remarkBreaks,
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
];

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
  contentScale,
  hasToolbar,
  theme,
  frameMode = false,
}: {
  markdown: string;
  noteSourcePath?: string;
  contentScale: number;
  hasToolbar: boolean;
  theme: "dark" | "light";
  frameMode?: boolean;
}) {
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

  return (
    <div
      className={frameMode ? "markdown-body__frame-root" : "markdown-body__content"}
      style={{ fontSize: `${contentScale}%`, paddingTop: hasToolbar ? undefined : 0 }}
    >
      <div className={frameMode ? "markdown-body__content markdown-body__content--frame-inner" : undefined}>
        <ReactMarkdown
          rehypePlugins={rehypePlugins}
          remarkPlugins={remarkPlugins}
          components={{
            a(props) {
              const { href, children } = props;
              const resolvedHref = resolveNoteAssetUrl(href ?? "", noteSourcePath);
              if (resolvedHref && /\.pdf$/i.test(resolvedHref.split("?")[0])) {
                return <PdfEmbed src={resolvedHref} title={typeof children === "string" ? children : undefined} />;
              }
              const linkProps = getMarkdownLinkAttributes(resolvedHref || href);
              return <a {...linkProps}>{children}</a>;
            },
            p(props) {
              const { children } = props;
              const childArray = Array.isArray(children) ? children : [children];
              const nonEmpty = childArray.filter((child) => child !== "\n" && child !== "");
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
    </div>
  );
}