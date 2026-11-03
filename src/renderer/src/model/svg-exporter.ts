/* -----------------------------------------------------------------------------
 * Project:       MachineMaker
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import {
  portLabelText,
  type RtlBlock,
  type RtlDiagram,
  type RtlPort,
  type RtlWire,
} from "../../../shared/diagram-model";
import {
  BUS_COLOR,
  WIRE_COLOR,
  blockKindLabel,
  resolvePalette,
} from "./block-appearance";
import { midpoint, portPosition, wirePath } from "./port-geometry";
import type { Theme } from "../state/diagram-store";

const MARGIN = 48;
const PORT_TICK = 8;
const FONT = "12px 'Segoe UI', system-ui, sans-serif";

/** `--surface-canvas` for each theme (tokens.css) — see the matching
 * duplication note on CANVAS_SURFACE_COLOR in DiagramCanvas.tsx; an SVG
 * document is exported standalone, so it can't inherit the app's CSS either. */
const BACKGROUND_BY_THEME: Record<Theme, string> = {
  dark: "#14161b",
  light: "#e8eaef",
};

/**
 * Renders an {@link RtlDiagram} to a standalone SVG string. Pure: the same
 * diagram and theme always yield the same markup, which keeps it trivially
 * testable.
 */
export class SvgExporter {
  /** Set per {@link export} call, read by the render helpers it calls. */
  private theme: Theme = "dark";
  private background = BACKGROUND_BY_THEME.dark;

  /**
   * Produce a complete `<svg>` document for the diagram.
   *
   * @param diagram - The diagram to render.
   * @param theme - Which theme's colors to export against. Defaults to
   *   dark, this app's original look.
   * @returns SVG markup as a string, ready to write to a `.svg` file.
   */
  export(diagram: RtlDiagram, theme: Theme = "dark"): string {
    this.theme = theme;
    this.background = BACKGROUND_BY_THEME[theme];
    const bounds = this.computeBounds(diagram.blocks);
    const blockById = new Map(diagram.blocks.map((b) => [b.id, b]));

    const body = [
      ...diagram.wires.map((wire) => this.renderWire(wire, blockById)),
      ...diagram.blocks.map((block) => this.renderBlock(block)),
    ].join("\n");

    return [
      `<svg xmlns="http://www.w3.org/2000/svg" `,
      `width="${bounds.width}" height="${bounds.height}" `,
      `viewBox="0 0 ${bounds.width} ${bounds.height}" font-family="${FONT}">`,
      `<rect width="100%" height="100%" fill="${this.background}"/>`,
      `<g transform="translate(${-bounds.minX + MARGIN}, ${-bounds.minY + MARGIN})">`,
      body,
      `</g>`,
      `</svg>`,
    ].join("");
  }

  // ── PRIVATE RENDER HELPERS ───────────────────────────────────────────────

  /**
   * Compute the SVG canvas size from the union of all block rectangles.
   *
   * @param blocks - The blocks to bound.
   * @returns Min corner and the padded width/height of the drawing.
   */
  private computeBounds(blocks: RtlBlock[]): {
    minX: number;
    minY: number;
    width: number;
    height: number;
  } {
    if (blocks.length === 0) {
      return { minX: 0, minY: 0, width: 2 * MARGIN, height: 2 * MARGIN };
    }
    const minX = Math.min(...blocks.map((b) => b.x));
    const minY = Math.min(...blocks.map((b) => b.y));
    const maxX = Math.max(...blocks.map((b) => b.x + b.width));
    const maxY = Math.max(...blocks.map((b) => b.y + b.height));
    return {
      minX,
      minY,
      width: maxX - minX + 2 * MARGIN,
      height: maxY - minY + 2 * MARGIN,
    };
  }

  /**
   * Render one block: its body, label, and port ticks with names.
   *
   * @param block - The block to draw.
   * @returns An SVG `<g>` fragment.
   */
  private renderBlock(block: RtlBlock): string {
    const palette = resolvePalette(block, this.theme);
    const parts: string[] = [
      `<rect x="${block.x}" y="${block.y}" width="${block.width}" height="${block.height}" ` +
        `rx="8" fill="${palette.fill}" stroke="${palette.stroke}" stroke-width="1.5"/>`,
      `<text x="${block.x + block.width / 2}" y="${block.y + 16}" ` +
        `text-anchor="middle" fill="${palette.text}" font-weight="600">` +
        `${escapeXml(block.label)}</text>`,
      `<text x="${block.x + block.width / 2}" y="${block.y + 30}" ` +
        `text-anchor="middle" fill="${palette.stroke}" font-size="10">` +
        `${escapeXml(blockKindLabel(block))}</text>`,
    ];

    for (const port of block.ports) {
      parts.push(this.renderPort(block, port, palette.text));
    }
    return `<g>${parts.join("")}</g>`;
  }

