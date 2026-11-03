/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. Licensed under the MIT License (see LICENSE).
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import {
  GATE_MAX_INPUTS,
  GATE_MIN_INPUTS,
  MAX_BUS_WIDTH,
  MAX_PORTS,
  MIN_BUS_WIDTH,
  canTieOff,
  countedPorts,
  isClockPort,
  isResetPort,
  portDirectionSummary,
  type GateRotation,
  type GateType,
  type IoRole,
  type PortDirection,
  type PortSide,
  type RtlBlock,
  type RtlPort,
  type RtlWire,
} from "../../../shared/diagram-model";
import { paletteFor, resolvePalette, withAlpha } from "../model/block-appearance";
import { GRID_SIZE } from "../model/grid";
import { minBlockSize } from "../model/port-layout";
import { hasWiresOn, isStructuredKind } from "../model/structured-ports";
import {
  swatchSlots,
  useColorHistoryStore,
} from "../state/color-history-store";
import { useDiagramStore } from "../state/diagram-store";
import { isLinkedModule, linkablePorts } from "../../../shared/module-interface";
import ColorPicker from "./ColorPicker";
import CommitInput from "./CommitInput";
import Dropdown from "./Dropdown";
import ModuleLinkSection from "./ModuleLinkSection";
import OutputPanel from "./OutputPanel";
import SimulationInspector from "./SimulationInspector";
import NameInput from "./NameInput";
import NumericField from "./NumericField";
import StepButtons from "./StepButtons";
import StructuredBlockSettings from "./StructuredBlockSettings";

const SIDES: PortSide[] = ["left", "right", "top", "bottom"];
const DIRECTIONS: PortDirection[] = ["in", "out", "inout"];
const GATE_TYPES: GateType[] = ["AND", "NAND", "OR", "NOR", "XOR", "XNOR"];
const GATE_ROTATIONS: GateRotation[] = ["right", "left", "up", "down"];
const IO_ROLES: readonly { value: IoRole | undefined; label: string }[] = [
  { value: undefined, label: "Standard" },
  { value: "clock", label: "Clock" },
  { value: "reset", label: "Reset" },
];

/** Largest width/height, in grid cells, the size fields accept. Also sets
 *  how wide those fields are drawn: just enough for this many digits. */
