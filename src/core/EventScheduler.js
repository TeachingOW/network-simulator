// Stable discrete-event priority queue. Times are simulation milliseconds.
export class EventScheduler {
  constructor() { this.a = []; this.sequence = 0; }
  get length() { return this.a.length; }
  peek() { return this.a[0]; }
  less(x, y) { return x.at < y.at || (x.at === y.at && x.seq < y.seq); }
  push(event) {
    const a = this.a;
    let i = a.length;
    a.push(event);
    while (i) {
      const p = (i - 1) >> 1;
      if (!this.less(event, a[p])) break;
      a[i] = a[p]; i = p;
    }
    a[i] = event;
  }
  schedule(at, type, data, now = 0) {
    if (!Number.isFinite(at)) throw new RangeError('Event time must be finite');
    const event = { at: Math.max(now, at), type, data, seq: this.sequence++ };
    this.push(event);
    return event;
  }
  pop() {
    if (!this.a.length) return undefined;
    const a = this.a, first = a[0], last = a.pop();
    if (a.length) {
      let i = 0;
      while (2 * i + 1 < a.length) {
        let c = 2 * i + 1;
        if (c + 1 < a.length && this.less(a[c + 1], a[c])) c++;
        if (!this.less(a[c], last)) break;
        a[i] = a[c]; i = c;
      }
      a[i] = last;
    }
    return first;
  }
  clear() { this.a.length = 0; this.sequence = 0; }
}
