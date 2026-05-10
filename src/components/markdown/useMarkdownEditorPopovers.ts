import { useEffect, useRef, useState, type RefObject } from "react";

export type MarkdownEditorPopoverKey = "heading" | "table" | "link" | "code";
export type MarkdownEditorPopoverPosition = { top: number; left: number };

export function useMarkdownEditorPopovers({
  editorRootRef,
}: {
  editorRootRef: RefObject<HTMLDivElement | null>;
}) {
  const [openPopover, setOpenPopover] = useState<MarkdownEditorPopoverKey | null>(null);
  const [positions, setPositions] = useState<Record<MarkdownEditorPopoverKey, MarkdownEditorPopoverPosition>>({
    heading: { top: 0, left: 0 },
    table: { top: 0, left: 0 },
    link: { top: 0, left: 0 },
    code: { top: 0, left: 0 },
  });

  const headingButtonRef = useRef<HTMLButtonElement>(null);
  const tableButtonRef = useRef<HTMLButtonElement>(null);
  const linkEditorButtonRef = useRef<HTMLButtonElement>(null);
  const codeLanguagePickerButtonRef = useRef<HTMLButtonElement>(null);

  const headingPopoverRef = useRef<HTMLDivElement>(null);
  const tablePopoverRef = useRef<HTMLDivElement>(null);
  const linkEditorPopoverRef = useRef<HTMLDivElement>(null);
  const codeLanguagePickerPopoverRef = useRef<HTMLDivElement>(null);
  const linkEditorInputRef = useRef<HTMLInputElement>(null);

  function getPopoverPosition(trigger: HTMLElement | null) {
    const root = editorRootRef.current;
    if (!root || !trigger) {
      return { top: 0, left: 0 };
    }

    const rootRect = root.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();

    return {
      top: triggerRect.bottom - rootRect.top + 8,
      left: triggerRect.left - rootRect.left,
    };
  }

  function getTriggerRef(popover: MarkdownEditorPopoverKey) {
    switch (popover) {
      case "heading":
        return headingButtonRef;
      case "table":
        return tableButtonRef;
      case "link":
        return linkEditorButtonRef;
      case "code":
        return codeLanguagePickerButtonRef;
    }
  }

  function getPopoverRef(popover: MarkdownEditorPopoverKey) {
    switch (popover) {
      case "heading":
        return headingPopoverRef;
      case "table":
        return tablePopoverRef;
      case "link":
        return linkEditorPopoverRef;
      case "code":
        return codeLanguagePickerPopoverRef;
    }
  }

  function updatePopoverPosition(popover: MarkdownEditorPopoverKey) {
    const trigger = getTriggerRef(popover).current;
    setPositions((current) => ({
      ...current,
      [popover]: getPopoverPosition(trigger),
    }));
  }

  function togglePopover(popover: MarkdownEditorPopoverKey) {
    setOpenPopover((current) => (current === popover ? null : popover));
  }

  function closePopover(popover: MarkdownEditorPopoverKey) {
    setOpenPopover((current) => (current === popover ? null : current));
  }

  function closeAllPopovers() {
    setOpenPopover(null);
  }

  useEffect(() => {
    if (!openPopover) {
      return;
    }

    const currentPopover = openPopover;

    function updateOpenPopoverPosition() {
      updatePopoverPosition(currentPopover);
    }

    updateOpenPopoverPosition();
    window.addEventListener("resize", updateOpenPopoverPosition);
    window.addEventListener("scroll", updateOpenPopoverPosition, true);

    return () => {
      window.removeEventListener("resize", updateOpenPopoverPosition);
      window.removeEventListener("scroll", updateOpenPopoverPosition, true);
    };
  }, [openPopover]);

  useEffect(() => {
    if (openPopover !== "link") {
      return;
    }

    const focusTimer = window.setTimeout(() => linkEditorInputRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [openPopover]);

  useEffect(() => {
    if (!openPopover) {
      return;
    }

    const currentPopover = openPopover;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      const button = getTriggerRef(currentPopover).current;
      const popover = getPopoverRef(currentPopover).current;

      if (button?.contains(target) || popover?.contains(target)) {
        return;
      }

      setOpenPopover(null);
    }

    window.addEventListener("mousedown", handlePointerDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [openPopover]);

  return {
    openPopover,
    isHeadingMenuOpen: openPopover === "heading",
    isTableMenuOpen: openPopover === "table",
    isLinkEditorOpen: openPopover === "link",
    isCodeLanguagePickerOpen: openPopover === "code",
    positions,
    headingButtonRef,
    tableButtonRef,
    linkEditorButtonRef,
    codeLanguagePickerButtonRef,
    headingPopoverRef,
    tablePopoverRef,
    linkEditorPopoverRef,
    codeLanguagePickerPopoverRef,
    linkEditorInputRef,
    toggleHeadingMenu: () => togglePopover("heading"),
    toggleTableMenu: () => togglePopover("table"),
    toggleLinkEditor: () => togglePopover("link"),
    toggleCodeLanguagePicker: () => togglePopover("code"),
    closePopover,
    closeAllPopovers,
  };
}