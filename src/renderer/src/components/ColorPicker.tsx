/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { hexToRgb, isValidHexColor } from "../model/block-appearance";
import {
  hexToHsv,
  hsvToHex,
  rgbToHex,
  snapToWheel,
  type Hsv,
} from "../model/color-math";
import NumericField from "./NumericField";

/** Outer diameter of the hue ring, in CSS pixels. */
const WHEEL_SIZE = 168;
/** Thickness of the hue ring. */
const RING_WIDTH = 16;

/** Props for {@link ColorPicker}. */
interface ColorPickerProps {
  /** The block's own custom color, or undefined if it still uses its kind's
   *  default (see resolvePalette in model/block-appearance.ts). */
  value: string | undefined;
  /** The color to show/edit while {@link value} is undefined, and to revert
   *  to when the "default" swatch is picked. */
  defaultColor: string;
  /** Called with a new `#rrggbb` color, or undefined to clear back to the
   *  kind default — one undo step each. */
  onChange: (color: string | undefined) => void;
  /** Called once when a ring drag starts, before any {@link onPreview},
   *  so the whole drag can collapse into one undo step. */
  onPreviewStart: () => void;
  /** Called with every color a ring drag passes through. */
  onPreview: (color: string) => void;
  /** Called with the color a ring drag ends on. */
  onPreviewEnd: (color: string) => void;
  /** The one-click swatches after the "default" one, in order. */
  swatches: readonly string[];
}

/**
 * A block's Color section: a hue ring of fully saturated, full-brightness
 * colors, a row of recent/preset swatches, and hex + R/G/B fields for exact
 * values. A typed value is snapped to the nearest color on the ring, so the
 * fields and the ring always agree. Every
 * control reads from and writes to the same color, so changing any one moves
 * all the others.
 *
 * @param props - See {@link ColorPickerProps}.
 * @returns The color picker element.
 */
