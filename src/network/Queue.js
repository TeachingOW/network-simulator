// One FIFO output queue for one direction of a bidirectional link.
export class Queue {
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('Queue capacity must be positive');
    this.capacity = capacity;
    this.waiting = [];
    this.busy = false;
    this.drop = 0;
    this.tx = 0;
  }
  enqueue(item) {
    if (this.waiting.length >= this.capacity) { this.drop++; return false; }
    this.waiting.push(item);
    return true;
  }
  shift() { return this.waiting.shift(); }
}
