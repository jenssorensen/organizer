export function getMarkdownLinkAttributes(href?: string) {
  if (!href) {
    return {};
  }

  if (href.startsWith("#")) {
    return { href };
  }

  return {
    href,
    rel: "noreferrer noopener",
    target: "_blank",
  };
}
