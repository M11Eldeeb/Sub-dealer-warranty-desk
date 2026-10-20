"use client";
import { MotionConfig } from "framer-motion";

/** Makes every framer-motion animation respect the visitor's "reduce motion" setting. */
export default function MotionProvider({ children }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
