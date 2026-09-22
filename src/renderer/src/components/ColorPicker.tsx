/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-21
 * --------------------------------------------------------------------------- */

import { useEffect, useRef, useState } from "react";
import { COLOR_SWATCHES, isValidHexColor } from "../model/block-appearance";

/** Props for {@link ColorPicker}. */
interface ColorPickerProps {
  /** The block's own custom color, or undefined if it still uses its kind's
   *  default (see resolvePalette in model/block-appearance.ts). */
  value: string | undefined;
  /** The color to show/edit while {@link value} is undefined, and to revert
   *  to when the "default" swatch is picked. */
  defaultColor: string;
  /** Called with a new `#rrggbb` color, or undefined to clear back to the
   *  kind default. */
  onChange: (color: string | undefined) => void;
}

/**
 * A block's Color section: a row of preset swatches, a native color-dialog
 * trigger for anything not in the presets, and a hex input for typing an
 * exact value — three ways to reach the same `onChange`.
 *
 * @param props - See {@link ColorPickerProps}.
 * @returns The color picker element.
 */
export default function ColorPicker({
  value,
  defaultColor,
  onChange,
}: ColorPickerProps) {
  const resolved = value ?? defaultColor;
  const [hexDraft, setHexDraft] = useState(resolved);
  const nativeInputRef = useRef<HTMLInputElement>(null);

  // Keeps the hex field in sync with a color chosen some other way (a
  // swatch click, or the native picker below) — but not while the user is
  // mid-edit here themselves, or every keystroke would be clobbered by the
  // still-stale `resolved` from before this render.
  useEffect(() => {
    setHexDraft(resolved);
  }, [resolved]);

  // The native color input's own `onChange` (React's prop for the DOM
  // `input` event) fires continuously while the OS picker is still open —
  // committing every one of those to the store would flood undo history
  // with one step per pixel of drag. The real DOM `change` event, listened
  // for directly, fires exactly once, when the picker closes on a value.
  useEffect(() => {
    const el = nativeInputRef.current;
    if (!el) {
      return;
    }
    const handleChange = () => onChange(el.value);
    el.addEventListener("change", handleChange);
    return () => el.removeEventListener("change", handleChange);
  }, [onChange]);

  const hexInvalid = !isValidHexColor(hexDraft);

  /** Commit a valid hex draft, or snap back to the last real color. */
  const commitHex = () => {
    if (isValidHexColor(hexDraft)) {
      onChange(hexDraft.toLowerCase());
    } else {
      setHexDraft(resolved);
    }
  };

  return (
    <div className="color-picker">
      <div
        className="color-picker__swatches"
        role="group"
        aria-label="Preset colors"
      >
        <button
          type="button"
          className={`color-picker__swatch color-picker__swatch--default${
            value ? "" : " is-selected"
          }`}
          title="Default"
          aria-label="Use this kind's default color"
          onClick={() => onChange(undefined)}
        />
        {COLOR_SWATCHES.map((swatch) => (
          <button
            key={swatch}
            type="button"
            className={`color-picker__swatch${
              value === swatch ? " is-selected" : ""
            }`}
            style={{ background: swatch }}
            title={swatch}
            aria-label={`Set color ${swatch}`}
            onClick={() => onChange(swatch)}
          />
        ))}
      </div>
      <div className="color-picker__controls">
        {/* Remounted whenever the resolved color changes from outside (a
            swatch click, or a committed hex edit) so its swatch preview
            stays in sync — `defaultValue` alone wouldn't update on rerender,
            and this stays clear of the `change`-only commit path above. */}
        <input
          key={resolved}
          ref={nativeInputRef}
          type="color"
          defaultValue={resolved}
          className="color-picker__native"
          aria-label="Choose a custom color"
          title="Choose a custom color"
        />
        <input
          type="text"
          className={`color-picker__hex${hexInvalid ? " is-invalid" : ""}`}
          value={hexDraft}
          maxLength={7}
          spellCheck={false}
          aria-label="Custom color hex value"
          onChange={(event) => setHexDraft(event.target.value)}
          onBlur={commitHex}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            } else if (event.key === "Escape") {
              setHexDraft(resolved);
              event.currentTarget.blur();
            }
          }}
        />
      </div>
    </div>
  );
}