const MAX_BLOCK_CELLS = 99;
const MAX_BLOCK_CELLS_DIGITS = String(MAX_BLOCK_CELLS).length;

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
  const simulating = useDiagramStore((s) => s.mode === "simulate");
  const hasSelection =
    selection.blockIds.length > 0 || selection.wireIds.length > 0;
  // Always open while simulating: it carries the outputs then.
  const open = hasSelection || simulating;

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
      className={`inspector${open ? " inspector--open" : ""}`}
      aria-hidden={!open}
    >
      {/* Simulate mode: the schematic's outputs — or, once something is
          selected, a read-only section per selected component with the
          live value on each of its ports (no controls; nothing can be
          edited). */}
      {simulating ? (
        hasSelection ? (
          <>
            <h2 className="inspector__heading">Inspector</h2>
            <SimulationInspector />
          </>
        ) : (
          <>
            <h2 className="inspector__heading">Outputs</h2>
            <OutputPanel />
          </>
        )
      ) : (
        <h2 className="inspector__heading">Inspector</h2>
      )}
      {simulating ? null : block ? (
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
  // Reached with several components selected too (Ctrl+click or box
  // select) — those can still be deleted together from here.
  const hasSelectedBlocks = useDiagramStore(
    (s) => s.selection.blockIds.length > 0,
  );

  return (
    <div className="inspector__section">
      <p className="inspector__stat">
        {diagram.blocks.length} blocks · {diagram.wires.length} wires
      </p>
      <p className="inspector__muted">
        Select a block or wire to edit its properties.
      </p>
      {hasSelectedBlocks ? <DeleteSelectionButton /> : null}
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
  const previewBlockColor = useDiagramStore((s) => s.previewBlockColor);
  const previewResizeBlock = useDiagramStore((s) => s.previewResizeBlock);
  const beginInteraction = useDiagramStore((s) => s.beginInteraction);
  const addPort = useDiagramStore((s) => s.addPort);
  const updatePort = useDiagramStore((s) => s.updatePort);
  const removePort = useDiagramStore((s) => s.removePort);
  const toggleTieOff = useDiagramStore((s) => s.toggleTieOff);
  const wires = useDiagramStore((s) => s.diagram.wires);
  const setModuleSequential = useDiagramStore((s) => s.setModuleSequential);
  const setGateType = useDiagramStore((s) => s.setGateType);
  const setGateRotation = useDiagramStore((s) => s.setGateRotation);
  const setIoRole = useDiagramStore((s) => s.setIoRole);
  const recentColors = useColorHistoryStore((s) => s.recent);
  const recordColor = useColorHistoryStore((s) => s.use);

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
    ((block.kind === "module" || block.kind === "register") &&
      (isClockPort(port) || isResetPort(port))) ||
    (block.kind === "io" && !!block.ioRole);

  // The side selector would otherwise let you pick a side that just snaps
  // back on the next render, so it's replaced with plain text instead of
  // left interactively pointless. A gate's ports are the same way, just
  // driven by a different control (Rotation, below, rather than clk/reset's
  // fixed corners) — see normalizeFixedPorts, which is what actually pins
  // every gate port's side to match.
  const hasFixedPosition = (port: RtlPort): boolean =>
    isClockOrReset(port) || block.kind === "gate";

  // A register's d/q are its whole reason for existing — an edge-triggered
  // flip-flop always latches d, driving q — so unlike a generic port their
  // direction isn't a free choice either. Every one of a gate's ports is the
  // same way, just for a different reason: normalizeFixedPorts (model/
  // port-layout.ts) holds its one output to "out" and forces every other
  // port to "in" regardless, so a Drive dropdown here would only ever snap
  // back on the next render.
  // A codec's or mux's directions are likewise fixed — by its Type and
  // layout rather than per port (see structured-ports.ts).
  // A linked module's ports take their direction and width from the
  // linked schematic's I/O ports (only name and side are this schematic's
  // to set) — change them there, and every module linked to it follows.
  const linked = isLinkedModule(block);
  const linkedPortIds = new Set(
    linked ? linkablePorts(block).map((port) => port.id) : [],
  );
  const fromLinkedSchematic = (port: RtlPort): boolean =>
    linkedPortIds.has(port.id);

  const hasFixedDirection = (port: RtlPort): boolean =>
    isClockOrReset(port) ||
    (block.kind === "register" && (port.name === "d" || port.name === "q")) ||
    block.kind === "gate" ||
    isStructuredKind(block.kind) ||
    fromLinkedSchematic(port);

  // Kinds whose every port is a plain 1-bit wire, so the Ports table drops
  // its Width column rather than showing "1" on every row.
  const hidesWidth = block.kind === "gate" || block.kind === "codec";

  // An I/O pin or constant never offers a tie-off (see canTieOff), so its
  // table drops the column rather than leaving it empty on every row.
  const hidesTieOff = block.kind === "io" || block.kind === "constant";

  // clk/reset are always exactly 1 bit — a bus doesn't mean anything for a
  // clock edge or a reset level.
  const hasFixedWidth = (port: RtlPort): boolean =>
    isClockOrReset(port) || fromLinkedSchematic(port);

  // Read fresh on every render rather than cached, same as everything else
  // here — used both by canRemovePort below and by the "+ Port" cap further
  // down.
  const gateInputCount =
    block.kind === "gate"
      ? block.ports.filter((port) => port.direction === "in").length
      : 0;

  // A module's own arbitrary ports (added via the "+ Port" button below) are
  // the only ones a diagram author can ever remove — plus, for a gate, any
  // of its input ports (added the same way), never its one fixed output, and
  // never the last two: a gate below GATE_MIN_INPUTS isn't a boolean
  // function of anything any more. The × simply doesn't render at the floor
  // (rather than rendering disabled) — see the empty <span> fallback below,
  // which fills the same grid cell so nothing else in the row shifts.
  const canRemovePort = (port: RtlPort): boolean =>
    (block.kind === "module" && !linked && !hasFixedDirection(port)) ||
    (block.kind === "gate" &&
      port.direction === "in" &&
      gateInputCount > GATE_MIN_INPUTS);

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
  const widthCells = Math.round(block.width / GRID_SIZE);
  const heightCells = Math.round(block.height / GRID_SIZE);

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

  // MAX_PORTS is a hard ceiling (diagram-model.ts) — past it, a
  // hand-authored schematic stops being something a diagram author can
  // read at a glance. countedPorts excludes clk/reset: those are
  // structural, not part of a diagram author's own port budget, so a
  // sequential module doesn't hit the cap two ports sooner than a
  // combinational one for no reason. The store's own addPort already
  // refuses past this point too (so the P shortcut can't bypass the
  // disabled button here), but greying the button out and explaining why
  // is the actual UI for it.
  // A gate's own cap (GATE_MAX_INPUTS) is on its input count directly rather
  // than countedPorts, whose clk/reset exclusion is meaningless for a kind
  // that never has either — see the store's addPort, which guards the same
  // way.
  const atMaxPorts =
    block.kind === "gate"
      ? gateInputCount >= GATE_MAX_INPUTS
      : countedPorts(block.ports) >= MAX_PORTS;
  const portSummary = portDirectionSummary(block.ports);
  const canAddPort = (block.kind === "module" && !linked) || block.kind === "gate";

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

      <div className="field field--row field--steppers">
        <label className="field">
          <span>Width</span>
          <span
            className="stepper"
            style={{ ["--stepper-digits" as string]: MAX_BLOCK_CELLS_DIGITS }}
          >
            <input
              type="number"
              inputMode="numeric"
              min={minWidthCells}
              max={MAX_BLOCK_CELLS}
              value={widthCells}
              aria-label="Block width in grid cells"
              onFocus={beginInteraction}
              onChange={(event) => {
                const cells = Math.min(Number(event.target.value), MAX_BLOCK_CELLS);
                if (Number.isFinite(cells)) {
                  previewResizeBlock(block.id, cells * GRID_SIZE, block.height);
                }
              }}
            />
            <StepButtons
              label="width"
              canIncrement={widthCells < MAX_BLOCK_CELLS}
              canDecrement={widthCells > minWidthCells}
              onStep={(delta) => {
                beginInteraction();
                previewResizeBlock(
                  block.id,
                  (widthCells + delta) * GRID_SIZE,
                  block.height,
                );
              }}
            />
          </span>
        </label>
        <label className="field">
          <span>Height</span>
          <span
            className="stepper"
            style={{ ["--stepper-digits" as string]: MAX_BLOCK_CELLS_DIGITS }}
          >
            <input
              type="number"
              inputMode="numeric"
              min={minHeightCells}
              max={MAX_BLOCK_CELLS}
              value={heightCells}
              aria-label="Block height in grid cells"
              onFocus={beginInteraction}
              onChange={(event) => {
                const cells = Math.min(Number(event.target.value), MAX_BLOCK_CELLS);
                if (Number.isFinite(cells)) {
                  previewResizeBlock(block.id, block.width, cells * GRID_SIZE);
                }
              }}
            />
            <StepButtons
              label="height"
              canIncrement={heightCells < MAX_BLOCK_CELLS}
              canDecrement={heightCells > minHeightCells}
              onStep={(delta) => {
                beginInteraction();
                previewResizeBlock(
                  block.id,
                  block.width,
                  (heightCells + delta) * GRID_SIZE,
                );
              }}
            />
          </span>
        </label>
      </div>

      {block.kind === "io" ? (
        <div className="field">
          <span>Type</span>
          <div className="mode-toggle" role="group" aria-label="I/O type">
            {IO_ROLES.map(({ value, label }) => (
              <button
                key={label}
                type="button"
                className={`mode-toggle__option${
                  block.ioRole === value ? " is-active" : ""
                }`}
                aria-pressed={block.ioRole === value}
                title={
                  value
                    ? `A ${value} pin: always a 1-bit input`
                    : "An ordinary signal"
                }
                onClick={() => setIoRole(block.id, value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

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

      {block.kind === "gate" ? (
        <div className="field">
          <span>Gate Type</span>
          <div
            className="gate-type-toggle"
            role="group"
            aria-label="Gate type"
          >
            {GATE_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className={`gate-type-toggle__option${
                  block.gateType === type ? " is-active" : ""
                }`}
                aria-pressed={block.gateType === type}
                onClick={() => setGateType(block.id, type)}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {block.kind === "gate" ? (
        <div className="field">
          <span>Rotation</span>
          {/* Reuses .mode-toggle's own CSS — a plain flex row of equal-width
              segments, nothing about it actually specific to "mode" — rather
              than duplicating the same rules under a new class name for a
              four-way instead of two-way control. */}
          <div className="mode-toggle" role="group" aria-label="Gate rotation">
            {GATE_ROTATIONS.map((rotation) => (
              <button
                key={rotation}
                type="button"
                className={`mode-toggle__option${
                  (block.gateRotation ?? "right") === rotation ? " is-active" : ""
                }`}
                aria-pressed={(block.gateRotation ?? "right") === rotation}
                onClick={() => setGateRotation(block.id, rotation)}
              >
                {rotation.charAt(0).toUpperCase() + rotation.slice(1)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {isStructuredKind(block.kind) ? (
        <StructuredBlockSettings block={block} />
      ) : null}

      <h3 className="inspector__subheading">Ports</h3>
      <div
        className={`port-table${hidesWidth ? " port-table--no-width" : ""}${
          hidesTieOff ? " port-table--no-tie" : ""
        }`}
      >
        <div className="port-list__header" aria-hidden="true">
          <span>Name</span>
          <span>Side</span>
          <span>Drive</span>
          {hidesWidth ? null : <span>Width</span>}
          {/* The tie-off buttons sit unlabeled beside the × buttons. */}
          {hidesTieOff ? null : <span />}
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
                  title={
                    block.kind === "gate"
                      ? "Set by the gate's Rotation, above"
                      : "Fixed position for the clock/reset"
                  }
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
                      : fromLinkedSchematic(port)
                        ? "Set by the linked schematic's I/O port"
                        : block.kind === "gate"
                        ? "A gate's output is always \"out\", every other port always \"in\""
                        : block.kind === "codec"
                          ? "Set by the codec's Type, above"
                          : block.kind === "mux"
                            ? "A mux's data and select lines are inputs; its output is \"out\""
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
              {hidesWidth ? null : block.kind === "mux" ? (
                <span
                  className="port-row__fixed-value"
                  title={
                    port.role === "select"
                      ? "A select line is always 1 bit"
                      : "Set by the mux's Data Size, above"
                  }
                >
                  {port.width ?? 1}
                </span>
              ) : hasFixedWidth(port) ? (
                <span
                  className="port-row__fixed-value"
                  title={
                    fromLinkedSchematic(port)
                      ? "Set by the linked schematic's I/O port"
                      : "A clock/reset is always 1 bit"
                  }
                >
                  {port.width ?? 1}
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
              {hidesTieOff ? null : canTieOff(block.kind, port) ? (
                <TieOffButton
                  tiedOff={!!port.tiedOff}
                  wired={hasWiresOn(wires, block.id, [port.id])}
                  onToggle={() => toggleTieOff(block.id, port.id)}
                />
              ) : (
                <span aria-hidden="true" />
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

      {canAddPort ? (
        <div className="field">
          <div className="field--row">
            <button
              type="button"
              className="port-table__add"
              disabled={atMaxPorts}
              title={
                atMaxPorts ? "Maximum ports reached" : "Add a new port (P)"
              }
              aria-label={
                atMaxPorts ? "Maximum ports reached" : "Add a new port"
              }
              onClick={() => addPort(block.id, "left", "in")}
            >
              + Port
            </button>
          </div>
          {portSummary ? (
            <p className="port-table__summary">{portSummary}</p>
          ) : null}
        </div>
      ) : null}

      {block.kind === "module" ? <ModuleLinkSection block={block} /> : null}

      <h3 className="inspector__subheading">Color</h3>
      <ColorPicker
        value={block.color}
        defaultColor={paletteFor(block.kind, theme).stroke}
        swatches={swatchSlots(recentColors)}
        onChange={(color) => {
          updateBlockColor(block.id, color);
          if (color) {
            recordColor(color);
          }
        }}
        onPreviewStart={beginInteraction}
        onPreview={(color) => previewBlockColor(block.id, color)}
        onPreviewEnd={recordColor}
      />

      <DeleteSelectionButton />
    </div>
  );
}

/**
 * One port row's tie-off toggle. Its icon is a port stub ending in an open
 * circle while the port is in use, and an X where the circle was once it's
 * tied off — the same X drawn through the port on the canvas. Disabled
 * while the port has a wire, since a wired port is plainly in use.
 *
 * @param props.tiedOff - Whether the port is tied off now.
 * @param props.wired - Whether any wire touches the port.
 * @param props.onToggle - Flip the tie-off.
 * @returns The button.
 */
function TieOffButton({
  tiedOff,
  wired,
  onToggle,
}: {
  tiedOff: boolean;
  wired: boolean;
  onToggle: () => void;
}) {
  const title = tiedOff
    ? "Tied off — click to use this port again"
    : wired
      ? "Disconnect its wires to tie it off"
      : "Tie off (mark this port as unused)";
  return (
    <button
      type="button"
      className={`port-row__tie${tiedOff ? " is-tied" : ""}`}
      aria-pressed={tiedOff}
      aria-label={tiedOff ? "Untie port" : "Tie off port"}
      title={title}
      disabled={wired && !tiedOff}
      onClick={onToggle}
    >
      <svg
        viewBox="0 0 14 14"
        width="12"
        height="12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        aria-hidden="true"
      >
        {tiedOff ? (
          <>
            <path d="M1 7h4.5" />
            <path d="M6.5 3.5l6 7M12.5 3.5l-6 7" />
          </>
        ) : (
          <>
            <path d="M1 7h5.5" />
            <circle cx="9.5" cy="7" r="3" />
          </>
        )}
      </svg>
    </button>
  );
}

/**
 * Red Delete button at the foot of the inspector. Opens the type-DELETE
 * confirmation popup (DeleteConfirmDialog.tsx) for whatever is selected,
 * rather than deleting outright.
 *
 * @returns The button.
 */
function DeleteSelectionButton() {
  const requestDeleteSelection = useDiagramStore(
    (s) => s.requestDeleteSelection,
  );
  return (
    <button
      type="button"
      className="inspector__delete"
      title="Delete (Del)"
      onClick={requestDeleteSelection}
    >
      Delete
    </button>
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
