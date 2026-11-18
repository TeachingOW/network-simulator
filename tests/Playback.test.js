import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulator } from '../src/core/Simulator.js';
import { campusNetworkModel } from '../src/ui/ExampleNetworks.js';

function line(options={}) {
  const sim=new Simulator();sim.addHost('a');sim.addRouter('r');sim.addHost('b');
  sim.connect('a','r',options);sim.connect('r','b',options);return sim;
}
function playToEnd(sim,step=100,limit=120000) {
  let frames=0;
  do {sim.advanceTo(sim.now+step,30000,{stopWhenIdle:true});frames++;}
  while(sim.heap.length && sim.now<limit && frames<2000);
  assert.equal(sim.heap.length,0,'playback should finish within the budget');
  return sim.now;
}
test('playback freezes at the final delivery and repeated steps cannot move the clock',()=>{
  const sim=line({delay:25,bw:10});sim.generateDatagrams('a','b',{rate:10,duration:1});
  const end=playToEnd(sim);
  assert.equal(end,sim.trace.at(-1).time*1000);
  assert.equal(sim.sent,sim.received);
  assert.ok(end<1100);
  sim.advanceTo(end+10000,30000,{stopWhenIdle:true});assert.equal(sim.now,end);
});
test('clock continues through staggered starts and drains long queues after sources stop',()=>{
  const model=campusNetworkModel();model.flows.forEach(f=>{f.pps=2;f.duration=.1;});
  const campus=new Simulator({model});campus.advanceTo(500,30000,{stopWhenIdle:true});
  assert.equal(campus.now,500);assert.ok(campus.heap.length);
  assert.ok(playToEnd(campus)>3000);
  const sim=line({bw:.05,delay:100,queue:100});
  sim.generateDatagrams('a','b',{rate:10,packetSize:1000,duration:1});
  const end=playToEnd(sim);assert.ok(end>1000);assert.equal(sim.sent,sim.received);
});
test('completed TCP does not keep the clock running for cancelled timeout events',()=>{
  const sim=line({delay:10});sim.generateTcp('a','b',{bytes:5000,rto:60000});
  const end=playToEnd(sim);
  assert.equal(sim.tcpConnections.get('tcp1').state,'CLOSED');
  assert.equal(sim.tcpConnections.get('tcp1').receivedBytes,5000);
  assert.ok(end<1000,'a cancelled 60-second timer must not extend playback');
});
test('active TCP retries remain scheduled until the connection fails',()=>{
  const sim=line({loss:100});sim.generateTcp('a','b',{bytes:1000,rto:100});
  sim.tcpConnections.get('tcp1').maxRetries=1;
  sim.advanceTo(50,30000,{stopWhenIdle:true});assert.ok(sim.heap.length);
  const end=playToEnd(sim);
  assert.equal(sim.tcpConnections.get('tcp1').state,'FAILED');assert.ok(end>=300);
});
test('an empty experiment stays at zero and event processing limits retain pending work',()=>{
  const empty=new Simulator();empty.advanceTo(1000,30000,{stopWhenIdle:true});assert.equal(empty.now,0);
  const sim=line();sim.generateDatagrams('a','b',{rate:100,duration:1});
  sim.advanceTo(5000,1,{stopWhenIdle:true});assert.equal(sim.limitReached,true);assert.ok(sim.heap.length);
  playToEnd(sim);assert.equal(sim.sent,sim.received);
});
test('the larger campus is connected, has route redundancy, and delivers all four flows',()=>{
  const model=campusNetworkModel(),sim=new Simulator({model});
  assert.equal(model.nodes.length,15);assert.ok(model.links.length>model.nodes.length);
  const end=playToEnd(sim,200);
  assert.ok(end>=12000);assert.equal(sim.sent,sim.received);assert.equal(sim.dropped,0);
  for(const flow of model.flows)assert.ok(sim.trace.some(e=>e.flow===flow.id&&e.action==='DELIVER'));
  const primary=sim.tablePath('h1','h2').links;
  const alternative=new Simulator({model:{...model,links:model.links.map(l=>({...l,enabled:l.id!=='r1-core-a'}))}}).tablePath('h1','h2');
  assert.ok(primary.includes('r1-core-a'));assert.ok(alternative);assert.ok(!alternative.links.includes('r1-core-a'));
});
