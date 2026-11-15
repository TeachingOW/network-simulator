// Run with: node examples/routing-example.js
import { Simulator } from '../src/core/Simulator.js';

const sim=new Simulator();
const h1=sim.addHost('h1'),h2=sim.addHost('h2');
const r1=sim.addRouter('r1'),r2=sim.addRouter('r2');
sim.connect(h1,r1,{delay:30,weight:1});
sim.connect(r1,h2,{delay:30,weight:1});
sim.connect(h1,r2,{delay:2,weight:5});
sim.connect(r2,h2,{delay:2,weight:5});

for(const algorithm of ['dijkstra','bellman']) {
  sim.setRouting(algorithm,'custom');
  console.log(algorithm,'custom weights:',sim.tablePath('h1','h2').nodes);
  sim.setRouting(algorithm,'delay');
  console.log(algorithm,'delay metric:',sim.tablePath('h1','h2').nodes);
}
