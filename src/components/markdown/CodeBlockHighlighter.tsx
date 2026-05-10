import { useState } from "react";
import { Check, Copy } from "lucide-react";
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

export function CodeBlockHighlighter({
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
      <SyntaxHighlighter PreTag="div" language={language} style={theme === "dark" ? oneDark : oneLight}>
        {code}
      </SyntaxHighlighter>
    </div>
  );
}