"use client";
import { useEffect, useState } from "react";
import { DEFAULT_LOOK } from "@/lib/look-config";

/**
 * The site's look. "new" = black icon sidebar, rounder cards and pills (the Dashboard V18 style); "classic" = the earlier look
 * (top bar, sandwich menu, smaller corners). All of the new look lives in CSS under html[data-look="new"], so going back is one
 * word: change DEFAULT_LOOK in lib/look-config.js to "classic" (everyone), or use the Look switch in the account menu (just
 * that browser).
 */

/** The look right now, and a way to change it for this browser. */
export function useLook() {
  const [look, setLookState] = useState(DEFAULT_LOOK);
  useEffect(() => {
    const read = () => setLookState(document.documentElement.getAttribute("data-look") || DEFAULT_LOOK);
    read();
    window.addEventListener("look-change", read); // the rail's menu and the phone menu both show the switch
    return () => window.removeEventListener("look-change", read);
  }, []);
  const setLook = (value) => {
    document.documentElement.setAttribute("data-look", value);
    try {
      localStorage.setItem("look", value);
    } catch {}
    window.dispatchEvent(new Event("look-change"));
  };
  return [look, setLook];
}