  /**
   * Render a single port tick plus its name label.
   *
   * @param block - The owning block.
   * @param port - The port to draw.
   * @param textColor - Color for the port name.
   * @returns An SVG fragment.
   */
  private renderPort(block: RtlBlock, port: RtlPort, textColor: string): string {
    const anchor = portPosition(block, port);
    const horizontal = port.side === "left" || port.side === "right";
    const sign = port.side === "left" || port.side === "top" ? -1 : 1;
    const tickEnd = horizontal
      ? { x: anchor.x + sign * PORT_TICK, y: anchor.y }
      : { x: anchor.x, y: anchor.y + sign * PORT_TICK };

    const labelX = horizontal ? anchor.x - sign * 6 : anchor.x + 6;
    const labelY = horizontal ? anchor.y + 3 : anchor.y + sign * 14;
    const labelAnchor = horizontal
      ? port.side === "left"
        ? "start"
        : "end"
      : "start";
    const label = portLabelText(port);
    // A tied-off port gets the same X through it as on the canvas.
    const tieMark = port.tiedOff
      ? `<path d="M${anchor.x - 5} ${anchor.y - 5}l10 10M${anchor.x + 5} ${anchor.y - 5}l-10 10" ` +
        `stroke="${WIRE_COLOR}" stroke-width="1.8" stroke-linecap="round"/>`
      : "";

    return (
      `<circle cx="${anchor.x}" cy="${anchor.y}" r="3" fill="${WIRE_COLOR}"/>` +
      tieMark +
      `<line x1="${anchor.x}" y1="${anchor.y}" x2="${tickEnd.x}" y2="${tickEnd.y}" ` +
      `stroke="${WIRE_COLOR}" stroke-width="1.5"/>` +
      `<text x="${labelX}" y="${labelY}" text-anchor="${labelAnchor}" ` +
      `fill="${textColor}" font-size="10" opacity="0.85">${escapeXml(label)}</text>`
    );
  }

  /**
   * Render one wire as a bezier path with an optional midpoint label.
   *
   * @param wire - The wire to draw.
   * @param blockById - Lookup from block id to block.
   * @returns An SVG fragment, or an empty string if an endpoint is missing.
   */
  private renderWire(wire: RtlWire, blockById: Map<string, RtlBlock>): string {
    const source = blockById.get(wire.sourceBlockId);
    const target = blockById.get(wire.targetBlockId);
    if (!source || !target) {
      return "";
    }
    const sourcePort = source.ports.find((p) => p.id === wire.sourcePortId);
    const targetPort = target.ports.find((p) => p.id === wire.targetPortId);
    if (!sourcePort || !targetPort) {
      return "";
    }

    const from = portPosition(source, sourcePort);
    const to = portPosition(target, targetPort);
    const path = wirePath(from, sourcePort.side, to, targetPort.side);
    const isBus = (sourcePort.width ?? 1) > 1;
    const color = isBus ? BUS_COLOR : WIRE_COLOR;
    const strokeWidth = isBus ? 3 : 1.5;

    const parts = [
      `<path d="${path}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"/>`,
    ];
    if (wire.label) {
      const mid = midpoint(from, to);
      parts.push(
        `<rect x="${mid.x - wire.label.length * 3.6 - 4}" y="${mid.y - 9}" ` +
          `width="${wire.label.length * 7.2 + 8}" height="16" rx="3" fill="${this.background}"/>`,
        `<text x="${mid.x}" y="${mid.y + 3}" text-anchor="middle" ` +
          `fill="${color}" font-size="10">${escapeXml(wire.label)}</text>`,
      );
    }
    return `<g>${parts.join("")}</g>`;
  }
}

/**
 * Escape the five XML-significant characters for safe insertion into markup.
 *
 * @param value - Raw text.
 * @returns The text with `& < > " '` replaced by entities.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
