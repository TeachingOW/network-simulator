import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulator } from '../src/core/Simulator.js';
import { playbackAdvance } from '../src/ui/Playback.js';
import { Simulator as ClassicSimulator } from '../classic/src/core/Simulator.js';
import { playbackAdvance as classicAdvance } from '../classic/src/ui/Playback.js';

function network(Engine,loss=80) {
  const sim=new Engine();sim.addHost('a');sim.addRouter('r');sim.addHost('b');
  sim.connect('a','r',{loss,delay:10});sim.connect('r','b',{delay:10});
  sim.generateTcp('a','b',{bytes:4000});
  return sim;
}
function play(sim,advance,skipIdle) {
  let frames=0,skipped=0;
  while(sim.heap.length) {
    const next=advance(sim,16,1,{skipIdle});
    skipped+=next.skippedMs;
    if(!sim.heap.length)break;
    sim.advanceTo(next.target,30000,{stopWhenIdle:true});
    assert.ok(++frames<200000,'bounded playback');
  }
  return {frames,skipped};
}
for(const [name,Engine,advance] of [['updated',Simulator,playbackAdvance],['classic',ClassicSimulator,classicAdvance]]) {
  for(const loss of [15,80,100])test(`${name}: skipping waits at ${loss}% loss preserves every TCP event and outcome`,()=>{
    const normal=network(Engine,loss),fast=network(Engine,loss);
    const baseline=play(normal,advance,false),accelerated=play(fast,advance,true);
    assert.deepEqual(fast.trace,normal.trace);
    assert.deepEqual(fast.tcpConnections.get('tcp1').summary(),normal.tcpConnections.get('tcp1').summary());
    assert.equal(fast.dropped,normal.dropped);
    assert.equal(fast.rng,normal.rng,'identical random draws');
    if(loss>=80) {
      assert.ok(accelerated.skipped>60000,'long retry waits are skipped');
      assert.ok(accelerated.frames<baseline.frames/20,'at least 20x fewer playback frames');
    }
  });
}
test('skip control and pending animations retain normal playback timing',()=>{
  const sim=network(Simulator);sim.advanceTo(100);
  const retry=sim.heap.peek();assert.equal(retry.type,'tcp_timeout');
  assert.equal(playbackAdvance(sim,16,1,{skipIdle:false}).target,116);
  assert.equal(playbackAdvance(sim,16,1,{animationPending:true}).target,116);
  assert.equal(playbackAdvance(sim,16,1).target,sim.heap.peek().at);
});
test('active links, packet propagation, and datagram events are never skipped',()=>{
  const sim=network(Simulator);sim.advanceTo(100);
  const normal=()=>assert.equal(playbackAdvance(sim,16,1).target,sim.now+16);
  sim.flight.push({start:sim.now,end:2000});normal();sim.flight=[];
  const queue=sim.queues.values().next().value;
  queue.busy=true;normal();queue.busy=false;
  queue.waiting.push({});normal();queue.waiting=[];
  sim.event(150,'emit',{flowId:'later'});normal();
});
test('long staggered starts do not get treated as TCP retry waits',()=>{
  const sim=new Simulator();sim.addHost('a');sim.addRouter('r');sim.addHost('b');
  sim.connect('a','r');sim.connect('r','b');sim.generateTcp('a','b',{bytes:1000,start:60});
  assert.equal(playbackAdvance(sim,16,1).target,16);
});
