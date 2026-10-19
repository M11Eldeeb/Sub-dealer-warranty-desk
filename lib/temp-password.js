import { randomInt } from "node:crypto";

const WORDS = [
  "amber", "cedar", "delta", "ember", "flint", "grove", "haven", "inlet",
  "jade", "karst", "lumen", "maple", "nomad", "opal", "pixel", "quartz",
  "ridge", "slate", "tundra", "unity", "vapor", "willow", "xenon", "yield",
];

/** Human-typeable temporary password: word-word-4digits. */
export function generateTempPassword() {
  return `${WORDS[randomInt(WORDS.length)]}-${WORDS[randomInt(WORDS.length)]}-${randomInt(1000, 10000)}`;
}
