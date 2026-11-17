import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulator } from '../src/core/Simulator.js';
import { configurationChallengeModel, configurationChallengeProgress } from '../src/ui/ConfigurationChallenge.js';

test('configuration challenge starts broken and routes Lab A over the bottleneck',()=>{
  const model=configurationChallengeModel(),engine=new Simulator({model});
  const path=engine.tablePath('labA','server');
  assert.deepEqual(path.nodes,['labA','r1','r2','server']);
  assert.equal(configurationChallengeProgress(model,path,engine).repairedRoute,false);
});

test('challenge accepts a route repair without requiring one magic weight',()=>{
  const model=configurationChallengeModel();
  model.links.find(link=>link.id==='r1-r2').weight=100;
  const engine=new Simulator({model}),path=engine.tablePath('labA','server');
  const progress=configurationChallengeProgress(model,path,{generated:200,dropped:2});
  assert.deepEqual(path.nodes,['labA','r1','r3','server']);
  assert.equal(progress.preserved,true);
  assert.equal(progress.complete,true);
});

test('challenge cannot be passed by disabling the backup path',()=>{
  const model=configurationChallengeModel();
  model.links.find(link=>link.id==='r1-r2').enabled=false;
  const engine=new Simulator({model});
  const progress=configurationChallengeProgress(model,engine.tablePath('labA','server'),{generated:200,dropped:0});
  assert.equal(progress.repairedRoute,true);
  assert.equal(progress.preserved,false);
  assert.equal(progress.complete,false);
});
