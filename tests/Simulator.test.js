import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulator } from '../src/core/Simulator.js';
import { EventScheduler } from '../src/core/EventScheduler.js';

function line(linkOptions={}) {
  const sim=new Simulator();
  sim.addHost('a');const relay=sim.addRouter('r');sim.addHost('b');
  sim.connect('a','r',linkOptions);
  sim.connect('r','b');
  return {sim,relay};
}

test('stable event ordering at identical simulated timestamps',()=>{
  const queue=new EventScheduler();
  queue.schedule(8,'first');queue.schedule(4,'early');queue.schedule(8,'second');
  assert.deepEqual([queue.pop().type,queue.pop().type,queue.pop().type],['early','first','second']);
});

test('source to destination datagrams traverse intermediate router',()=>{
  const {sim}=line();
  sim.generateDatagrams('a','b',{rate:10,packetSize:256,duration:1});
  const result=sim.run({until:3});
  assert.ok(result.received>=9);
  assert.equal(result.dropped,0);
  assert.equal(result.generated,result.received);
  assert.ok(sim.trace.some(x=>x.action==='FORWARD'&&x.loc==='r'));
});

test('packet drops create bounded visual diagnostics',()=>{
  const {sim}=line({loss:100});
  sim.generateDatagrams('a','b',{rate:2,duration:1});
  sim.run({until:1.2});
  assert.ok(sim.dropBursts.length>0);
  assert.ok(sim.dropBursts.every(d=>d.reason==='random_loss'));
  assert.ok(sim.dropBursts.length<=80);
});

test('Dijkstra and Bellman-Ford respect custom weights independently of delay',()=>{
  for(const algo of ['dijkstra','bellman']) {
    const sim=new Simulator();
    sim.addHost('a');sim.addHost('b');sim.addRouter('r1');sim.addRouter('r2');
    sim.connect('a','r1',{delay:50,weight:1});
    sim.connect('r1','b',{delay:50,weight:1});
    sim.connect('a','r2',{delay:1,weight:5});
    sim.connect('r2','b',{delay:1,weight:5});
    sim.setRouting(algo,'custom');
    assert.deepEqual(sim.tablePath('a','b').nodes,['a','r1','b']);
    assert.equal(sim.getForwardingTable('a').get('b').cost,2);
    sim.setRouting(algo,'delay');
    assert.deepEqual(sim.tablePath('a','b').nodes,['a','r2','b']);
  }
});

test('forwarding tables are not recomputed per datagram',()=>{
  const {sim}=line();
  sim.generateDatagrams('a','b',{rate:10,duration:1});
  const before=sim.routeVersion;sim.run({until:2});
  assert.equal(sim.routeVersion,before);
});

test('link configuration changes route on explicit recomputation',()=>{
  const sim=new Simulator();
  sim.addHost('a');sim.addHost('b');sim.addRouter('r1');sim.addRouter('r2');
  const one=sim.connect('a','r1',{weight:1});
  sim.connect('r1','b',{weight:1});
  sim.connect('a','r2',{weight:5});
  sim.connect('r2','b',{weight:5});
  sim.setRouting('dijkstra','custom');
  assert.deepEqual(sim.tablePath('a','b').nodes,['a','r1','b']);
  sim.configureLink(one.id,{weight:50});
  assert.deepEqual(sim.tablePath('a','b').nodes,['a','r2','b']);
});

test('custom router program can drop every fifth datagram',()=>{
  const {sim,relay}=line();
  let count=0;
  relay.onPacket(packet=>++count%5===0?packet.drop('sampled_drop'):packet.forward());
  sim.generateDatagrams('a','b',{rate:19,duration:1});
  const result=sim.run({until:3});
  assert.equal(result.dropped,Math.floor(count/5));
  assert.equal(result.generated,result.received+result.dropped);
  assert.equal(result.dropReasons.sampled_drop,Math.floor(count/5));
});

test('router can inject additional datagrams, and injected packets do not recur',()=>{
  const {sim,relay}=line();
  let count=0;
  relay.onPacket((packet,ctx)=>{
    if(++count%3===0)ctx.inject('b',256);
    return packet.forward();
  });
  sim.generateDatagrams('a','b',{rate:10,duration:1});
  const result=sim.run({until:3});
  assert.ok(sim.injected>=2);
  assert.equal(result.generated,result.received);
  assert.equal(count,result.generated-sim.injected);
});

test('declarative node drop/inject rules also work through the shared engine',()=>{
  const {sim,relay}=line();
  relay.program={flowId:'f1',dropEvery:5,injectEvery:3,injectDst:'b',injectBytes:256};
  sim.generateDatagrams('a','b',{id:'f1',rate:20,duration:1});
  const result=sim.run({until:3});
  assert.ok(result.dropReasons.program_drop>=2);
  assert.ok(sim.injected>=3);
  assert.equal(result.generated,result.received+result.dropped);
});

test('loss, FIFO congestion, and queue counters are accounted for',()=>{
  const sim=new Simulator();sim.addHost('a');sim.addHost('b');
  const link=sim.connect('a','b',{bw:0.1,queue:2,loss:0});
  sim.generateDatagrams('a','b',{rate:100,packetSize:1200,duration:1});
  const result=sim.run({until:4});
  assert.ok(result.dropReasons.queue_full>=10);
  assert.ok(sim.queues.get(link.id+'|a').drop>=10);
});

test('100-percent loss prevents delivery',()=>{
  const sim=new Simulator();sim.addHost('a');sim.addHost('b');
  sim.connect('a','b',{loss:100});
  sim.generateDatagrams('a','b',{rate:10,duration:1});
  const result=sim.run({until:3});
  assert.equal(result.received,0);
  assert.equal(result.generated,result.dropped);
  assert.equal(result.dropReasons.random_loss,result.dropped);
});

test('disabled links remove destinations from forwarding tables',()=>{
  const {sim}=line();
  const l=sim.network.links[0];
  sim.configureLink(l.id,{enabled:false});
  assert.equal(sim.tablePath('a','b'),null);
  assert.equal(sim.getForwardingTable('a').has('b'),false);
});

test('topology can be serialized and reloaded with weights and routing',()=>{
  const {sim}=line({weight:9});
  sim.setRouting('bellman','custom');
  const clone=new Simulator({model:JSON.parse(JSON.stringify(sim.toJSON()))});
  assert.equal(clone.algorithm,'bellman');
  assert.equal(clone.routing,'custom');
  assert.equal(clone.network.links[0].weight,9);
  assert.deepEqual(clone.tablePath('a','b').nodes,['a','r','b']);
});

test('event step supports pause/resume semantics',()=>{
  const {sim}=line();
  sim.generateDatagrams('a','b',{rate:10,duration:1});
  sim.step(100);const count=sim.processed;
  assert.ok(count>0);assert.equal(sim.now,100);
  sim.step(150);assert.ok(sim.processed>count);assert.equal(sim.now,250);
});
