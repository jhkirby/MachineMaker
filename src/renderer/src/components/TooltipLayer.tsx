/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-11-02
 * --------------------------------------------------------------------------- */

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Attribute a `title` is moved into so the native tooltip never shows. */
const TOOLTIP_ATTR = "data-tooltip";

/** Hover time before a tooltip appears, matching the OS's own feel. */
const SHOW_DELAY_MS = 450;

/** Gap between the hovered element and its tooltip, in CSS pixels. */
const OFFSET = 6;

/** Closest the tooltip may sit to a window edge. */
const EDGE_MARGIN = 6;

/** A tooltip waiting to be (or being) shown. */
interface TooltipState {
  text: string;
  /** The hovered element's box, in viewport coordinates. */
  anchor: DOMRect;
}

/**
 * Move an element's `title` into {@link TOOLTIP_ATTR}, so the browser's own
 * tooltip (which can't be styled) never appears and this layer draws it
 * instead.
 *
 * @param el - The element to convert.
 */
function adoptTitle(el: Element): void {
  const title = el.getAttribute("title");
  if (title !== null && !(el instanceof SVGElement)) {
    el.setAttribute(TOOLTIP_ATTR, title);
    el.removeAttribute("title");
  }
}

/**
 * App-wide replacement for native tooltips. Every `title` attribute in the
 * page — the app's own and React Flow's — is taken over as it appears, and
 * shown in the app's own style (app.css, TOOLTIP) when its element is
 * hovered. Components keep writing plain `title` props; nothing else needs
 * to know about this.
 *
 * @returns The tooltip element, or null while nothing is hovered.
 */
export default function TooltipLayer() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(
    null,
  );
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Convert titles as soon as they exist: on mount for what's already
  // rendered, then whenever React adds an element or changes a title (e.g.
  // the lock button's text flipping after a click).
  useEffect(() => {
    document.querySelectorAll("[title]").forEach(adoptTitle);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          adoptTitle(mutation.target as Element);
        } else {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof Element) {
              adoptTitle(node);
              node.querySelectorAll("[title]").forEach(adoptTitle);
            }
          });
        }
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["title"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    let current: Element | null = null;

    const hide = () => {
      window.clearTimeout(timer);
      current = null;
      setTooltip(null);
    };

    const onOver = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const el = target?.closest(`[${TOOLTIP_ATTR}]`) ?? null;
      if (el === current) {
        return;
      }
      hide();
      const text = el?.getAttribute(TOOLTIP_ATTR);
      if (!el || !text) {
        return;
      }
      current = el;
      timer = window.setTimeout(() => {
        // Re-read at show time: the text may have changed while waiting.
        const latest = el.getAttribute(TOOLTIP_ATTR);
        if (latest && el.isConnected) {
          setTooltip({ text: latest, anchor: el.getBoundingClientRect() });
        }
      }, SHOW_DELAY_MS);
    };

    // Any press, key, or scroll means the user has moved on from reading.
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mousedown", hide, true);
    document.addEventListener("keydown", hide, true);
    document.addEventListener("wheel", hide, true);
    document.documentElement.addEventListener("mouseleave", hide);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mousedown", hide, true);
      document.removeEventListener("keydown", hide, true);
      document.removeEventListener("wheel", hide, true);
      document.documentElement.removeEventListener("mouseleave", hide);
    };
  }, []);

  // Place it once its real size is known: centered under the element,
  // flipped above when there's no room below, and kept inside the window.
  useLayoutEffect(() => {
    const el = tooltipRef.current;
    if (!tooltip || !el) {
      setPosition(null);
      return;
    }
    const { anchor } = tooltip;
    const { width, height } = el.getBoundingClientRect();
    let top = anchor.bottom + OFFSET;
    if (top + height > window.innerHeight - EDGE_MARGIN) {
      top = anchor.top - OFFSET - height;
    }
    const left = Math.min(
      Math.max(anchor.left + anchor.width / 2 - width / 2, EDGE_MARGIN),
      window.innerWidth - width - EDGE_MARGIN,
    );
    setPosition({ left, top: Math.max(top, EDGE_MARGIN) });
  }, [tooltip]);

  if (!tooltip) {
    return null;
  }
  return (
    <div
      ref={tooltipRef}
      className={`tooltip${position ? " tooltip--visible" : ""}`}
      role="tooltip"
      style={position ?? { left: 0, top: 0 }}
    >
      {tooltip.text}
    </div>
  );
}
