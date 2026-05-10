export function hasMarkdownMathSyntax(markdown: string) {
  const withoutFencedCode = markdown.replace(/```[\s\S]*?```/g, "");
  const withoutInlineCode = withoutFencedCode.replace(/`[^`]*`/g, "");

  return /(^|\n)\s*\$\$[\s\S]+?\$\$\s*(?=\n|$)|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]|(^|[^\\$])\$(?!\s)(?:[^$\n\\]|\\.)+\$(?!\w)/m.test(withoutInlineCode);
}