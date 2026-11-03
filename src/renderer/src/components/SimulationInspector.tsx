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
import { blockKindLabel } from "../model/block-appearance";
import { useDiagramStore } from "../state/diagram-store";

/**
 * One label/value line of the read-only summary.
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
 * The inspector in Simulate mode: what the selection *is* — name, kind,
 * size, ports, link — as plain text, with no controls at all, since
 * nothing can be edited while simulating.
 *
 * @param props.block - The selected block, if one is.
 * @param props.wire - The selected wire, if one is.
 * @returns The summary.
 */
export default function SimulationInspector({
  block,
  wire,
}: {
  block?: RtlBlock;
  wire?: RtlWire;
}) {
  const diagram = useDiagramStore((s) => s.diagram);
  const selectedCount = useDiagramStore(
    (s) => s.selection.blockIds.length + s.selection.wireIds.length,
  );

  if (block) {
    return (
      <div className="inspector__section sim-inspector">
        <Fact label="Name">{block.label}</Fact>
        <Fact label="Kind">{blockKindLabel(block)}</Fact>
        {isLinkedModule(block) ? (
          <Fact label="Linked to">{block.linkedModule?.name || block.linkedModule?.path}</Fact>
        ) : null}
        <h3 className="inspector__subheading">Ports</h3>
        <ul className="sim-inspector__ports">
          {block.ports.map((port) => (
            <li key={port.id} className="sim-inspector__port">
              <span className="sim-inspector__port-name">{port.name}</span>
              <span className="sim-inspector__port-meta">
                {port.direction}
                {formatBusWidth(port.width) ? ` ${formatBusWidth(port.width)}` : ""}
                {port.tiedOff ? " · tied off" : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (wire) {
    const endpoint = (blockId: string, portId: string) => {
      const owner = diagram.blocks.find((b) => b.id === blockId);
      const port = owner?.ports.find((p) => p.id === portId);
      return owner && port ? `${owner.label}.${port.name}` : "—";
    };
    return (
      <div className="inspector__section sim-inspector">
        <Fact label="From">{endpoint(wire.sourceBlockId, wire.sourcePortId)}</Fact>
        <Fact label="To">{endpoint(wire.targetBlockId, wire.targetPortId)}</Fact>
        {wire.label ? <Fact label="Label">{wire.label}</Fact> : null}
      </div>
    );
  }

  return (
    <div className="inspector__section sim-inspector">
      <p className="inspector__stat">
        {selectedCount} selected · {diagram.blocks.length} blocks ·{" "}
        {diagram.wires.length} wires
      </p>
    </div>
  );
}
