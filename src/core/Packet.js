// Connectionless datagram; actions are interpreted by the trusted simulation engine.
export class Packet {
  constructor({ id, flowId = 'manual', src, dst, bytes = 1024, created = 0, ttl = 32, injected = false }) {
    Object.assign(this, { id, flowId, src, dst, bytes, created, ttl, injected });
  }
  forward() { return { type: 'forward' }; }
  drop(reason = 'program_drop') { return { type: 'drop', reason }; }
  inject(destination, bytes = 256) { return { type: 'inject', destination, bytes }; }
}
