/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-02
 * --------------------------------------------------------------------------- */

import {
  MAX_BUS_WIDTH,
  MIN_BUS_WIDTH,
  isClockPort,
  isResetPort,
  type PortDirection,
  type PortSide,
  type RtlBlock,
  type RtlPort,
  type RtlWire,
} from "../../../shared/diagram-model";
import { paletteFor, resolvePalette, withAlpha } from "../model/block-appearance";
import { GRID_SIZE } from "../model/grid";
import { minBlockSize } from "../model/port-layout";
import { useDiagramStore } from "../state/diagram-store";
import ColorPicker from "./ColorPicker";
import CommitInput from "./CommitInput";
import Dropdown from "./Dropdown";
import NameInput from "./NameInput";
import NumericField from "./NumericField";

const SIDES: PortSide[] = ["left", "right", "top", "bottom"];
const DIRECTIONS: PortDirection[] = ["in", "out"];

/**
 * Right sidebar. Shows properties for the current single selection (block or
 * wire), or a summary when several are selected at once. Slides fully out of
 * view — and lets the canvas fill the reclaimed space — whenever the
 * selection is empty; see the `app__body--inspector-open` toggle in App.tsx
 * that drives the enclosing grid track in step with this panel's own
 * `inspector--open` class (`app.css`, "INSPECTOR").
 *
 * @returns The inspector element.
 */
export default function InspectorPanel() {
  const diagram = useDiagramStore((s) => s.diagram);
  const selection = useDiagramStore((s) => s.selection);
  const hasSelection =
    selection.blockIds.length > 0 || selection.wireIds.length > 0;

  const block =
    selection.blockIds.length === 1 && selection.wireIds.length === 0
      ? diagram.blocks.find((b) => b.id === selection.blockIds[0])
      : undefined;
  const wire =
    selection.wireIds.length === 1 && selection.blockIds.length === 0
      ? diagram.wires.find((w) => w.id === selection.wireIds[0])
      : undefined;

  return (
    <aside
      className={`inspector${hasSelection ? " inspector--open" : ""}`}
      aria-hidden={!hasSelection}
    >
      <h2 className="inspector__heading">Inspector</h2>
      {block ? (
        <BlockInspector block={block} />
      ) : wire ? (
        <WireInspector wire={wire} />
      ) : (
        <DocumentInspector />
      )}
    </aside>
  );
}

/**
 * Document-level fields shown when there is no single selection.
 *
 * @returns The document inspector section.
 */
function DocumentInspector() {
  const diagram = useDiagramStore((s) => s.diagram);

  return (
    <div className="inspector__section">
      <p className="inspector__stat">
        {diagram.blocks.length} blocks · {diagram.wires.length} wires
      </p>
      <p className="inspector__muted">
        Select a block or wire to edit its properties.
      </p>
    </div>
  );
}

/**
 * Editable properties for a single block, including its port table.
 *
 * @param props.block - The selected block.
 * @returns The block inspector section.
 */