export default function ColorPicker({
  value,
  defaultColor,
  onChange,
  onPreviewStart,
  onPreview,
  onPreviewEnd,
  swatches,
}: ColorPickerProps) {
  const resolved = value ?? defaultColor;
  // Hue is held here rather than always derived from `resolved`: a grey
  // has no hue, so deriving it would snap the ring's thumb back to red the
  // moment a color passes through one.
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(resolved));
  const [hexDraft, setHexDraft] = useState(resolved.slice(1));
  const wheelRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Follow a color set from outside (a swatch, the hex/RGB fields, undo) —
  // unless it's the one this picker's own HSV already produces, which is
  // what keeps a held hue alive through greys.
  useEffect(() => {
    setHexDraft(resolved.slice(1));
    setHsv((current) =>
      hsvToHex(current) === resolved.toLowerCase() ? current : hexToHsv(resolved),
    );
  }, [resolved]);

  const [r, g, b] = hexToRgb(resolved);
  const hexInvalid = !isValidHexColor(`#${hexDraft}`);

  // Bumped on every typed commit, to remount the R/G/B fields: when a typed
  // value snaps back to the color already showing, nothing else changes to
  // make them drop what was typed.
  const [entryNonce, setEntryNonce] = useState(0);

  /**
   * Apply a typed color, snapped to the nearest one the ring can produce
   * (see snapToWheel) — so the Hex and R/G/B fields only ever hold a color
   * that's a point on the ring.
   *
   * @param typed - The color as typed.
   */
  const commitTyped = (typed: string) => {
    const snapped = snapToWheel(typed, hsv.h);
    setEntryNonce((n) => n + 1);
    setHexDraft(snapped.slice(1));
    if (snapped !== resolved.toLowerCase()) {
      onChange(snapped);
    }
  };

  /** Commit a valid hex draft (snapped to the ring), or snap back. */
  const commitHex = () => {
    if (!hexInvalid) {
      commitTyped(`#${hexDraft.toLowerCase()}`);
    } else {
      setHexDraft(resolved.slice(1));
    }
  };

  /**
   * Turn a pointer position on the ring into a new hue, and preview it.
   *
   * @param event - The pointer event carrying the position.
   */
  const dragTo = (event: ReactPointerEvent) => {
    if (!dragging.current || !wheelRef.current) {
      return;
    }
    const box = wheelRef.current.getBoundingClientRect();
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height / 2);
    // 0° at the top, increasing clockwise — the direction the ring's
    // conic-gradient is painted in (app.css, COLOR PICKER).
    const h = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    // The ring makes only full-strength hues — the same set typed colors
    // are snapped into (see commitTyped).
    const next: Hsv = { h, s: 1, v: 1 };
    setHsv(next);
    onPreview(hsvToHex(next));
  };

  /**
   * Start a ring drag — only from the ring itself, not its empty middle
   * or the box's corners outside it.
   *
   * @param event - The pointerdown.
   */
  const startDrag = (event: ReactPointerEvent) => {
    if (!wheelRef.current) {
      return;
    }
    const box = wheelRef.current.getBoundingClientRect();
    const distance = Math.hypot(
      event.clientX - (box.left + box.width / 2),
      event.clientY - (box.top + box.height / 2),
    );
    if (distance < WHEEL_SIZE / 2 - RING_WIDTH - 4 || distance > WHEEL_SIZE / 2 + 2) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = true;
    onPreviewStart();
    dragTo(event);
  };

  const endDrag = () => {
    if (dragging.current) {
      onPreviewEnd(hsvToHex(hsv));
    }
    dragging.current = false;
  };

  const hueAngle = (hsv.h * Math.PI) / 180;
  const ringRadius = WHEEL_SIZE / 2 - RING_WIDTH / 2;

  return (
    <div className="color-picker">
      <div
        ref={wheelRef}
        className="color-picker__wheel"
        style={{
          width: WHEEL_SIZE,
          height: WHEEL_SIZE,
          ["--ring-width" as string]: `${RING_WIDTH}px`,
        }}
        onPointerDown={startDrag}
        onPointerMove={dragTo}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="color-picker__ring" aria-hidden="true" />
        <span
          className="color-picker__thumb"
          style={{
            left: WHEEL_SIZE / 2 + ringRadius * Math.sin(hueAngle),
            top: WHEEL_SIZE / 2 - ringRadius * Math.cos(hueAngle),
          }}
          aria-hidden="true"
        />
      </div>

      <div
        className="color-picker__swatches"
        role="group"
        aria-label="Recent and preset colors"
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
        {swatches.map((swatch) => (
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
        <label className="color-picker__field">
          <span>Hex</span>
          {/* The "#" is drawn beside the input rather than typed into it,
              so it can't be deleted — the input only ever holds the six
              hex digits. */}
          <span
            className={`color-picker__hex${hexInvalid ? " is-invalid" : ""}`}
          >
            <span className="color-picker__hex-prefix" aria-hidden="true">
              #
            </span>
            <input
              type="text"
              value={hexDraft}
              maxLength={6}
              spellCheck={false}
              aria-label="Custom color hex value"
              onChange={(event) =>
                // A pasted "#rrggbb" still works: drop the "#" it brings.
                setHexDraft(event.target.value.replace(/#/g, ""))
              }
              onPaste={(event) => {
                const text = event.clipboardData.getData("text").trim();
                if (isValidHexColor(text)) {
                  event.preventDefault();
                  setHexDraft(text.slice(1));
                }
              }}
              onBlur={commitHex}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                } else if (event.key === "Escape") {
                  setHexDraft(resolved.slice(1));
                  event.currentTarget.blur();
                }
              }}
            />
          </span>
        </label>
        {(
          [
            ["R", r, (next: number) => rgbToHex(next, g, b)],
            ["G", g, (next: number) => rgbToHex(r, next, b)],
            ["B", b, (next: number) => rgbToHex(r, g, next)],
          ] as const
        ).map(([label, channel, withChannel]) => (
          <label key={`${label}-${entryNonce}`} className="color-picker__field">
            <span>{label}</span>
            <NumericField
              className="color-picker__channel"
              min={0}
              max={255}
              value={channel}
              ariaLabel={`${label} channel`}
              onCommit={(next) => commitTyped(withChannel(next))}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
