import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOUR_STEPS, findTourLink, tourStepComplete } from '../src/ui/TourPlan.js';

function getState() {
  return {
    model: {
      routing:'delay',
      nodes:[{id:'h1',type:'host'},{id:'r1',type:'router'},{id:'r2',type:'router'},{id:'s2',type:'switch'},{id:'h2',type:'host'}],
      links:[
        {id:'upper',a:'r1',b:'s2',weight:16,bw:4,queue:25},
        {id:'lower',a:'r2',b:'s2',weight:56,bw:9,queue:40}
      ],
      flows:[{id:'f1',src:'h1',dst:'h2'}],
      tcpFlows:[]
    },
    selected:null,
    routeVersion:7,
    enteredRouteVersion:7,
    sim:{received:0,dropped:0,tcpConnections:new Map()}
  };
}
const step=id=>{
  const item=TOUR_STEPS.find(s=>s.id===id);
  assert.ok(item,`Missing step: ${id}`);
  return item;
};
test('guided lab contains unique, actionable learning steps',()=>{
  assert.equal(TOUR_STEPS.length,13);
  assert.equal(new Set(TOUR_STEPS.map(s=>s.id)).size,13);
  for(const s of TOUR_STEPS){
    assert.ok(s.title && s.instruction && s.task && s.target);
    assert.equal(typeof s.complete,'function');
  }
});
test('route weights use a real selected link, not a fixed test sentinel',()=>{
  const s=getState();
  assert.equal(findTourLink(s.model,'s2','r1')?.id,'upper');
  assert.equal(findTourLink(s.model,'r1','r2'),null);
  assert.equal(tourStepComplete(step('select-link'),s),false);
  s.selected={type:'link',id:'lower'};
  assert.equal(tourStepComplete(step('select-link'),s),false);
  s.selected={type:'link',id:'upper'};
  assert.equal(tourStepComplete(step('select-link'),s),true);
  assert.equal(tourStepComplete(step('set-weight'),s),false);
  s.model.routing='custom';s.model.links[0].weight=120;
  assert.equal(tourStepComplete(step('set-weight'),s),true);
});
test('students must inspect a router and set the custom metric',()=>{
  const s=getState();
  assert.equal(tourStepComplete(step('select-router'),s),false);
  s.selected={type:'node',id:'r1'};
  assert.equal(tourStepComplete(step('select-router'),s),true);
  assert.equal(tourStepComplete(step('custom-routing'),s),false);
  s.model.routing='custom';
  assert.equal(tourStepComplete(step('custom-routing'),s),true);
});
test('route highlighting step is gated on a new recomputation',()=>{
  const s=getState();
  assert.equal(tourStepComplete(step('recompute'),s),false);
  s.routeVersion++;
  assert.equal(tourStepComplete(step('recompute'),s),true);
});
test('datagram delivery and queue loss must happen in the simulator',()=>{
  const s=getState();
  assert.equal(tourStepComplete(step('datagrams'),s),false);
  s.sim.received=1;
  assert.equal(tourStepComplete(step('datagrams'),s),true);
  assert.equal(tourStepComplete(step('congestion'),s),false);
  s.model.links[1].bw=.8;s.model.links[1].queue=12;
  assert.equal(tourStepComplete(step('congestion'),s),true);
  assert.equal(tourStepComplete(step('drops'),s),false);
  s.sim.dropped=4;
  assert.equal(tourStepComplete(step('drops'),s),true);
});
test('TCP step requires TCP flow and subsequent cwnd change',()=>{
  const s=getState();
  assert.equal(tourStepComplete(step('tcp-preset'),s),false);
  s.model.tcpFlows=[{id:'tcp1',src:'h1',dst:'h2'}];
  assert.equal(tourStepComplete(step('tcp-preset'),s),true);
  assert.equal(tourStepComplete(step('cwnd'),s),false);
  s.sim.tcpConnections.set('tcp1',{cwndHistory:[{cwnd:1},{cwnd:2}]});
  assert.equal(tourStepComplete(step('cwnd'),s),true);
});
test('tour control targets exist in the page or topology editor',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const editor=readFileSync(new URL('../src/ui/TopologyEditor.js',import.meta.url),'utf8');
  for(const s of TOUR_STEPS){
    assert.match(s.target,/^#[a-z][\w-]*$/);
    const id=s.target.slice(1);
    assert.ok(html.includes(`id="${id}"`) || editor.includes(`id="${id}"`),
      `Missing target ${s.target} for step ${s.id}`);
  }
  for(const id of ['starttour','tour-panel','tour-title','tour-next','tour-back','tour-skip']){
    assert.ok(id==='starttour'?html.includes('id="starttour"') :
      readFileSync(new URL('../src/ui/GuidedTour.js',import.meta.url),'utf8').includes(id));
  }
});
