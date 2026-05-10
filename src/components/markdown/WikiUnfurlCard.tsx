import type { UnfurlResponse } from "../../types";

export function WikiUnfurlCard({ unfurl }: { unfurl: UnfurlResponse }) {
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