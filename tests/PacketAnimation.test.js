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
