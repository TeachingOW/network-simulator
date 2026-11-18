import test from 'node:test';
import assert from 'node:assert/strict';
import { packetAnimationState } from '../src/ui/PacketAnimation.js';

test('packet animation remains visible across supported simulation speeds',()=>{
  const flight={start:100,end:110};
  assert.ok(packetAnimationState(flight,200,1));
  assert.ok(packetAnimationState(flight,600,4));
  assert.ok(packetAnimationState(flight,1700,12));
  assert.equal(packetAnimationState(flight,1800,12),null);
});

test('packet animation preserves longer propagation timing',()=>{
  const flight={start:100,end:1100};
  const halfway=packetAnimationState(flight,600,1);
  assert.equal(halfway.raw,0.5);
  assert.equal(halfway.progress,0.5);
});

import { PacketAnimator } from '../src/ui/PacketAnimation.js';

test('fast packets animate each hop in sequence and finish while protocol time is frozen',()=>{
  for(const speed of [.5,1,4,12]) {
    const animator=new PacketAnimator();
    const flights=[{packet:1,a:'a',b:'r',start:0,end:10},{packet:1,a:'r',b:'b',start:11,end:21}];
    animator.observe(flights,[],speed);
    assert.equal(animator.sample().length,1);
    animator.tick(70);const first=animator.sample()[0];
    assert.equal(first.flight.a,'a');assert.equal(first.state.progress,.5);
    animator.observe(flights,[],speed);assert.equal(animator.flights.length,2,'history is not replayed');
    animator.tick(140);assert.equal(animator.sample()[0].flight.a,'r');
    animator.tick(71);assert.equal(animator.pending,false);assert.equal(animator.sample().length,0);
  }
});
test('packet motion freezes on pause and reset removes previous experiment visuals',()=>{
  const animator=new PacketAnimator();animator.observe([{packet:1,a:'a',b:'b',start:0,end:500}]);
  animator.tick(100);const before=animator.sample()[0].state.progress;
  assert.equal(animator.sample()[0].state.progress,before);
  animator.tick(100);assert.ok(animator.sample()[0].state.progress>before);
  animator.reset();assert.equal(animator.pending,false);assert.equal(animator.time,0);
});
test('TTL and loss pulses wait for the packet to reach the drop node and then clear',()=>{
  const animator=new PacketAnimator();
  animator.observe([{packet:1,a:'a',b:'r',start:0,end:10}],[{packet:1,location:'r',time:10}]);
  assert.equal(animator.sampleDrops().length,0);
  animator.tick(150);assert.equal(animator.sampleDrops().length,1);
  animator.tick(450);assert.equal(animator.pending,false);
});
test('crowded networks bound visual sampling without affecting simulation events',()=>{
  const animator=new PacketAnimator();
  animator.observe(Array.from({length:1000},(_,i)=>({packet:i,a:'a',b:'b',start:0,end:10})),[],12);
  assert.equal(animator.flights.length,96);assert.equal(animator.sample().length,48);
});
