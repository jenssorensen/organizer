import type { ReactNode, RefObject } from "react";

import { useResolvedTheme, RenderedMarkdownDocument } from "./RenderedMarkdownDocument";
import {
  buildDocumentPreviewSrcDoc,
  buildSandboxFrameMarkup,
  getNotePreviewKind,
  SandboxedPreviewFrame,
} from "./MarkdownPreviewFrame";

export function MarkdownContent({
  markdown,
  noteSourcePath,
  isImmersive = false,
  contentScale = 100,
  contentRef,
  omitRootWrapper = false,
  toolbarLeading,
  toolbarActions,
  allowIframeScripts = false,
  useSandboxFrame = false,
}: {
  markdown: string;
  noteSourcePath?: string;
  isImmersive?: boolean;
  contentScale?: number;
  contentRef?: RefObject<HTMLDivElement | null>;
  omitRootWrapper?: boolean;
  toolbarLeading?: ReactNode;
  toolbarActions?: ReactNode;
  allowIframeScripts?: boolean;
  useSandboxFrame?: boolean;
}) {
  const theme = useResolvedTheme();
  const hasToolbar = Boolean(toolbarLeading || toolbarActions);
  const contentNode = useSandboxFrame ? (
    getNotePreviewKind(noteSourcePath) === "document" && noteSourcePath ? (
      <SandboxedPreviewFrame
        allowScripts={allowIframeScripts}
        className="markdown-body__content markdown-body__content--sandbox"
        contentRef={contentRef}
        frameSrcDoc={buildDocumentPreviewSrcDoc(markdown, noteSourcePath)}
        frameTitle={noteSourcePath}
      />
    ) : (
      <SandboxedPreviewFrame
        allowScripts={allowIframeScripts}
        className="markdown-body__content markdown-body__content--sandbox"
        contentRef={contentRef}
        frameSrcDoc={buildSandboxFrameMarkup("markdown-body markdown-body--frame")}
        frameTitle={noteSourcePath ?? "Markdown preview"}
        portalContent={(
          <RenderedMarkdownDocument
            contentScale={contentScale}
            frameMode
            hasToolbar={hasToolbar}
            markdown={markdown}
            noteSourcePath={noteSourcePath}
            theme={theme}
          />
        )}
      />
    )
  ) : (
    <div className="markdown-body__content" ref={contentRef}>
      <RenderedMarkdownDocument
        contentScale={contentScale}
        hasToolbar={hasToolbar}
        markdown={markdown}
        noteSourcePath={noteSourcePath}
        theme={theme}
      />
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