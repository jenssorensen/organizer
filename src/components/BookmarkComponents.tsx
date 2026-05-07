import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Folder, GripVertical, Pencil, Star, Trash2 } from "lucide-react";
import type { BookmarkNode } from "../types";

const STORED_BOOKMARK_OVERVIEW_SPLIT_KEY = "organizer:bookmark-overview-split:v1";
const MIN_BOOKMARK_TREE_WIDTH = 190;
const RESIZE_HANDLE_RESERVED_WIDTH = 46;

function clampBookmarkOverviewSplitPercent(value: number) {
  return Math.min(52, Math.max(11, value));
}

function getStoredBookmarkOverviewSplitPercent() {
  const defaultPercent = 42;
  if (typeof window === "undefined") {
    return defaultPercent;
  }

  const stored = Number(window.localStorage.getItem(STORED_BOOKMARK_OVERVIEW_SPLIT_KEY));
  return Number.isFinite(stored) ? clampBookmarkOverviewSplitPercent(stored) : defaultPercent;
}

function getMinimumPaneSplitPercent(boundsWidth: number, minPaneWidth: number, minPercent: number, maxPercent: number) {
  if (boundsWidth <= RESIZE_HANDLE_RESERVED_WIDTH) {
    return minPercent;
  }

  const availableWidth = boundsWidth - RESIZE_HANDLE_RESERVED_WIDTH;
  return Math.min(maxPercent, Math.max(minPercent, (minPaneWidth / availableWidth) * 100));
}

function clampPaneSplitPercentForBounds(
  value: number,
  boundsWidth: number,
  minPaneWidth: number,
  minPercent: number,
  maxPercent: number,
) {
  const effectiveMinPercent = getMinimumPaneSplitPercent(boundsWidth, minPaneWidth, minPercent, maxPercent);
  return Math.min(maxPercent, Math.max(effectiveMinPercent, value));
}

function getResizableOverviewColumns(splitPercent: number) {
  return `minmax(${MIN_BOOKMARK_TREE_WIDTH}px, ${splitPercent}fr) auto minmax(260px, ${100 - splitPercent}fr)`;
}

type BookmarkFolderNode = Extract<BookmarkNode, { type: "folder" }>;
type BookmarkLeafNode = Extract<BookmarkNode, { type: "bookmark" }>;

type BookmarkDomainTreeNode =
  | {
      children: BookmarkDomainTreeNode[];
      id: string;
      label: string;
      type: "group";
    }
  | {
      bookmark: BookmarkLeafNode;
      id: string;
      type: "bookmark";
    };

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

