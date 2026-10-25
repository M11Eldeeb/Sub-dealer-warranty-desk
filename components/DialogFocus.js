"use client";
import { useEffect, useRef } from "react";

/**
 * Put this inside a modal (an element with role="dialog"): on open it moves focus into the dialog, keeps Tab inside
 * it, closes it on Escape, and gives focus back to what opened it when it goes away.
 */
export default function DialogFocus({ onClose }) {
  const marker = useRef(null);

  useEffect(() => {
    const dialog = marker.current?.closest('[role="dialog"]');
    const opener = document.activeElement;
    const focusable = () =>
      dialog ? [...dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((e) => !e.disabled && e.offsetParent !== null) : [];
    const first = focusable()[0];
    if (first) first.focus();
    else dialog?.focus();

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
      } else if (e.key === "Tab" && dialog) {
        const items = focusable();
        if (!items.length) return e.preventDefault();
        const a = items[0];
        const z = items[items.length - 1];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          z.focus();
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (opener && typeof opener.focus === "function") opener.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <span ref={marker} className="hidden" aria-hidden="true" />;
}
