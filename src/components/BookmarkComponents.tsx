import { type RefObject } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Folder, GripVertical, Pencil, Star, Trash2 } from "lucide-react";
import type { BookmarkNode } from "../types";

function BookmarkTreeNode({
  node,
  compact,
  expandedFolderIds,
  selectedBookmarkId,
  draggedBookmarkId,
  onSelect,
  onEdit,
  onDelete,
  onDragStart,
  onDragEnd,
  onDrop,
  onToggleFolder,
}: {
  node: BookmarkNode;
  compact: boolean;
  expandedFolderIds: Set<string>;
  selectedBookmarkId: string | null;
  draggedBookmarkId: string | null;
  onSelect: (nodeId: string) => void;
  onEdit: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onDragStart: (nodeId: string) => void;
  onDragEnd: () => void;
  onDrop: (targetId: string, placement: "before" | "inside") => void;
  onToggleFolder: (folderId: string) => void;
}) {
  const isSelected = selectedBookmarkId === node.id;
  const isDragging = draggedBookmarkId === node.id;

  if (node.type === "folder") {
    const isExpanded = expandedFolderIds.has(node.id);
    return (
      <div
        className={`tree-folder ${compact ? "is-compact" : ""} ${isSelected ? "is-selected" : ""} ${
          isDragging ? "is-dragging" : ""
        }`}
        draggable
        onClick={() => onSelect(node.id)}
        onDragEnd={onDragEnd}
        onDragOver={(event) => event.preventDefault()}
        onDragStart={() => onDragStart(node.id)}
        onDrop={() => onDrop(node.id, "inside")}
      >
        <div className="tree-folder__title">
          <span className="tree-folder__label">
            <button
              className="folder-toggle"
              onClick={(event) => {
                event.stopPropagation();
                onToggleFolder(node.id);
              }}
              type="button"
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            <GripVertical size={14} className="drag-handle" />
            <Folder size={16} />
            <span>{node.title}</span>
          </span>
          <span className="tree-row__actions">
            <button
              className="icon-action"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(node.id);
              }}
              type="button"
            >
              <Pencil size={14} />
            </button>
            <button
              className="icon-action"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(node.id);
              }}
              type="button"
            >
              <Trash2 size={14} />
            </button>
          </span>
        </div>
        {isExpanded ? (
          <div className="tree-folder__children">
            {node.children.map((child) => (
              <div key={child.id} onDragOver={(event) => event.preventDefault()} onDrop={() => onDrop(child.id, "before")}>
                <BookmarkTreeNode
                  compact={compact}
                  draggedBookmarkId={draggedBookmarkId}
                  expandedFolderIds={expandedFolderIds}
                  node={child}
                  onDelete={onDelete}
                  onDragEnd={onDragEnd}
                  onDragStart={onDragStart}
                  onDrop={onDrop}
                  onEdit={onEdit}
                  onSelect={onSelect}
                  selectedBookmarkId={selectedBookmarkId}
                  onToggleFolder={onToggleFolder}
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <article
      className={`bookmark-card bookmark-card--tree ${compact ? "is-compact" : ""} ${isSelected ? "is-selected" : ""} ${
        isDragging ? "is-dragging" : ""
      }`}
      draggable
      onClick={() => onSelect(node.id)}
      onDragEnd={onDragEnd}
      onDragStart={() => onDragStart(node.id)}
    >
      <div className="bookmark-card__top">
        <span className="tree-folder__label">
          <GripVertical size={14} className="drag-handle" />
          <BookmarkIcon icon={node.icon} title={node.title} />
        </span>
        <div className="bookmark-card__content">
          <h4>
            <a
              href={node.url}
              onClick={(event) => event.stopPropagation()}
              rel="noreferrer"
              target="_blank"
            >
              {node.title}
            </a>
          </h4>
          <a
            href={node.url}
            onClick={(event) => event.stopPropagation()}
            rel="noreferrer"
            target="_blank"
          >
            {node.domain}
          </a>
        </div>
        <span className="tree-row__actions">
          <button
            className="icon-action"
            onClick={(event) => {
              event.stopPropagation();
              onEdit(node.id);
            }}
            type="button"
          >
            <Pencil size={14} />
          </button>
          <button
            className="icon-action"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(node.id);
            }}
            type="button"
          >
            <Trash2 size={14} />
          </button>
        </span>
      </div>
      {node.description ? <p>{node.description}</p> : null}
      <div className="tag-row">
        {node.tags.map((tag) => (
          <span key={tag} className="tag">
            #{tag}
          </span>
        ))}
      </div>
    </article>
  );
}

function BookmarkMenuBar({
  nodes,
  compact,
  menuBarRef,
  openMenuPath,
  onCloseMenus,
  onOpenMenuPath,
  selectedBookmarkId,
  onSelect,
  onToggleStar,
}: {
  nodes: BookmarkNode[];
  compact: boolean;
  menuBarRef: RefObject<HTMLDivElement | null>;
  openMenuPath: string[];
  onCloseMenus: () => void;
  onOpenMenuPath: (path: string[]) => void;
  selectedBookmarkId: string | null;
  onSelect: (nodeId: string) => void;
  onToggleStar: (bookmarkId: string, nextStarred: boolean) => void;
}) {
  const menuNodes = normalizeBookmarkMenuRoots(nodes);

  return (
    <div className={`bookmark-menubar ${compact ? "is-compact" : ""}`} ref={menuBarRef}>
      {menuNodes.map((node, index) => (
        <BookmarkMenuNode
          compact={compact}
          key={`menu-root:${node.id}:${index}`}
          menuBarRef={menuBarRef}
          node={node}
          onCloseMenus={onCloseMenus}
          onOpenMenuPath={onOpenMenuPath}
          onSelect={onSelect}
          onToggleStar={onToggleStar}
          openMenuPath={openMenuPath}
          path={[node.id]}
          selectedBookmarkId={selectedBookmarkId}
          topLevel
        />
      ))}
    </div>
  );
}

function BookmarkMenuNode({
  node,
  compact,
  menuBarRef,
  path,
  topLevel = false,
  openMenuPath,
  onCloseMenus,
  onOpenMenuPath,
  selectedBookmarkId,
  onSelect,
  onToggleStar,
}: {
  node: BookmarkNode;
  compact: boolean;
  menuBarRef: RefObject<HTMLDivElement | null>;
  path: string[];
  topLevel?: boolean;
  openMenuPath: string[];
  onCloseMenus: () => void;
  onOpenMenuPath: (path: string[]) => void;
  selectedBookmarkId: string | null;
  onSelect: (nodeId: string) => void;
  onToggleStar: (bookmarkId: string, nextStarred: boolean) => void;
}) {
  const isSelected = selectedBookmarkId === node.id;

  if (node.type === "folder") {
    const isExpanded = isPathPrefix(path, openMenuPath);
    const orderedChildren = topLevel ? node.children : orderSubmenuNodes(node.children);
    return (
      <div
        className={`menu-folder ${topLevel ? "is-top" : "is-submenu"} ${isExpanded ? "is-open" : ""}`}
        onMouseEnter={() => {
          if (topLevel && openMenuPath.length > 0) {
            onOpenMenuPath(path);
          } else if (!topLevel && openMenuPath.length > 0) {
            onOpenMenuPath(path);
          }
        }}
      >
        <button
          className={`menu-folder__title ${topLevel ? "is-top" : "is-submenu"} ${compact ? "is-compact" : ""} ${
            isSelected ? "is-selected" : ""
          }`}
          onClick={() => {
            onSelect(node.id);
            if (topLevel) {
              onOpenMenuPath(isExpanded ? [] : path);
            } else {
              onOpenMenuPath(path);
            }
          }}
          type="button"
        >
          <span className="menu-folder__label">
            {topLevel ? null : <Folder size={15} />}
            <span>{node.title}</span>
          </span>
          {topLevel ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {isExpanded ? (
          <div className={`menu-flyout ${compact ? "is-compact" : ""} ${topLevel ? "is-top" : "is-submenu"}`}>
            {orderedChildren.map((child, index) => (
              <BookmarkMenuNode
                compact={compact}
                key={`menu-node:${path.join(">")}:${child.id}:${index}`}
                menuBarRef={menuBarRef}
                node={child}
                onCloseMenus={onCloseMenus}
                onOpenMenuPath={onOpenMenuPath}
                onSelect={onSelect}
                onToggleStar={onToggleStar}
                openMenuPath={openMenuPath}
                path={child.type === "folder" ? [...path, child.id] : path}
                selectedBookmarkId={selectedBookmarkId}
                topLevel={false}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <article
      className={`menu-bookmark ${compact ? "is-compact" : ""} ${isSelected ? "is-selected" : ""} ${
        topLevel ? "is-top" : ""
      }`}
      aria-label={node.title}
      onClick={() => {
        onSelect(node.id);
        onCloseMenus();
        window.open(node.url, "_blank", "noopener,noreferrer");
      }}
      title={node.url}
    >
      <BookmarkIcon icon={node.icon} title={node.title} />
      {topLevel ? null : (
        <div className="menu-bookmark__body">
          <h4 className="menu-bookmark__title">
            <a
              href={node.url}
              onClick={(event) => event.stopPropagation()}
              rel="noreferrer"
              target="_blank"
            >
              {node.title}
            </a>
          </h4>
          <a
            href={node.url}
            onClick={(event) => event.stopPropagation()}
            rel="noreferrer"
            target="_blank"
          >
            {node.domain}
          </a>
          {!compact && node.description ? <p>{node.description}</p> : null}
        </div>
      )}
      {topLevel ? null : (
        <div className="menu-bookmark__actions">
          <button
            aria-label={node.starred ? `Remove star from ${node.title}` : `Add star to ${node.title}`}
            className={`icon-action menu-bookmark__star ${node.starred ? "is-active" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleStar(node.id, !node.starred);
            }}
            title={node.starred ? "Remove star" : "Add star"}
            type="button"
          >
            <Star fill={node.starred ? "currentColor" : "none"} size={14} />
          </button>
          <ExternalLink size={14} className="menu-bookmark__chevron" />
        </div>
      )}
    </article>
  );
}

function BookmarkIcon({ icon, title }: { icon: string; title: string }) {
  if (icon.startsWith("data:image")) {
    return <img className="bookmark-favicon bookmark-favicon--image" src={icon} alt={title} />;
  }

  return <div className="bookmark-favicon">{icon}</div>;
}

function isFavoritesRoot(title: string) {
  const normalized = title.trim().toLowerCase();
  return normalized === "favorites" || normalized === "favorites bar" || normalized === "bookmarks bar";
}

function normalizeBookmarkMenuRoots(nodes: BookmarkNode[]) {
  const normalized: BookmarkNode[] = [];

  for (const node of nodes) {
    if (node.type === "folder" && isFavoritesRoot(node.title)) {
      normalized.push(...node.children);
      continue;
    }

    normalized.push(node);
  }

  return normalized;
}

function orderSubmenuNodes(nodes: BookmarkNode[]) {
  const folders: BookmarkNode[] = [];
  const bookmarks: BookmarkNode[] = [];

  for (const node of nodes) {
    if (node.type === "folder") {
      folders.push(node);
      continue;
    }

    bookmarks.push(node);
  }

  return [...folders, ...bookmarks];
}

function isPathPrefix(path: string[], openPath: string[]) {
  return path.every((segment, index) => openPath[index] === segment);
}

export { BookmarkTreeNode, BookmarkMenuBar, BookmarkMenuNode, BookmarkIcon };
