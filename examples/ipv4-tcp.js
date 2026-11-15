// Run with: node examples/ipv4-tcp.js
// An educational IPv4 + TCP Reno experiment, not an actual network transfer.
import { Simulator } from '../src/core/Simulator.js';

const sim=new Simulator({seed:24313});
const client=sim.addHost('client');
const router=sim.addRouter('router');
const server=sim.addHost('server');

sim.connect(client,router,{bandwidth:'10Mbps',delay:'10ms',loss:2,weight:2});
sim.connect(router,server,{bandwidth:'3Mbps',delay:'40ms',loss:5,weight:4});
sim.setRouting('dijkstra','delay');

console.log('IPv4 endpoint addresses:',sim.getIP(client),sim.getIP(server));
console.log('Router interface addresses:',sim.getInterfaces(router));
console.log('Router IPv4 table:',sim.getIPv4RoutingTable(router).toJSON());

sim.generateTcp(client,server,{id:'tcp-demo',bytes:30000,mss:1000,rwnd:32,start:0,rto:400,ssthresh:16});
const outcome=sim.run({until:35});
console.log('TCP sender summary:',{...outcome.tcp[0],cwndHistory:'('+
  outcome.tcp[0].cwndHistory.length+' samples)'});
console.log('cwnd samples:',outcome.tcp[0].cwndHistory.slice(0,12));
console.log('Packet drop reasons:',outcome.dropReasons);
console.log('TCP trace events:',sim.trace.filter(t=>t.action.startsWith('TCP_')).slice(0,12));
