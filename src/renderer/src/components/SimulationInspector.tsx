/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import {
  formatBusWidth,
  type RtlBlock,
  type RtlWire,
} from "../../../shared/diagram-model";
import { isLinkedModule } from "../../../shared/module-interface";
import { blockKindLabel, resolvePalette } from "../model/block-appearance";
import { describeSignalValue, formatSignalValue } from "../model/signal-values";
import { useDiagramStore } from "../state/diagram-store";
import { useSimulationStore } from "../state/simulation-store";

/**
 * One label/value line of a section.
 *
 * @param props.label - What the value is.
 * @param props.children - The value.
 * @returns The line.
 */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="sim-inspector__fact">
      <span className="sim-inspector__label">{label}</span>
      <span className="sim-inspector__value">{children}</span>
    </div>
  );
}

/**
 * A simulated value in its readout style — muted when unknown, with the hex
 * and binary forms on hover.
 *
 * @param props.value - The value.
 * @param props.width - Its bus width.
 * @returns The readout.
 */
function Readout({ value, width }: { value: bigint | undefined; width: number }) {
  return (
    <output
      className={`signal-row__readout${value === undefined ? " is-unknown" : ""}`}
      title={describeSignalValue(value, width)}
    >
      {formatSignalValue(value)}
    </output>
  );
}

/**
 * One selected component's section: a header with its name (large, in the
 * component's own color) and its kind beside it, its link if it has one,
 * then every port with its direction, width and live simulated value.
 *
 * @param props.block - The component.
 * @returns The section.
 */
function BlockSection({ block }: { block: RtlBlock }) {
  const ports = useSimulationStore((s) => s.ports);
  const theme = useDiagramStore((s) => s.theme);
  return (
    <section className="sim-inspector__section" aria-label={block.label}>
      <header className="sim-inspector__header">
        <span
          className="sim-inspector__name"
          style={{ color: resolvePalette(block, theme).stroke }}
        >
          {block.label}
        </span>
        <span className="sim-inspector__kind">{blockKindLabel(block)}</span>
      </header>
      {isLinkedModule(block) ? (
        <Fact label="Linked to">{block.linkedModule?.name || block.linkedModule?.path}</Fact>
      ) : null}
      <ul className="sim-inspector__ports" aria-label={`${block.label} ports`}>
        {block.ports.map((port) => {
          const range = formatBusWidth(port.width);
          return (
            <li key={port.id} className="sim-inspector__port">
              <span className="sim-inspector__port-name">
                {port.name}
                <span className="sim-inspector__port-meta">
                  {" "}
                  {port.direction}
                  {range ? ` ${range}` : ""}
                </span>
              </span>
              {port.tiedOff ? (
                <span className="sim-inspector__port-meta">tied off</span>
              ) : (
                <Readout
                  value={ports.get(`${block.id}/${port.id}`)}
                  width={port.width ?? 1}
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * One selected wire's section: its endpoints and the value it carries.
 *
 * @param props.wire - The wire.
 * @returns The section.
 */
function WireSection({ wire }: { wire: RtlWire }) {
  const blocks = useDiagramStore((s) => s.diagram.blocks);
  const value = useSimulationStore((s) =>
    s.ports.get(`${wire.sourceBlockId}/${wire.sourcePortId}`),
  );
  const endpoint = (blockId: string, portId: string) => {
    const owner = blocks.find((b) => b.id === blockId);
    const port = owner?.ports.find((p) => p.id === portId);
    return { label: owner && port ? `${owner.label}.${port.name}` : "—", width: port?.width ?? 1 };
  };
  const from = endpoint(wire.sourceBlockId, wire.sourcePortId);
  const to = endpoint(wire.targetBlockId, wire.targetPortId);
  return (
    <section className="sim-inspector__section" aria-label="Wire">
      <Fact label="Wire">
        {from.label} → {to.label}
      </Fact>
      {wire.label ? <Fact label="Label">{wire.label}</Fact> : null}
      <Fact label="Value">
        <Readout value={value} width={from.width} />
      </Fact>
    </section>
  );
}

/**
 * The right sidebar in Simulate mode while something is selected: a
 * section for every selected component (and wire), each showing what it is
 * and the live value on each of its ports — plain text, no controls, since
 * nothing can be edited while simulating.
 *
 * @returns The sections.
 */
export default function SimulationInspector() {
  const diagram = useDiagramStore((s) => s.diagram);
  const selection = useDiagramStore((s) => s.selection);
  const blocks = diagram.blocks.filter((b) => selection.blockIds.includes(b.id));
  const wires = diagram.wires.filter((w) => selection.wireIds.includes(w.id));

  return (
    <div className="inspector__section sim-inspector">
      {blocks.map((block) => (
        <BlockSection key={block.id} block={block} />
      ))}
      {wires.map((wire) => (
        <WireSection key={wire.id} wire={wire} />
      ))}
    </div>
  );
}
