// Run with: node examples/simple-network.js
import { Simulator } from '../src/core/Simulator.js';

const sim = new Simulator();
const h1 = sim.addHost('h1');
const r1 = sim.addRouter('r1');
const h2 = sim.addHost('h2');

sim.connect(h1, r1, {bandwidth:'10Mbps', delay:'10ms', weight:5});
sim.connect(r1, h2, {bandwidth:'5Mbps', delay:'20ms', weight:2});
sim.setRouting('dijkstra', 'custom');

// Trusted JavaScript callback for an intermediate router.
let seen=0;
r1.onPacket((packet, ctx) => {
  seen++;
  if(seen % 5 === 0) return packet.drop('every_fifth');
  if(seen % 7 === 0) ctx.inject('h2',256);
  return packet.forward();
});

sim.generateDatagrams(h1, h2, {rate:100,packetSize:1024,duration:5});
console.log('Forwarding table for r1:', [...sim.getForwardingTable('r1')]);
console.log('Summary:', sim.run({until:7}));
console.log('Recent trace:', sim.trace.slice(-8));
