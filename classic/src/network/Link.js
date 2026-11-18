function quantity(value, suffix, fallback) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v.endsWith(suffix.toLowerCase())) return Number(v.slice(0, -suffix.length));
    if (v && Number.isFinite(Number(v))) return Number(v);
  }
  return fallback;
}
export class Link {
  constructor(a, b, options = {}) {
    this.id = options.id || `l_${String(a)}_${String(b)}`;
    this.a = typeof a === 'string' ? a : a.id;
    this.b = typeof b === 'string' ? b : b.id;
    this.bw = quantity(options.bw ?? options.bandwidth, 'Mbps', 20);
    this.delay = quantity(options.delay, 'ms', 12);
    this.loss = Number(options.loss ?? 0);
    this.queue = Number(options.queue ?? 20);
    this.weight = Number(options.weight ?? this.delay + 1);
    this.enabled = options.enabled !== false;
    if (!(this.bw > 0) || this.delay < 0 || !Number.isFinite(this.delay) ||
        !(this.weight > 0) || !Number.isFinite(this.weight) ||
        this.loss < 0 || this.loss > 100 || !Number.isInteger(this.queue) || this.queue < 1) {
      throw new RangeError('Invalid link bandwidth, delay, weight, loss, or queue');
    }
  }
  toJSON() {
    const {id,a,b,bw,delay,loss,queue,weight,enabled} = this;
    return {id,a,b,bw,delay,loss,queue,weight,enabled};
  }
}
