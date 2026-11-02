/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-02
 * --------------------------------------------------------------------------- */

// Shared identifier rules for every editable name in the app: the diagram
// title, block names, and port names. A name must start with a letter and then
// contain only word characters joined by single separators — never two in a
// row. Diagram and block names allow spaces as a separator and digits after the
// leading letter (so "Module 2" is valid); port names allow neither.

/** Which characters and separators a given field permits. */
export interface NameRules {
  /** Whether a space may separate words (diagram/block names yes, ports no). */
  allowSpaces: boolean;
  /**
   * Whether digits are allowed after the leading letter, along with an optional
   * trailing `<n>` index (component names yes, port names no).
   */
  allowDigits: boolean;
}

/**
 * Build the "finished value" and "still-typing" patterns for a rule set.
 *
 * @param rules - The characters and separators this field allows.
 * @returns A complete-match and a partial-match regular expression.
 */
function patternsFor(rules: NameRules): { complete: RegExp; partial: RegExp } {
  const sep = rules.allowSpaces ? "[ _-]" : "[_-]";
  const word = rules.allowDigits ? "[A-Za-z0-9]" : "[A-Za-z]";
  const core = `[A-Za-z]${word}*(?:${sep}${word}+)*`;
  return {
    complete: new RegExp(`^${core}$`),
    // Empty, or a core value, or a core value with one dangling separator the
    // user is about to type past.
    partial: new RegExp(`^(?:${core}${sep}?)?$`),
  };
}

/**
 * Whether a string is a fully valid name worth committing to the model.
 *
 * @param value - The candidate name.
 * @param rules - The separators this field allows.
 * @returns True if every naming rule is satisfied.
 */
export function isCompleteName(value: string, rules: NameRules): boolean {
  return patternsFor(rules).complete.test(value);
}

/**
 * Whether a field should accept a proposed value as the user types. Permits the
 * empty string and one trailing separator so "clk" can grow into "clk_en", but
 * blocks a bad first character or a doubled separator at the keystroke.
 *
 * @param value - The value the field would hold after this keystroke.
 * @param rules - The separators this field allows.
 * @returns True if the keystroke should register.
 */
export function acceptsNameInput(value: string, rules: NameRules): boolean {
  return patternsFor(rules).partial.test(value);
}

/**
 * Next auto-numbered name built from a fixed prefix: `base` followed by the
 * lowest positive number not already worn by a sibling with that same
 * prefix. Gaps *are* backfilled — "Port 1", "Port 2", "Port 3" with "Port 2"
 * deleted yields "Port 2" again, not "Port 4".
 *
 * @param base - The name's fixed prefix, e.g. "Port".
 * @param existingNames - Names already in use by siblings.
 * @returns e.g. "Port 2".
 */
export function nextNumberedName(
  base: string,
  existingNames: readonly string[],
): string {
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const numbered = new RegExp(`^${escaped} (\\d+)$`);
  const used = new Set<number>();
  for (const name of existingNames) {
    const match = numbered.exec(name);
    if (match) {
      used.add(Number(match[1]));
    }
  }
  let n = 1;
  while (used.has(n)) {
    n += 1;
  }
  return `${base} ${n}`;
}
