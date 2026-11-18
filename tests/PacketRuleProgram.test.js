import test from 'node:test';
import assert from 'node:assert/strict';
import { compilePacketProgram, runPacketProgram } from '../src/programming/PacketRuleProgram.js';
import { Simulator } from '../src/core/Simulator.js';

const SOURCE=`
when dstPort == 8080:
  set ttl 4
  forward
otherwise:
  drop "blocked_port"
`;

test('sandbox compiler accepts allow-listed packet rules',()=>{
  const compiled=compilePacketProgram(SOURCE),packet={dstPort:8080,ttl:32};
  assert.deepEqual(runPacketProgram(compiled,packet,{inject(){throw new Error('unexpected');}}),{type:'forward'});
  assert.equal(packet.ttl,4);
  assert.deepEqual(runPacketProgram(compiled,{dstPort:22,ttl:32},{inject(){}}),{type:'drop',reason:'blocked_port'});
});

test('sandbox rejects JavaScript and object traversal',()=>{
  assert.throws(()=>compilePacketProgram('when constructor == 1:\n forward'),/not available/);
  assert.throws(()=>compilePacketProgram('otherwise:\n window.alert(1)'),/unknown action/);
  assert.throws(()=>compilePacketProgram('otherwise:\n set ttl 999'),/TTL/);
});

test('sandboxed router program controls simulated packets',()=>{
  const sim=new Simulator();sim.addHost('a');const router=sim.addRouter('r');sim.addHost('b');
  sim.connect('a','r');sim.connect('r','b');
  router.program={language:'packetlab-rules-v1',source:SOURCE};
  sim.generateDatagrams('a','b',{dstPort:8080,pps:2,duration:.5});
  assert.ok(sim.run({until:2}).received>0);
  sim.network.flows=[];sim.generateDatagrams('a','b',{dstPort:22,pps:2,duration:.5});
  sim.run({until:2});
  assert.equal(sim.dropReasons.get('blocked_port'),1);
});

for (const [name,load] of [
  ['updated',()=>import('../src/core/Simulator.js')],
  ['classic',()=>import('../classic/src/core/Simulator.js')]
]) test(`${name}: port 8070 drops at the relay while port 8080 is delivered, including after reload`,async()=>{
  const {Simulator:Engine}=await load();
  const sim=new Engine();sim.addHost('a');sim.addRouter('r');sim.addHost('b');
  sim.connect('a','r');sim.connect('r','b');
  sim.network.node('r').program={language:'packetlab-rules-v1',source:'when dstPort == 8080:\n  forward\notherwise:\n  drop "blocked_port"'};
  sim.generateDatagrams('a','b',{id:'blocked',dstPort:8070,pps:10,duration:1});
  sim.generateDatagrams('a','b',{id:'allowed',dstPort:8080,pps:10,duration:1});
  for(const engine of [sim,new Engine({model:sim.toJSON()})]) {
    engine.run({until:2});
    assert.equal(engine.received,10);
    assert.equal(engine.dropped,10);
    assert.equal(engine.dropReasons.get('blocked_port'),10);
    assert.equal(engine.trace.filter(e=>e.action==='DROP'&&e.loc==='r'&&e.ports.endsWith('→8070')).length,10);
    assert.equal(engine.trace.filter(e=>e.action==='DELIVER'&&e.ports.endsWith('→8080')).length,10);
  }
});
