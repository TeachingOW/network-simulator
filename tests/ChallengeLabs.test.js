import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulator } from '../src/core/Simulator.js';
import { CHALLENGE_LABS, challengeLabModel, challengeLabProgress } from '../src/ui/ChallengeLabs.js';

function run(model,until=3) {
  const sim=new Simulator({model});sim.run({until});
  const flow=model.flows[0]||model.tcpFlows[0];
  return {sim,progress:challengeLabProgress(model,sim,sim.tablePath(flow.src,flow.dst))};
}
function repair(model) {
  if(model.challenge==='slow-campus-network')model.links.find(l=>l.id==='r1-r2').weight=100;
  if(model.challenge==='queue-rescue')model.links[1].bw=10;
  if(model.challenge==='restore-connectivity')model.links[1].enabled=true;
  if(model.challenge==='tcp-recovery')model.tcpFlows[0].rwnd=8;
  if(model.challenge==='ttl-expiry')model.nodes.find(n=>n.id==='ingress').program.source='when dstPort == 443:\n  set ttl 8\n  forward\notherwise:\n  forward';
  if(model.challenge==='port-policy')model.nodes.find(n=>n.id==='core').program={language:'packetlab-rules-v1',source:'when dstPort == 443:\n  forward\notherwise:\n  drop "blocked_port"'};
  return model;
}
for(const lab of CHALLENGE_LABS) {
  test(`${lab.id}: starts unsolved and the mission can be completed`,()=>{
    const baseline=challengeLabModel(lab.id);
    assert.equal(run(baseline).progress.complete,false);
    const {progress}=run(repair(baseline),lab.id==='tcp-recovery'?30:3);
    assert.equal(progress.complete,true,JSON.stringify(progress.checks));
  });
  test(`${lab.id}: editing traffic or topology cannot bypass the mission`,()=>{
    const model=repair(challengeLabModel(lab.id));
    if(model.flows.length)model.flows[0].pps=1;
    else model.tcpFlows[0].bytes=1;
    assert.equal(run(model).progress.complete,false);
    const topology=repair(challengeLabModel(lab.id));
    topology.nodes.push({id:'extra',type:'host',name:'Extra',x:40,y:40});
    assert.equal(run(topology).progress.complete,false);
  });
}
test('challenge models are fresh on every launch and unknown IDs are rejected',()=>{
  const model=challengeLabModel('queue-rescue');model.links[1].bw=99;
  assert.equal(challengeLabModel('queue-rescue').links[1].bw,.4);
  assert.throws(()=>challengeLabModel('unknown'),/Unknown challenge/);
  assert.equal(challengeLabProgress({},null,null),null);
});
test('packet policy must block unwanted traffic without dropping web traffic',()=>{
  const model=challengeLabModel('port-policy');
  model.nodes[1].program={language:'packetlab-rules-v1',source:'when dstPort == 443:\n  drop "blocked"\notherwise:\n  drop "blocked"'};
  assert.equal(run(model).progress.complete,false);
  model.nodes[1].program.source='when dstPort == 443:\n  forward\notherwise:\n  forward';
  assert.equal(run(model).progress.complete,false);
});
test('large queues alone cannot mask a sustained bottleneck',()=>{
  const model=challengeLabModel('queue-rescue');model.links[1].queue=20000;
  const {sim,progress}=run(model,15);
  assert.equal(sim.dropped,0);
  // A queue can suppress drops while leaving almost all requests undelivered.
  assert.equal(progress.complete,false);
});

test('TTL challenge expires at the downstream router and a retained TTL policy repairs it',()=>{
  const model=challengeLabModel('ttl-expiry');
  const broken=run(model);
  assert.ok(broken.sim.dropReasons.get('ttl_expired')>=100);
  assert.equal(broken.sim.received,0);
  assert.ok(broken.sim.trace.some(e=>e.loc==='edge'&&e.detail==='ttl_expired'));
  const fixed=run(repair(model));assert.equal(fixed.progress.complete,true);
  assert.equal(fixed.sim.dropReasons.get('ttl_expired'),undefined);
  delete model.nodes.find(n=>n.id==='ingress').program;
  assert.equal(run(model).progress.complete,false,'removing the TTL exercise is not a repair');
});

test('a comment does not count as retaining the TTL-setting rule',()=>{
  const model=challengeLabModel('ttl-expiry');
  model.nodes.find(n=>n.id==='ingress').program.source='# set ttl 8\notherwise:\n  forward';
  assert.equal(run(model).progress.complete,false);
});


test('TCP baseline delivers reliably but misses the deadline; window tuning meets it',()=>{
  const baseline=run(challengeLabModel('tcp-recovery'),60);
  const original=baseline.sim.tcpConnections.get('file');
  assert.equal(original.state,'CLOSED');assert.equal(original.receivedBytes,48000);
  assert.ok(original.completedAt>6000);assert.equal(baseline.progress.complete,false);
  const model=repair(challengeLabModel('tcp-recovery')),sim=new Simulator({model});
  while(sim.heap.length && sim.now<60000)sim.advanceTo(sim.now+100,30000,{stopWhenIdle:true});
  const connection=sim.tcpConnections.get('file');
  assert.equal(connection.state,'CLOSED');assert.equal(connection.receivedBytes,48000);
  assert.ok(connection.completedAt<=6000);assert.ok(connection.retransmissions>0);
  assert.equal(challengeLabProgress(model,sim,sim.tablePath('client','server')).complete,true);
  assert.equal(sim.heap.length,0);
  const stoppedAt=sim.now;sim.advanceTo(stoppedAt+10000,30000,{stopWhenIdle:true});assert.equal(sim.now,stoppedAt);
  assert.equal(challengeLabProgress(model,sim,sim.tablePath('client','server')).complete,true,'deadline uses recorded completion, not current clock');
});

test('TCP deadline accepts multiple useful window sizes',()=>{
  for(const rwnd of [4,8,16,32]) {
    const model=challengeLabModel('tcp-recovery');model.tcpFlows[0].rwnd=rwnd;
    assert.equal(run(model,60).progress.complete,true,`receive window ${rwnd}`);
  }
});

test('TCP deadline cannot be passed by changing loss, delay, bandwidth, MSS, or file size',()=>{
  for(const change of [{loss:0},{loss:1},{bw:100},{delay:1}]){
    const model=repair(challengeLabModel('tcp-recovery'));Object.assign(model.links[1],change);
    assert.equal(run(model,60).progress.complete,false);
  }
  for(const change of [{mss:4000},{bytes:1000},{start:10}]){
    const model=repair(challengeLabModel('tcp-recovery'));Object.assign(model.tcpFlows[0],change);
    assert.equal(run(model,60).progress.complete,false);
  }
});
