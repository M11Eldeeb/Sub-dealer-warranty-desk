"use client";
import { useEffect, useState } from "react";

const KEY = "theme";

/** "auto" follows the device; "light" / "dark" are the person's own choice, kept on this device. */
function apply(theme) {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") root.setAttribute("data-theme", theme);
  else root.removeAttribute("data-theme");
}

export function useTheme() {
  const [theme, setThemeState] = useState("auto");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY);
      if (saved === "light" || saved === "dark") setThemeState(saved);
    } catch {}
  }, []);

  const setTheme = (next) => {
    setThemeState(next);
    apply(next);
    try {
      if (next === "auto") window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, next);
    } catch {}
  };

  return [theme, setTheme];
}
