// Connectionless datagram; actions are interpreted by the trusted simulation engine.
export class Packet {
  constructor({ id, flowId = 'manual', src, dst, bytes = 1024, created = 0, ttl = 32, injected = false, srcIP = null, dstIP = null, protocol = 17, tcp = null }) {
    Object.assign(this, { id, flowId, src, dst, bytes, created, ttl, injected, srcIP, dstIP, protocol, tcp, version: 4, headerLength: 20 });
  }
  forward() { return { type: 'forward' }; }
  drop(reason = 'program_drop') { return { type: 'drop', reason }; }
  inject(destination, bytes = 256) { return { type: 'inject', destination, bytes }; }
}
