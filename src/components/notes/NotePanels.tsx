import { useState } from "react";
import { Check, Folder, Plus, Trash2, X } from "lucide-react";

export function TrashPanel({
  entries,
  onClose,
  onRestore,
  onPurge,
  onPurgeAll,
}: {
  entries: Array<{ id: string; sourcePath: string; title: string; deletedAt: string }>;
  onClose: () => void;
  onRestore: (id: string) => void;
  onPurge: (id: string) => void;
  onPurgeAll: () => void;
}) {
  return (
    <div className="dialog-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div aria-labelledby="trash-panel-title" className="dialog-card trash-panel" role="dialog">
        <div className="dialog-card__header">
          <div>
            <p className="eyebrow">Deleted notes</p>
            <h3 id="trash-panel-title">Trash {entries.length > 0 ? `(${entries.length})` : ""}</h3>
          </div>
          <div className="trash-panel__header-actions">
            {entries.length > 0 ? (
              <button className="mini-action" onClick={onPurgeAll} type="button">
                <Trash2 size={13} />
                Empty trash
              </button>
            ) : null}
            <button aria-label="Close trash" className="icon-action" onClick={onClose} title="Close" type="button">
              <X size={14} />
            </button>
          </div>
        </div>
        {entries.length === 0 ? (
          <p className="dialog-card__body trash-panel__empty">Trash is empty - deleted notes will appear here for recovery.</p>
        ) : (
          <div className="trash-panel__list">
            {entries.map((entry) => {
              const deletedLabel = `Deleted ${new Date(entry.deletedAt).toLocaleString()}`;
              const descriptionLabel = `${entry.sourcePath} · ${deletedLabel}`;

              return (
                <div className="trash-panel__entry" key={entry.id}>
                  <div className="trash-panel__entry-info">
                    <strong className="trash-panel__entry-title" title={entry.title}>{entry.title}</strong>
                    <span className="muted trash-panel__entry-description" title={descriptionLabel}>{descriptionLabel}</span>
                  </div>
                  <div className="trash-panel__entry-actions">
                    <button className="mini-action" onClick={() => onRestore(entry.id)} type="button">Restore</button>
                    <button className="mini-action" onClick={() => onPurge(entry.id)} type="button">Delete forever</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function DailyNoteNavigator({
  currentDate,
  onSelectDate,
}: {
  currentDate: string;
  onSelectDate: (date: string) => void;
}) {
  const [selectedDate, setSelectedDate] = useState(currentDate || new Date().toISOString().slice(0, 10));

  function navigateDay(offset: number) {
    const date = new Date(`${selectedDate}T00:00:00`);
    date.setDate(date.getDate() + offset);
    const nextDate = date.toISOString().slice(0, 10);
    setSelectedDate(nextDate);
    onSelectDate(nextDate);
  }

  return (
    <div className="daily-note-nav">
      <button className="mini-action" onClick={() => navigateDay(-1)} type="button">←</button>
      <input
        aria-label="Daily note date"
        className="daily-note-nav__date"
        onChange={(event) => {
          setSelectedDate(event.target.value);
          onSelectDate(event.target.value);
        }}
        type="date"
        value={selectedDate}
      />
      <button className="mini-action" onClick={() => navigateDay(1)} type="button">→</button>
      <button
        className="mini-action"
        onClick={() => {
          const today = new Date().toISOString().slice(0, 10);
          setSelectedDate(today);
          onSelectDate(today);
        }}
        type="button"
      >
        Today
      </button>
    </div>
  );
}

export function WorkspaceSwitcher({
  workspaces,
  onSwitch,
  onAdd,
  onRemove,
}: {
  workspaces: Array<{ id: string; label: string; path: string; isActive: boolean }>;
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="workspace-switcher">
      <div className="workspace-switcher__header">
        <h5>Workspaces</h5>
        <button className="mini-action" onClick={onAdd} type="button">
          <Plus size={14} /> Add
        </button>
      </div>
      <div className="workspace-switcher__list">
        {workspaces.map((workspace) => (
          <div className={`workspace-switcher__item ${workspace.isActive ? "is-active" : ""}`} key={workspace.id}>
            <button className="workspace-switcher__item-main" onClick={() => onSwitch(workspace.id)} type="button">
              <Folder size={14} />
              <div>
                <strong>{workspace.label}</strong>
                <span className="muted">{workspace.path}</span>
              </div>
              {workspace.isActive ? <Check size={14} /> : null}
            </button>
            {!workspace.isActive ? (
              <button aria-label={`Remove workspace ${workspace.label}`} className="icon-action" onClick={() => onRemove(workspace.id)} title="Remove workspace" type="button">
                <X size={14} />
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}