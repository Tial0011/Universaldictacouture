import { useEffect, useRef } from "react";

/**
 * Mobile filter sheet. Focus is moved into the sheet, trapped while it
 * is open, and returned to the control that opened it on close.
 * Escape closes it.
 */
export default function FilterDrawer({ isOpen, onClose, title = "Filter", children }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previouslyFocused = document.activeElement;
    closeRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="filter-drawer">
      <button
        type="button"
        className="filter-drawer__scrim"
        aria-label="Close filters"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="filter-drawer__panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="filter-drawer__bar">
          <span className="filter-drawer__title">{title}</span>
          <button
            ref={closeRef}
            type="button"
            className="filter-drawer__close"
            onClick={onClose}
          >
            Done
          </button>
        </div>
        <div className="filter-drawer__body">{children}</div>
      </div>
    </div>
  );
}
