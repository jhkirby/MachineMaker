/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
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
import {
  COLOR_SWATCHES,
  hexToRgb,
  isValidHexColor,
} from "../model/block-appearance";
import { hexToHsv, hsvToHex, rgbToHex, type Hsv } from "../model/color-math";
import NumericField from "./NumericField";

/** Outer diameter of the hue ring, in CSS pixels. */
const WHEEL_SIZE = 168;
/** Thickness of the hue ring. */
const RING_WIDTH = 16;
/** Side of the saturation/value square: the largest square that fits inside
 *  the ring's hole with a little breathing room (side = diameter / √2). */
const SQUARE_SIZE = Math.floor(((WHEEL_SIZE - 2 * RING_WIDTH - 12) / Math.SQRT2));

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
  /** Called once when a wheel/square drag starts, before any
   *  {@link onPreview}, so the whole drag can collapse into one undo step. */
  onPreviewStart: () => void;
  /** Called with every color a wheel/square drag passes through. */
  onPreview: (color: string) => void;
}

/**
 * Clamp a number into [0, 1].
 *
 * @param value - The number to clamp.
 * @returns `value`, limited to 0-1.
 */
function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * A block's Color section: a hue wheel around a saturation/value square,
 * a row of preset swatches, and hex + R/G/B fields for exact values. Every
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
}: ColorPickerProps) {
  const resolved = value ?? defaultColor;
  // Hue/saturation are held here rather than always derived from `resolved`:
  // a grey has no hue and black has no saturation either, so deriving them
  // would snap the ring/square thumbs back to red/left the moment a drag
  // passes through one.
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(resolved));
  const [hexDraft, setHexDraft] = useState(resolved.slice(1));
  const wheelRef = useRef<HTMLDivElement>(null);
  const squareRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"wheel" | "square" | null>(null);

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

  /** Commit a valid hex draft, or snap back to the last real color. */
  const commitHex = () => {
    if (!hexInvalid) {
      onChange(`#${hexDraft.toLowerCase()}`);
    } else {
      setHexDraft(resolved.slice(1));
    }
  };

  /**
   * Turn a pointer position into a new color for whichever control is being
   * dragged, and preview it.
   *
   * @param event - The pointer event carrying the position.
   */
  const dragTo = (event: ReactPointerEvent) => {
    let next: Hsv | null = null;
    if (dragging.current === "wheel" && wheelRef.current) {
      const box = wheelRef.current.getBoundingClientRect();
      const dx = event.clientX - (box.left + box.width / 2);
      const dy = event.clientY - (box.top + box.height / 2);
      // 0° at the top, increasing clockwise — the direction the ring's
      // conic-gradient is painted in (app.css, COLOR PICKER).
      const h = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
      next = { ...hsv, h };
    } else if (dragging.current === "square" && squareRef.current) {
      const box = squareRef.current.getBoundingClientRect();
      next = {
        ...hsv,
        s: clamp01((event.clientX - box.left) / box.width),
        v: 1 - clamp01((event.clientY - box.top) / box.height),
      };
    }
    if (next) {
      setHsv(next);
      onPreview(hsvToHex(next));
    }
  };

  /**
   * Start dragging one of the two controls.
   *
   * @param target - Which control was pressed.
   * @returns The pointerdown handler for that control.
   */
  const startDrag = (target: "wheel" | "square") => (event: ReactPointerEvent) => {
    // The square sits inside the wheel's box; without this a press on the
    // square would also start a hue drag on the wheel underneath it.
    event.stopPropagation();
    if (target === "wheel" && wheelRef.current) {
      // Only the ring itself picks a hue — not the empty gap between the
      // ring and the square, or the box's corners outside the ring.
      const box = wheelRef.current.getBoundingClientRect();
      const distance = Math.hypot(
        event.clientX - (box.left + box.width / 2),
        event.clientY - (box.top + box.height / 2),
      );
      if (distance < WHEEL_SIZE / 2 - RING_WIDTH - 4 || distance > WHEEL_SIZE / 2 + 2) {
        return;
      }
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = target;
    onPreviewStart();
    dragTo(event);
  };

  const endDrag = () => {
    dragging.current = null;
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
        onPointerDown={startDrag("wheel")}
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
        <div
          ref={squareRef}
          className="color-picker__square"
          role="slider"
          aria-label="Saturation and brightness"
          aria-valuetext={resolved}
          style={{
            width: SQUARE_SIZE,
            height: SQUARE_SIZE,
            ["--hue-color" as string]: hsvToHex({ h: hsv.h, s: 1, v: 1 }),
          }}
          onPointerDown={startDrag("square")}
          onPointerMove={dragTo}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span
            className="color-picker__thumb"
            style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
            aria-hidden="true"
          />
        </div>
      </div>

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
        <span
          className="color-picker__preview"
          style={{ background: resolved }}
          aria-hidden="true"
        />
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
          <label key={label} className="color-picker__field">
            <span>{label}</span>
            <NumericField
              className="color-picker__channel"
              min={0}
              max={255}
              value={channel}
              ariaLabel={`${label} channel`}
              onCommit={(next) => onChange(withChannel(next))}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
