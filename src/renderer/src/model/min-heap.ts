/* -----------------------------------------------------------------------------
 * Project:       RTL Schematic
 * Owner:         Joshua H. Kirby
 * Copyright:     Copyright (c) 2026 Joshua H. Kirby. All rights reserved.
 * Last Modified: 2026-09-02
 * --------------------------------------------------------------------------- */

/**
 * A tiny binary min-heap of integer payloads keyed by a numeric priority, used
 * as the open set for the wire router's A* search. Kept generic-free and
 * allocation-light because it is rebuilt for every wire on every edit.
 */
export class MinHeap {
  private readonly items: number[] = [];
  private readonly priorities: number[] = [];

  /** Number of entries currently queued. */
  get size(): number {
    return this.items.length;
  }

  /**
   * Insert a payload with the given priority.
   *
   * @param item - The integer payload (an encoded search state).
   * @param priority - Lower comes out first.
   */
  push(item: number, priority: number): void {
    this.items.push(item);
    this.priorities.push(priority);
    this.bubbleUp(this.items.length - 1);
  }

  /**
   * Remove and return the lowest-priority payload.
   *
   * @returns The payload, or -1 when the heap is empty.
   */
  pop(): number {
    if (this.items.length === 0) {
      return -1;
    }
    const top = this.items[0];
    const lastItem = this.items.pop() as number;
    const lastPriority = this.priorities.pop() as number;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.priorities[0] = lastPriority;
      this.bubbleDown(0);
    }
    return top;
  }

  /**
   * Restore the heap property upwards from a freshly inserted leaf.
   *
   * @param index - Index of the entry that may violate the invariant.
   */
  private bubbleUp(index: number): void {
    let child = index;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      if (this.priorities[parent] <= this.priorities[child]) {
        break;
      }
      this.swap(parent, child);
      child = parent;
    }
  }

  /**
   * Restore the heap property downwards from the root after a pop.
   *
   * @param index - Index of the entry that may violate the invariant.
   */
  private bubbleDown(index: number): void {
    const count = this.items.length;
    let parent = index;
    for (;;) {
      const left = parent * 2 + 1;
      const right = left + 1;
      let smallest = parent;
      if (left < count && this.priorities[left] < this.priorities[smallest]) {
        smallest = left;
      }
      if (right < count && this.priorities[right] < this.priorities[smallest]) {
        smallest = right;
      }
      if (smallest === parent) {
        break;
      }
      this.swap(parent, smallest);
      parent = smallest;
    }
  }

  /**
   * Swap two heap slots.
   *
   * @param a - First index.
   * @param b - Second index.
   */
  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.priorities[a], this.priorities[b]] = [
      this.priorities[b],
      this.priorities[a],
    ];
  }
}
