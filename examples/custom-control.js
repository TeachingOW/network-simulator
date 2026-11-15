import { Simulator } from '../src/core/Simulator.js';

const sim = new Simulator();

sim.addHost('h1');
const router = sim.addRouter('r1');
sim.addHost('h2');

sim.connect('h1', 'r1', {
  bw: 10,
  delay: 10,
  queue: 20
});

sim.connect('r1', 'h2', {
  bw: 5,
  delay: 20,
  queue: 10
});

let packetsSeen = 0;

router.onPacket((packet, context) => {
  packetsSeen++;

  // Restrict remaining TTL.
  packet.ttl = Math.min(packet.ttl, 4);

  // Drop every fifth packet.
  if (packetsSeen % 5 === 0) {
    return packet.drop('custom_policy');
  }

  // Inject additional test traffic.
  if (packetsSeen % 7 === 0) {
    context.inject('h2', 256);
  }

  return packet.forward();
});

sim.generateDatagrams('h1', 'h2', {
  srcPort: 49152,
  dstPort: 8080,
  pps: 20,
  bytes: 1024,
  duration: 5
});

const result = sim.run({ until: 8 });

console.log(result);
console.table(sim.trace);