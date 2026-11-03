/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import {
  MAX_BUS_WIDTH,
  MAX_STRUCTURED_BITS,
  MIN_BUS_WIDTH,
  MIN_STRUCTURED_BITS,
  type CodecType,
  type RtlBlock,
} from "../../../shared/diagram-model";
import { hasWiresOn, portsDroppedBy } from "../model/structured-ports";
import { useDiagramStore } from "../state/diagram-store";
import NumericField from "./NumericField";
import StepButtons from "./StepButtons";

const CODEC_TYPES: readonly { value: CodecType; label: string }[] = [
  { value: "encoder", label: "Encoder" },
  { value: "decoder", label: "Decoder" },
];

/**
 * Digits the Size and Data Size inputs are drawn wide enough for — both the
 * same, so the two read as a matched pair. A wider data size (up to 1024)
 * still fits; it just fills the box.
 */
const STEPPER_DIGITS = 2;

/**
 * One-line reading of what a codec's or mux's settings make it, shown under
 * its Size field — e.g. "3-to-8 decoder", "8:1 mux, 32-bit data".
 *
 * @param block - A codec or mux.
 * @returns The summary text.
 */
function shapeSummary(block: RtlBlock): string {
  const bits = block.bits ?? MIN_STRUCTURED_BITS;
  const wide = 2 ** bits;
  if (block.kind === "codec") {
    return block.codecType === "encoder"
      ? `${wide}-to-${bits} encoder`
      : `${bits}-to-${wide} decoder`;
  }
  const width = block.dataWidth ?? 1;
  return `${wide}:1 mux, ${width}-bit data`;
}

/**
 * The inspector controls for a codec or multiplexer — the settings its
 * ports are derived from (see structured-ports.ts): a codec's Type, both
 * kinds' Size, and a mux's Data Size. Each one locks itself, with a note
 * saying why, whenever changing it would break a wire: a type swap flips
 * every port's direction, a smaller size removes ports, and a new data
 * size would leave wired data ports mismatched in width.
 *
 * @param props.block - The selected codec or mux.
 * @returns The settings fields.
 */
export default function StructuredBlockSettings({ block }: { block: RtlBlock }) {
  const wires = useDiagramStore((s) => s.diagram.wires);
  const setCodecType = useDiagramStore((s) => s.setCodecType);
  const setStructuredBits = useDiagramStore((s) => s.setStructuredBits);
  const setMuxDataWidth = useDiagramStore((s) => s.setMuxDataWidth);

  const bits = block.bits ?? MIN_STRUCTURED_BITS;
  const typeLocked = block.kind === "codec" && hasWiresOn(wires, block.id);
  const shrinkLocked =
    bits > MIN_STRUCTURED_BITS &&
    hasWiresOn(wires, block.id, portsDroppedBy(block, { bits: bits - 1 }));
  const dataPortIds = block.ports
    .filter((port) => port.role !== "select")
    .map((port) => port.id);
  const dataWidthLocked =
    block.kind === "mux" && hasWiresOn(wires, block.id, dataPortIds);

  const sizeField = (
    <div className="field">
      <span>Size</span>
      <span
        className="stepper"
        style={{ ["--stepper-digits" as string]: STEPPER_DIGITS }}
      >
        <input
          type="number"
          inputMode="numeric"
          min={MIN_STRUCTURED_BITS}
          max={MAX_STRUCTURED_BITS}
          value={bits}
          aria-label={
            block.kind === "mux" ? "Number of select lines" : "Codec size"
          }
          onChange={(event) => {
            const next = Number(event.target.value);
            // A smaller size the store would refuse anyway (a wired port in
            // the way) simply doesn't take; the field re-renders back.
            if (!(shrinkLocked && next < bits)) {
              setStructuredBits(block.id, next);
            }
          }}
        />
        <StepButtons
          label="size"
          canIncrement={bits < MAX_STRUCTURED_BITS}
          canDecrement={bits > MIN_STRUCTURED_BITS && !shrinkLocked}
          decrementTitle={
            shrinkLocked ? "A port this would remove has a wire" : undefined
          }
          onStep={(delta) => setStructuredBits(block.id, bits + delta)}
        />
      </span>
    </div>
  );

  const sizeNotes = (
    <>
      <p className="port-table__summary">{shapeSummary(block)}</p>
      {shrinkLocked ? (
        <p className="field__note">
          Disconnect the wires on its last ports to make it smaller.
        </p>
      ) : null}
    </>
  );

  const dataSizeField = (
    <div className="field">
      <span>Data Size</span>
      <span
        className="stepper"
        style={{ ["--stepper-digits" as string]: STEPPER_DIGITS }}
      >
        {dataWidthLocked ? (
          <span
            className="stepper__fixed"
            title="Disconnect its data wires to change this"
          >
            {block.dataWidth ?? 1}
          </span>
        ) : (
          <NumericField
            min={MIN_BUS_WIDTH}
            max={MAX_BUS_WIDTH}
            value={block.dataWidth ?? 1}
            ariaLabel="Data bus width in bits"
            onCommit={(next) => setMuxDataWidth(block.id, next)}
          />
        )}
        <StepButtons
          label="data size"
          canIncrement={
            !dataWidthLocked && (block.dataWidth ?? 1) < MAX_BUS_WIDTH
          }
          canDecrement={
            !dataWidthLocked && (block.dataWidth ?? 1) > MIN_BUS_WIDTH
          }
          onStep={(delta) =>
            setMuxDataWidth(block.id, (block.dataWidth ?? 1) + delta)
          }
        />
      </span>
    </div>
  );

  return (
    <>
      {block.kind === "codec" ? (
        <div className="field">
          <span>Type</span>
          <div
            className={`mode-toggle${typeLocked ? " is-locked" : ""}`}
            role="group"
            aria-label="Encoder or decoder"
          >
            {CODEC_TYPES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={`mode-toggle__option${
                  block.codecType === value ? " is-active" : ""
                }`}
                aria-pressed={block.codecType === value}
                disabled={typeLocked}
                onClick={() => setCodecType(block.id, value)}
              >
                {label}
              </button>
            ))}
          </div>
          {typeLocked ? (
            <p className="field__note">
              Disconnect its wires to change the type.
            </p>
          ) : null}
        </div>
      ) : null}

      {block.kind === "codec" ? (
        // A codec's Size stands alone, centered under its Type toggle.
        <div className="field field--centered">
          {sizeField}
          {sizeNotes}
        </div>
      ) : (
        // A mux's Size and Data Size share one row, lined up under Width
        // and Height the same way those two spread across the panel.
        <div className="field">
          <div className="field field--row field--steppers">
            {sizeField}
            {dataSizeField}
          </div>
          {sizeNotes}
          {dataWidthLocked ? (
            <p className="field__note">
              Disconnect the data wires to change their width.
            </p>
          ) : null}
        </div>
      )}
    </>
  );
}
