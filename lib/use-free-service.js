"use client";
import { useEffect, useState } from "react";

const KEY = "freeServiceStatus";
let inflight = null;
let latest = null; // the newest answer from the server, kept for components that mount later

const readCache = (role, userId) => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) || "null");
    if (saved && saved.role === role && saved.userId === userId) return saved;
  } catch {}
  return null;
};

const writeCache = (value) => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {}
};

/** One request per page load, shared by every component that asks. */
function fetchStatus() {
  if (!inflight) {
    inflight = fetch("/api/free-service/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((fresh) => {
        if (fresh) latest = { role: fresh.role, userId: fresh.userId, canUse: fresh.canUse, pending: fresh.pending, actions: fresh.actions };
        return fresh;
      })
      .catch(() => null)
      .finally(() => {
        setTimeout(() => (inflight = null), 1500);
      });
  }
  return inflight;
}

/**
 * Whether the signed-in person can use Free Service (and how many requests wait for the dealer).
 * It answers at once - dealer and admin always can, and anyone else gets what was true last time -
 * then quietly checks with the server, so the button is there the moment the page is.
 */
export function useFreeService(role, userId) {
  const [status, setStatus] = useState(() => {
    if (typeof window === "undefined" || !role) return null;
    if (latest && latest.role === role && latest.userId === userId) return latest;
    const cached = readCache(role, userId);
    if (cached) return cached;
    return role === "dealer" || role === "admin" || role === "manager" ? { role, userId, canUse: true, pending: null } : null;
  });

  useEffect(() => {
    if (!role) return;
    let alive = true;
    fetchStatus().then((fresh) => {
      if (!alive || !fresh) return;
      const next = { role: fresh.role, userId: fresh.userId, canUse: fresh.canUse, pending: fresh.pending, actions: fresh.actions };
      writeCache(next);
      setStatus(next);
    });
    return () => {
      alive = false;
    };
  }, [role, userId]);

  return status;
}

// Ask as soon as this file loads - before the page has finished loading its own data - so the answer is usually
// already here when the button first draws.
if (typeof window !== "undefined") fetchStatus();
