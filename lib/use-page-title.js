"use client";
import { useEffect } from "react";

/** Gives the browser tab, history and screen readers a title that says which page this is. */
export function usePageTitle(title) {
  useEffect(() => {
    if (title) document.title = `${title} · WarrantyDesk`;
  }, [title]);
}