function BlockInspector({ block }: { block: RtlBlock }) {
  const blocks = useDiagramStore((s) => s.diagram.blocks);
  const theme = useDiagramStore((s) => s.theme);
  const updateBlockLabel = useDiagramStore((s) => s.updateBlockLabel);
  const updateBlockColor = useDiagramStore((s) => s.updateBlockColor);
  const previewResizeBlock = useDiagramStore((s) => s.previewResizeBlock);
  const beginInteraction = useDiagramStore((s) => s.beginInteraction);
  const addPort = useDiagramStore((s) => s.addPort);
  const updatePort = useDiagramStore((s) => s.updatePort);
  const removePort = useDiagramStore((s) => s.removePort);
  const setModuleSequential = useDiagramStore((s) => s.setModuleSequential);

  const otherBlockNames = blocks
    .filter((b) => b.id !== block.id)
    .map((b) => b.label);
  const sequential = block.ports.some(isClockPort);

  // A clk or reset, on any kind that has one, is structural rather than a
  // free-form signal: it's always a plain 1-bit input pinned to a fixed edge
  // (see normalizeFixedPorts, which enforces the same for direction/width),
  // never something a diagram author is choosing the shape of. Side,
  // direction, and width all key off this (see canRemovePort, below, for
  // the separate — broader — rule on the remove button).
  const isClockOrReset = (port: RtlPort): boolean =>
    (block.kind === "module" || block.kind === "register") &&
    (isClockPort(port) || isResetPort(port));

  // The side selector would otherwise let you pick a side that just snaps
  // back on the next render, so it's replaced with plain text instead of
  // left interactively pointless.
  const hasFixedPosition = isClockOrReset;

  // A register's d/q are its whole reason for existing — an edge-triggered
  // flip-flop always latches d, driving q — so unlike a generic port their
  // direction isn't a free choice either.
  const hasFixedDirection = (port: RtlPort): boolean =>
    isClockOrReset(port) ||
    (block.kind === "register" && (port.name === "d" || port.name === "q"));

  // clk/reset are always exactly 1 bit — a bus doesn't mean anything for a
  // clock edge or a reset level.
  const hasFixedWidth = isClockOrReset;

  // A module's own arbitrary ports (added via the "+ Port" button below) are
  // the only ones a diagram author can ever remove. Everything else —
  // clk/reset, a register's d/q, and an I/O port's or constant's single
  // defining port — is structural: the block would be meaningless without
  // it, and (unlike a module) neither io nor constant offers any way to add
  // a replacement.
  const canRemovePort = (port: RtlPort): boolean =>
    block.kind === "module" && !hasFixedDirection(port);

  // An I/O port or constant has exactly one signal flowing in one direction
  // (out, in this app) — top/bottom read as a bus entering or leaving a
  // module's face, a convention that only means something for a block with
  // more than one port to arrange. Restricted here, at the option list
  // itself, rather than merely accepted-then-normalized, so the choice never
  // appears in the first place.
  const availableSides: readonly PortSide[] =
    block.kind === "io" || block.kind === "constant"
      ? (["left", "right"] as const)
      : SIDES;

  // The floor a resize can't go below given the block's current ports and
  // header — depends on the block itself, so it's recomputed on every
  // render rather than read off a fixed prop.
  const min = minBlockSize(block);
  const minWidthCells = Math.round(min.width / GRID_SIZE);
  const minHeightCells = Math.round(min.height / GRID_SIZE);

  // This block's actual current color (custom, or its kind's default) — set
  // as --block-stroke (and a translucent --block-stroke-glow, for a Dropdown
  // panel's lighter hover/active rows) on the section below, so every
  // focused/active control inside it (the mode toggle, a focused port-table
  // input, an open Side dropdown) matches the block on canvas instead of a
  // fixed blue unrelated to it. Unlike RtlBlockNode's own --block-stroke,
  // this doesn't inherit down from anywhere: the inspector panel sits
  // outside the canvas's DOM tree entirely, so both have to be set again
  // here from the same source of truth, once, for the whole section to read.
  const strokeColor = resolvePalette(block, theme).stroke;

  return (
    <div
      className="inspector__section"
      style={
        {
          "--block-stroke": strokeColor,
          "--block-stroke-glow": withAlpha(strokeColor, 0.35),
        } as React.CSSProperties
      }
    >
      <label className="field">
        <span>Name</span>
        <NameInput
          value={block.label}
          allowSpaces
          takenNames={otherBlockNames}
          maxLength={40}
          ariaLabel="Block name"
          onCommit={(next) => updateBlockLabel(block.id, next)}
        />
      </label>

      <div className="field field--row">
        <label className="field">
          <span>Width</span>
          <input
            type="number"
            inputMode="numeric"
            min={minWidthCells}
            value={Math.round(block.width / GRID_SIZE)}
            aria-label="Block width in grid cells"
            onFocus={beginInteraction}
            onChange={(event) => {
              const cells = Number(event.target.value);
              if (Number.isFinite(cells)) {
                previewResizeBlock(block.id, cells * GRID_SIZE, block.height);
              }
            }}
          />
        </label>
        <label className="field">
          <span>Height</span>
          <input
            type="number"
            inputMode="numeric"
            min={minHeightCells}
            value={Math.round(block.height / GRID_SIZE)}
            aria-label="Block height in grid cells"
            onFocus={beginInteraction}
            onChange={(event) => {
              const cells = Number(event.target.value);
              if (Number.isFinite(cells)) {
                previewResizeBlock(block.id, block.width, cells * GRID_SIZE);
              }
            }}
          />
        </label>
      </div>

      {block.kind === "module" ? (
        <div className="field">
          <span>Mode</span>
          <div
            className="mode-toggle"
            role="group"
            aria-label="Combinational or sequential"
          >
            <button
              type="button"
              className={`mode-toggle__option${sequential ? "" : " is-active"}`}
              aria-pressed={!sequential}
              onClick={() => setModuleSequential(block.id, false)}
            >
              Combinational
            </button>
            <button
              type="button"
              className={`mode-toggle__option${sequential ? " is-active" : ""}`}
              aria-pressed={sequential}
              onClick={() => setModuleSequential(block.id, true)}
            >
              Sequential
            </button>
          </div>
        </div>
      ) : null}

      <h3 className="inspector__subheading">Ports</h3>
      <div className="port-table">
        <div className="port-list__header" aria-hidden="true">
          <span>Name</span>
          <span>Side</span>
          <span>Drive</span>
          <span>Width</span>
          <span />
        </div>
        <ul className="port-list">
          {block.ports.map((port) => (
            <li key={port.id} className="port-row">
              <NameInput
                className="port-row__name"
                value={port.name}
                allowSpaces
                maxLength={20}
                showCounter={false}
                takenNames={block.ports
                  .filter((p) => p.id !== port.id)
                  .map((p) => p.name)}
                ariaLabel="Port name"
                onCommit={(next) =>
                  updatePort(block.id, port.id, { name: next })
                }
              />
              {hasFixedPosition(port) ? (
                <span
                  className="port-row__fixed-value"
                  title="Fixed position for the clock/reset"
                >
                  {port.side}
                </span>
              ) : (
                <Dropdown<PortSide>
                  value={port.side}
                  options={availableSides}
                  ariaLabel="Port side"
                  onChange={(side) =>
                    updatePort(block.id, port.id, { side })
                  }
                />
              )}
              {hasFixedDirection(port) ? (
                <span
                  className="port-row__fixed-value"
                  title={
                    isClockOrReset(port)
                      ? "A clock/reset is always an input"
                      : "A register's d is always an input, q always an output"
                  }
                >
                  {port.direction}
                </span>
              ) : (
                <Dropdown<PortDirection>
                  value={port.direction}
                  options={DIRECTIONS}
                  ariaLabel="Port direction"
                  onChange={(direction) =>
                    updatePort(block.id, port.id, { direction })
                  }
                />
              )}
              {hasFixedWidth(port) ? (
                <span
                  className="port-row__fixed-value"
                  title="A clock/reset is always 1 bit"
                >
                  1
                </span>
              ) : (
                <NumericField
                  className="port-row__width"
                  min={MIN_BUS_WIDTH}
                  max={MAX_BUS_WIDTH}
                  value={port.width ?? 1}
                  ariaLabel="Port bus width"
                  onCommit={(next) =>
                    updatePort(block.id, port.id, {
                      width: next <= 1 ? undefined : next,
                    })
                  }
                />
              )}
              {canRemovePort(port) ? (
                <button
                  type="button"
                  className="port-row__remove"
                  title="Remove port"
                  onClick={() => removePort(block.id, port.id)}
                >
                  ×
                </button>
              ) : (
                <span aria-hidden="true" />
              )}
            </li>
          ))}
        </ul>
      </div>

      {block.kind === "module" ? (
        <div className="field field--row">
          <button type="button" onClick={() => addPort(block.id, "left", "in")}>
            + Port
          </button>
        </div>
      ) : null}

      <h3 className="inspector__subheading">Color</h3>
      <ColorPicker
        value={block.color}
        defaultColor={paletteFor(block.kind, theme).stroke}
        onChange={(color) => updateBlockColor(block.id, color)}
      />
    </div>
  );
}

/**
 * Editable properties for a single wire.
 *
 * @param props.wire - The selected wire.
 * @returns The wire inspector section.
 */
function WireInspector({ wire }: { wire: RtlWire }) {
  const diagram = useDiagramStore((s) => s.diagram);
  const updateWire = useDiagramStore((s) => s.updateWire);

  const endpoint = (blockId: string, portId: string) => {
    const b = diagram.blocks.find((x) => x.id === blockId);
    const p = b?.ports.find((x) => x.id === portId);
    return b && p ? `${b.label}.${p.name}` : "—";
  };

  return (
    <div className="inspector__section">
      <p className="inspector__muted">
        {endpoint(wire.sourceBlockId, wire.sourcePortId)} →{" "}
        {endpoint(wire.targetBlockId, wire.targetPortId)}
      </p>
      <label className="field">
        <span>Label</span>
        <CommitInput
          value={wire.label ?? ""}
          placeholder="e.g. [31:0]"
          onCommit={(next) => updateWire(wire.id, { label: next || undefined })}
        />
      </label>
    </div>
  );
}