function BookmarkOverviewPanel({
  tree,
  selectedBookmarkId,
  onSelect,
  rootLabel = "All bookmarks",
}: {
  tree: BookmarkNode[];
  selectedBookmarkId: string | null;
  onSelect: (nodeId: string | null) => void;
  rootLabel?: string;
}) {
  const normalizedTree = useMemo(() => normalizeBookmarkMenuRoots(tree), [tree]);
  const [overviewSplitPercent, setOverviewSplitPercent] = useState(getStoredBookmarkOverviewSplitPercent());
  const [isResizingOverview, setIsResizingOverview] = useState(false);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(() => collectBookmarkFolderIds(normalizedTree));
  const seenFolderIdsRef = useRef<Set<string>>(new Set());
  const splitRef = useRef<HTMLDivElement | null>(null);
  const selectedTrail = selectedBookmarkId ? getBookmarkTreeTrail(normalizedTree, selectedBookmarkId) : [];
  const activeFolder = getActiveBookmarkFolder(selectedTrail);
  const activeChildren = activeFolder?.children ?? normalizedTree;
  const activeChildFolders = activeChildren.filter((node): node is Extract<BookmarkNode, { type: "folder" }> => node.type === "folder");
  const activeChildBookmarks = activeChildren.filter((node): node is Extract<BookmarkNode, { type: "bookmark" }> => node.type === "bookmark");
  const activeHeading = activeFolder?.title ?? rootLabel;

  useEffect(() => {
    setCollapsedFolderIds((current) => {
      const validFolderIds = collectBookmarkFolderIds(normalizedTree);
      const next = new Set<string>();

      for (const folderId of current) {
        if (validFolderIds.has(folderId)) {
          next.add(folderId);
        }
      }

      for (const folderId of validFolderIds) {
        if (!seenFolderIdsRef.current.has(folderId)) {
          next.add(folderId);
        }
      }

      seenFolderIdsRef.current = validFolderIds;
      return areSetsEqual(current, next) ? current : next;
    });
  }, [normalizedTree]);

  useEffect(() => {
    window.localStorage.setItem(STORED_BOOKMARK_OVERVIEW_SPLIT_KEY, String(overviewSplitPercent));
  }, [overviewSplitPercent]);

  useEffect(() => {
    const boundsWidth = splitRef.current?.getBoundingClientRect().width ?? 0;
    setOverviewSplitPercent((current) => clampPaneSplitPercentForBounds(current, boundsWidth, MIN_BOOKMARK_TREE_WIDTH, 11, 52));
  }, [normalizedTree]);

  useEffect(() => {
    if (!isResizingOverview) {
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      const bounds = splitRef.current?.getBoundingClientRect();
      if (!bounds) {
        return;
      }

      const nextPercent = ((event.clientX - bounds.left) / bounds.width) * 100;
      setOverviewSplitPercent(clampPaneSplitPercentForBounds(nextPercent, bounds.width, MIN_BOOKMARK_TREE_WIDTH, 11, 52));
    }

    function handlePointerUp() {
      setIsResizingOverview(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizingOverview]);

  function toggleFolder(folderId: string) {
    setCollapsedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }

  function handleResizeStart(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsResizingOverview(true);
  }

  function handleResizeKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const boundsWidth = splitRef.current?.getBoundingClientRect().width ?? 0;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setOverviewSplitPercent((current) => clampPaneSplitPercentForBounds(current - 3, boundsWidth, MIN_BOOKMARK_TREE_WIDTH, 11, 52));
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      setOverviewSplitPercent((current) => clampPaneSplitPercentForBounds(current + 3, boundsWidth, MIN_BOOKMARK_TREE_WIDTH, 11, 52));
    }
  }

  return (
    <div className="note-folder-overview bookmark-overview">
      <div
        className={`note-folder-overview__split bookmark-overview__split ${isResizingOverview ? "is-resizing" : ""}`}
        ref={splitRef}
        style={{ gridTemplateColumns: getResizableOverviewColumns(overviewSplitPercent) }}
      >
        <section className="note-folder-overview__section note-folder-overview__section--tree">
          <div className="note-folder-overview__section-header">
            <div className="note-folder-overview__section-heading">
              <h4>Child folders</h4>
            </div>
          </div>
          <div className="note-folder-overview__tree">
            <div className={`tree-folder note-tree-folder ${activeFolder ? "" : "is-selected"}`.trim()}>
              <div className="tree-folder__title">
                <span
                  className="tree-folder__label note-tree-folder__label"
                  onClick={() => onSelect(null)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(null);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <span aria-hidden="true" className="folder-toggle folder-toggle--spacer" />
                  <Folder size={16} />
                  <span>
                    {rootLabel} <span className="tree-folder__count">({countBookmarksInNodes(normalizedTree)})</span>
                  </span>
                </span>
              </div>
              {activeChildFolders.length > 0 || normalizedTree.some((node) => node.type === "folder") ? (
                <div className="tree-folder__children">
                  {normalizedTree
                    .filter((node): node is Extract<BookmarkNode, { type: "folder" }> => node.type === "folder")
                    .map((node) => (
                      <BookmarkOverviewTreeNode
                        activeFolderId={activeFolder?.id ?? null}
                        collapsedFolderIds={collapsedFolderIds}
                        key={node.id}
                        node={node}
                        onSelect={onSelect}
                        onToggleFolder={toggleFolder}
                      />
                    ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <button
          aria-label="Resize bookmark overview panes"
          aria-orientation="vertical"
          className={`note-folder-overview__resize-handle ${isResizingOverview ? "is-active" : ""}`}
          onKeyDown={handleResizeKeyDown}
          onPointerDown={handleResizeStart}
          role="separator"
          type="button"
        >
          <span className="note-folder-overview__resize-line" />
        </button>

        <section className="note-folder-overview__section note-folder-overview__section--notes is-list">
          <div className="note-folder-overview__section-header">
            <div className="note-folder-overview__section-heading">
              <h4>{activeHeading}</h4>
            </div>
          </div>
          <div className="note-folder-overview__notes-body is-list bookmark-overview__list">
            {activeChildBookmarks.length > 0 ? (
              activeChildBookmarks.map((node) => (
                <article className="bookmark-overview__item" key={node.id}>
                  <button
                    className={`note-leaf__main bookmark-overview__select ${selectedBookmarkId === node.id ? "is-selected" : ""}`.trim()}
                    onClick={() => {
                      onSelect(node.id);
                      window.open(node.url, "_blank", "noopener,noreferrer");
                    }}
                    type="button"
                  >
                    <span className="bookmark-overview__icon">
                      <BookmarkIcon icon={node.icon} title={node.title} />
                    </span>
                    <span className="bookmark-overview__body">
                      <strong className="note-leaf__title">{node.title}</strong>
                      <span className="note-leaf__meta">{node.domain}</span>
                    </span>
                  </button>
                  <a
                    className="note-leaf__summary-action bookmark-overview__action"
                    href={node.url}
                    rel="noreferrer"
                    target="_blank"
                    title="Open bookmark"
                  >
                    <ExternalLink size={14} />
                  </a>
                </article>
              ))
            ) : (
              <p className="muted">
                {activeChildFolders.length > 0 ? "No top-level bookmarks in this folder." : "No bookmarks in this folder."}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function BookmarkOverviewTreeNode({
  node,
  activeFolderId,
  collapsedFolderIds,
  onSelect,
  onToggleFolder,
}: {
  node: BookmarkFolderNode;
  activeFolderId: string | null;
  collapsedFolderIds: Set<string>;
  onSelect: (nodeId: string | null) => void;
  onToggleFolder: (folderId: string) => void;
}) {
  const childFolders = node.children.filter((child): child is BookmarkFolderNode => child.type === "folder");
  const isCollapsed = collapsedFolderIds.has(node.id);

  return (
    <div className={`tree-folder note-tree-folder ${activeFolderId === node.id ? "is-selected" : ""}`.trim()}>
      <div className="tree-folder__title">
        {childFolders.length > 0 ? (
          <button
            aria-label={isCollapsed ? `Expand ${node.title}` : `Collapse ${node.title}`}
            className="folder-toggle"
            onClick={() => onToggleFolder(node.id)}
            title={isCollapsed ? `Expand ${node.title}` : `Collapse ${node.title}`}
            type="button"
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
        ) : (
          <span aria-hidden="true" className="folder-toggle folder-toggle--spacer" />
        )}
        <span
          className="tree-folder__label note-tree-folder__label"
          onClick={() => onSelect(node.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(node.id);
            }
          }}
          role="button"
          tabIndex={0}
        >
          <Folder size={16} />
          <span>
            {node.title} <span className="tree-folder__count">({countBookmarksInNodes(node.children)})</span>
          </span>
        </span>
      </div>
      {childFolders.length > 0 && !isCollapsed ? (
        <div className="tree-folder__children">
          {childFolders.map((child) => (
            <BookmarkOverviewTreeNode
              activeFolderId={activeFolderId}
              collapsedFolderIds={collapsedFolderIds}
              key={child.id}
              node={child}
              onSelect={onSelect}
              onToggleFolder={onToggleFolder}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BookmarkDomainTree({
  compact,
  onSelect,
  selectedBookmarkId,
  tree,
}: {
  compact: boolean;
  onSelect: (nodeId: string | null) => void;
  selectedBookmarkId: string | null;
  tree: BookmarkNode[];
}) {
  const domainTree = useMemo(() => buildBookmarkDomainTree(normalizeBookmarkMenuRoots(tree)), [tree]);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(() => collectDomainGroupIds(domainTree));
  const seenGroupIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setCollapsedGroupIds((current) => {
      const validGroupIds = collectDomainGroupIds(domainTree);
      const next = new Set<string>();

      for (const groupId of current) {
        if (validGroupIds.has(groupId)) {
          next.add(groupId);
        }
      }

      for (const groupId of validGroupIds) {
        if (!seenGroupIdsRef.current.has(groupId)) {
          next.add(groupId);
        }
      }

      seenGroupIdsRef.current = validGroupIds;

      return next;
    });
  }, [domainTree]);

  function toggleGroup(groupId: string) {
    setCollapsedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  return (
    <div className={`bookmark-tree bookmark-tree--hero bookmark-domain-tree ${compact ? "is-compact" : ""}`}>
      {domainTree.map((node) => (
        <BookmarkDomainTreeNodeRow
          collapsedGroupIds={collapsedGroupIds}
          key={node.id}
          node={node}
          onSelect={onSelect}
          onToggleGroup={toggleGroup}
          selectedBookmarkId={selectedBookmarkId}
        />
      ))}
    </div>
  );
}

function BookmarkDomainTreeNodeRow({
  collapsedGroupIds,
  node,
  onSelect,
  onToggleGroup,
  selectedBookmarkId,
}: {
  collapsedGroupIds: Set<string>;
  node: BookmarkDomainTreeNode;
  onSelect: (nodeId: string | null) => void;
  onToggleGroup: (groupId: string) => void;
  selectedBookmarkId: string | null;
}) {
  if (node.type === "bookmark") {
    return (
      <article
        className={`bookmark-card bookmark-card--tree bookmark-domain-tree__bookmark ${selectedBookmarkId === node.bookmark.id ? "is-selected" : ""}`}
        onClick={() => onSelect(node.bookmark.id)}
      >
        <div className="bookmark-card__top">
          <span className="tree-folder__label">
            <BookmarkIcon icon={node.bookmark.icon} title={node.bookmark.title} />
          </span>
          <div className="bookmark-card__content">
            <h4>
              <a
                href={node.bookmark.url}
                onClick={(event) => event.stopPropagation()}
                rel="noreferrer"
                target="_blank"
              >
                {node.bookmark.title}
              </a>
            </h4>
            <a
              href={node.bookmark.url}
              onClick={(event) => event.stopPropagation()}
              rel="noreferrer"
              target="_blank"
            >
              {node.bookmark.url}
            </a>
          </div>
        </div>
      </article>
    );
  }

  const isCollapsed = collapsedGroupIds.has(node.id);

  return (
    <div className="tree-folder bookmark-domain-tree__group">
      <div className="tree-folder__title">
        <button className="tree-folder__label bookmark-domain-tree__group-label" onClick={() => onToggleGroup(node.id)} type="button">
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          <Folder size={16} />
          <span>{node.label}</span>
        </button>
      </div>
      {!isCollapsed ? (
        <div className="tree-folder__children">
          {node.children.map((child) => (
            <BookmarkDomainTreeNodeRow
              collapsedGroupIds={collapsedGroupIds}
              key={child.id}
              node={child}
              onSelect={onSelect}
              onToggleGroup={onToggleGroup}
              selectedBookmarkId={selectedBookmarkId}
            />
          ))}
        </div>
      ) : null}
    </div>
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
  return (
    normalized === "favorites" ||
    normalized === "favorites bar" ||
    normalized === "bookmarks bar" ||
    normalized === "bookmarks" ||
    normalized === "bookmarks menu" ||
    normalized === "other bookmarks" ||
    normalized === "mobile bookmarks"
  );
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

function areSetsEqual(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
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

function getBookmarkTreeTrail(nodes: BookmarkNode[], targetId: string): BookmarkNode[] {
  for (const node of nodes) {
    if (node.id === targetId) {
      return [node];
    }

    if (node.type !== "folder") {
      continue;
    }

    const childTrail = getBookmarkTreeTrail(node.children, targetId);
    if (childTrail.length > 0) {
      return [node, ...childTrail];
    }
  }

  return [];
}

function getActiveBookmarkFolder(trail: BookmarkNode[]) {
  if (trail.length === 0) {
    return null;
  }

  const lastNode = trail[trail.length - 1];
  if (lastNode?.type === "folder") {
    return lastNode;
  }

  for (let index = trail.length - 1; index >= 0; index -= 1) {
    const node = trail[index];
    if (node?.type === "folder") {
      return node;
    }
  }

  return null;
}

function countBookmarksInNodes(nodes: BookmarkNode[]): number {
  return nodes.reduce((count, node) => {
    if (node.type === "bookmark") {
      return count + 1;
    }

    return count + countBookmarksInNodes(node.children);
  }, 0);
}

function collectBookmarkFolderIds(nodes: BookmarkNode[], acc: Set<string> = new Set<string>()) {
  for (const node of nodes) {
    if (node.type !== "folder") {
      continue;
    }

    acc.add(node.id);
    collectBookmarkFolderIds(node.children, acc);
  }

  return acc;
}

function buildBookmarkDomainTree(nodes: BookmarkNode[]): BookmarkDomainTreeNode[] {
  const rootMap = new Map<string, BookmarkDomainTreeNode>();

  for (const bookmark of flattenBookmarkLeaves(nodes)) {
    const { baseDomain, subdomains } = splitDomainParts(bookmark.domain);
    const rootId = `domain:${baseDomain}`;
    let currentNode = rootMap.get(rootId);

    if (!currentNode || currentNode.type !== "group") {
      currentNode = { children: [], id: rootId, label: baseDomain, type: "group" };
      rootMap.set(rootId, currentNode);
    }

    let currentGroup = currentNode;
    let pathKey = baseDomain;
    for (const subdomain of subdomains) {
      pathKey = `${pathKey}.${subdomain}`;
      const nextGroupId = `domain:${pathKey}`;
      let nextGroup = currentGroup.children.find((child) => child.type === "group" && child.id === nextGroupId);
      if (!nextGroup || nextGroup.type !== "group") {
        nextGroup = { children: [], id: nextGroupId, label: subdomain, type: "group" };
        currentGroup.children.push(nextGroup);
      }
      currentGroup = nextGroup;
    }

    currentGroup.children.push({ bookmark, id: `domain-bookmark:${bookmark.id}`, type: "bookmark" });
  }

  return sortBookmarkDomainNodes([...rootMap.values()]);
}

function sortBookmarkDomainNodes(nodes: BookmarkDomainTreeNode[]): BookmarkDomainTreeNode[] {
  return [...nodes]
    .sort((left, right) => {
      if (left.type === right.type) {
        const leftLabel = left.type === "group" ? left.label : left.bookmark.title;
        const rightLabel = right.type === "group" ? right.label : right.bookmark.title;
        return leftLabel.localeCompare(rightLabel);
      }

      return left.type === "group" ? -1 : 1;
    })
    .map((node) => {
      if (node.type === "group") {
        return { ...node, children: sortBookmarkDomainNodes(node.children) };
      }

      return node;
    });
}

function collectDomainGroupIds(nodes: BookmarkDomainTreeNode[], acc: Set<string> = new Set<string>()) {
  for (const node of nodes) {
    if (node.type !== "group") {
      continue;
    }

    acc.add(node.id);
    collectDomainGroupIds(node.children, acc);
  }

  return acc;
}

function flattenBookmarkLeaves(nodes: BookmarkNode[]): BookmarkLeafNode[] {
  return nodes.flatMap((node) => {
    if (node.type === "bookmark") {
      return [node];
    }

    return flattenBookmarkLeaves(node.children);
  });
}

function splitDomainParts(domain: string) {
  const normalizedDomain = domain.trim().toLowerCase();
  const labels = normalizedDomain.split(".").filter(Boolean);
  const normalizedLabels = labels[0] === "www" ? labels.slice(1) : labels;

  if (normalizedLabels.length <= 2) {
    return { baseDomain: normalizedLabels.join("."), subdomains: [] as string[] };
  }

  return {
    baseDomain: normalizedLabels.slice(-2).join("."),
    subdomains: normalizedLabels.slice(0, -2).reverse(),
  };
}

export { BookmarkTreeNode, BookmarkMenuBar, BookmarkMenuNode, BookmarkIcon, BookmarkDomainTree, BookmarkOverviewPanel, normalizeBookmarkMenuRoots };
