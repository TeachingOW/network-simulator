import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulator } from '../src/core/Simulator.js';
import { CHALLENGE_LABS, challengeLabModel, challengeLabProgress } from '../src/ui/ChallengeLabs.js';
import { CHALLENGE_SOLUTIONS, renderChallengeSolution } from '../src/ui/ChallengeSolutions.js';

for(const lab of CHALLENGE_LABS) {
  test(`${lab.id}: the published solution passes the real mission`,()=>{
    const model=challengeLabModel(lab.id),solution=CHALLENGE_SOLUTIONS[lab.id];
    assert.ok(solution.steps.length && solution.explanation && solution.expected);
    for(const edit of solution.edits||[])model.links.find(link=>link.id===edit.link)[edit.field]=edit.value;
    for(const edit of solution.tcpEdits||[])model.tcpFlows.find(flow=>flow.id===edit.id)[edit.field]=edit.value;
    if(solution.program)model.nodes.find(node=>node.id===solution.program.node).program={language:'packetlab-rules-v1',source:solution.program.source};
    const sim=new Simulator({model});sim.run({until:lab.id==='tcp-recovery'?30:3});
    const flow=model.flows[0]||model.tcpFlows[0];
    assert.equal(challengeLabProgress(model,sim,sim.tablePath(flow.src,flow.dst)).complete,true);
  });
}
test('solutions render collapsed, escaped, and without mutation controls',()=>{
  for(const lab of CHALLENGE_LABS) {
    const html=renderChallengeSolution(lab);
    assert.match(html,/<details class="challenge-solution"/);
    assert.doesNotMatch(html,/<details[^>]*\sopen(?:\s|>|=)/);
    assert.doesNotMatch(html,/<button/);
    assert.match(html,/Why it works/);
  }
  const html=renderChallengeSolution({id:'port-policy',title:'<script>"test"</script>'});
  assert.doesNotMatch(html,/<script>/);
  assert.match(html,/&lt;script&gt;/);
  assert.match(html,/drop &quot;blocked_port&quot;/);
});
