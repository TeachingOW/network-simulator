import { Simulator } from '../core/Simulator.js';
import { createTcpPanel, validateTcpFlows } from './TcpPanel.js';
import { createGuidedTour } from './GuidedTour.js';
import { compilePacketProgram } from '../programming/PacketRuleProgram.js';
import { PacketAnimator } from './PacketAnimation.js';
import { campusNetworkModel } from './ExampleNetworks.js';
import { CHALLENGE_LABS, challengeLabModel, challengeLabProgress } from './ChallengeLabs.js';
import { renderChallengeSolution } from './ChallengeSolutions.js';
import { renderLabLibrary } from './LabLibrary.js';
import { activateTab } from './Tabs.js';

'use strict';
const $=id=>document.getElementById(id);
const svgNS='http://www.w3.org/2000/svg';
function S(tag,attrs={},parent){const el=document.createElementNS(svgNS,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));if(parent)parent.appendChild(el);return el;}
const clone=x=>JSON.parse(JSON.stringify(x));
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const colors={host:'#25647e',router:'#167347',switch:'#6b5b89'};
let model,selected=null,tool='select',connecting=null,drag=null,playing=false,sim=null,lastClock=0,lastDraw=0;
const packetAnimator=new PacketAnimator();
let drainingAnimation=false;
let forwardingTables=new Map(),routeVersion=0,highlightUntil=0,highlightLinks=new Set();
let guidedTour=null,lastTourCheck=0;
function defaultLink(a,b,opt={}){return {id:'l'+Math.random().toString(36).slice(2,9),a,b,bw:opt.bw??20,delay:opt.delay??12,loss:opt.loss??0,queue:opt.queue??20,weight:opt.weight??((opt.delay??12)+1),enabled:true};}
function baseModel(type='campus'){
 if(type==='campus')return campusNetworkModel();
 if(type==='challenge') return challengeLabModel('slow-campus-network');
 if(CHALLENGE_LABS.some(lab=>lab.id===type))return challengeLabModel(type);
 if(type==='tcp'){
   const result=baseModel('diamond');
   result.flows=[];
   result.tcpFlows=[{id:'tcp1',src:'h1',dst:'h2',srcPort:49152,dstPort:80,bytes:24000,mss:1000,rwnd:32,start:0,rto:400,ssthresh:16}];
   return result;
 }
 if(type==='star'){
  const nodes=[{id:'h1',type:'host',name:'Client A',x:120,y:135},{id:'h2',type:'host',name:'Server',x:780,y:135},{id:'h3',type:'host',name:'Client B',x:130,y:375},{id:'s1',type:'switch',name:'S1',x:370,y:240},{id:'r1',type:'router',name:'R1',x:635,y:240}];
  return {version:1,nodes,links:[defaultLink('h1','s1'),defaultLink('h3','s1'),defaultLink('s1','r1',{bw:5,delay:28}),defaultLink('r1','h2')],flows:[{id:'f1',src:'h1',dst:'h2',srcPort:49152,dstPort:8080,pps:160,bytes:1000,start:0,duration:15},{id:'f2',src:'h3',dst:'h2',srcPort:49153,dstPort:8080,pps:120,bytes:1000,start:0,duration:15}],routing:'delay'};
 }
 const nodes=[{id:'h1',type:'host',name:'Client A',x:85,y:125},{id:'h3',type:'host',name:'Client C',x:85,y:365},{id:'s1',type:'switch',name:'S1',x:285,y:240},{id:'r1',type:'router',name:'R1',x:500,y:120},{id:'r2',type:'router',name:'R2',x:500,y:365},{id:'s2',type:'switch',name:'S2',x:735,y:240},{id:'h2',type:'host',name:'Server B',x:905,y:240}];
 return {version:1,nodes,links:[defaultLink('h1','s1'),defaultLink('h3','s1'),defaultLink('s1','r1',{delay:10}),defaultLink('s1','r2',{delay:25}),defaultLink('r1','s2',{bw:4,delay:15,queue:25}),defaultLink('r2','s2',{bw:9,delay:55,queue:40}),defaultLink('s2','h2')],flows:[{id:'f1',src:'h1',dst:'h2',srcPort:49152,dstPort:8080,pps:170,bytes:1100,start:0,duration:15},{id:'f2',src:'h3',dst:'h2',srcPort:49153,dstPort:8080,pps:120,bytes:1100,start:0,duration:15}],routing:'delay'};
}
function node(id){return model.nodes.find(x=>x.id===id);}
function link(id){return model.links.find(x=>x.id===id);}
function uniqueId(prefix,items){let i=1;while(items.some(x=>x.id===prefix+i))i++;return prefix+i;}
function updateCounters(){$('nodetotal').textContent=model.nodes.length;$('linktotal').textContent=model.links.length;}
// UI adapter: tables and paths are supplied by the same Simulator used by scripts.
let routingEngine = null;
function weight(l){return routingEngine?.network.weight(l,model.routing)??(model.routing==='hops'?1:model.routing==='custom'?l.weight:l.delay+1);}
function tablePath(src,dst){return routingEngine?.tablePath(src,dst)??null;}
function updatePath(){
 const f=model?.flows?.[0]||model?.tcpFlows?.[0];
 const path=f?tablePath(f.src,f.dst):null;
 const output=$('path');
 if(output)output.textContent=!f?'No traffic flow configured':path
   ?'Flow 1: '+path.nodes.map(id=>node(id)?.name||id).join(' → ')
   :'Flow 1: NO ROUTE';
}
let lastChallengeMarkup='';
function renderChallenge(){
 const root=$('challenge-card');if(!root)return;
 const first=model.flows?.[0]||model.tcpFlows?.[0],path=first?tablePath(first.src,first.dst):null;
 const progress=challengeLabProgress(model,sim,path);
 root.hidden=!progress;if(!progress)return;
 const {lab,checks,complete}=progress;
 if(root.dataset.lab!==lab.id){
  root.dataset.lab=lab.id;
  root.innerHTML=`<div data-challenge-progress></div>${renderChallengeSolution(lab)}`;
  lastChallengeMarkup='';
 }
 const guidance=lab.id==='tcp-recovery'?'Compare the completed transfer time with the 6-second deadline. Change Receive window (MSS) in Traffic, then run again; the path loss stays fixed.':'Configuration edits reset the experiment. Run again to test your repair. Progress is kept for the current experiment only.';
 const markup=`<div class="panehead"><h2>Challenge: ${lab.title}</h2><span class="tag">${complete?'SOLVED':'IN PROGRESS'}</span></div><div class="challenge-copy"><p>${lab.task}</p><ul>${checks.map(check=>`<li class="${check.done?'good':''}">${check.done?'✓':'○'} ${check.text}</li>`).join('')}</ul>${complete?'<div class="challenge-success">Challenge complete — your experiment meets every objective.</div>':`<div class="small">${guidance}</div>`}</div>`;
 // Avoid repeatedly announcing unchanged objectives while the simulation runs.
 if(markup!==lastChallengeMarkup){root.querySelector('[data-challenge-progress]').innerHTML=markup;lastChallengeMarkup=markup;}
}
function recomputeRouting(reason='Manual recomputation'){
  routingEngine=new Simulator({model});
  forwardingTables=routingEngine.forwardingTables;
  routeVersion++;
  const first=model.flows[0]||model.tcpFlows?.[0], path=first?tablePath(first.src,first.dst):null;
  highlightLinks=new Set(path?.links||[]);
  highlightUntil=performance.now()+1900;
  $('routeStatus').textContent=`Recomputed #${routeVersion} · ${reason} · ${model.algorithm==='bellman'?'Bellman–Ford':'Dijkstra'}`;
  setTimeout(()=>{if(performance.now()>=highlightUntil)render();},2000);
}
function normalizeProgram(p,availableNodes=model.nodes){p=p&&typeof p==='object'&&!Array.isArray(p)?p:{};
 if(p.language==='packetlab-rules-v1'){
  const source=String(p.source??'');const compiled=compilePacketProgram(source),hosts=new Set(availableNodes.filter(n=>n.type==='host').map(n=>n.id));
  for(const block of compiled)for(const action of block.actions)if(action.type==='inject'&&!hosts.has(action.destination))throw Error('inject destination must name a host ID');
  return {language:'packetlab-rules-v1',source};
 }
 const count=k=>{let v=Number(p[k]??0);if(!Number.isInteger(v)||v<0||v>100000)throw Error(`${k} must be an integer 0–100000`);return v;};
 const bytes=Number(p.injectBytes??256);if(!Number.isInteger(bytes)||bytes<64||bytes>9000)throw Error('injectBytes must be 64–9000');
 const injectDst=String(p.injectDst||'');if(injectDst&&!availableNodes.some(n=>n.type==='host'&&n.id===injectDst))throw Error('injectDst must name a host ID');
 return {flowId:String(p.flowId??''),dropEvery:count('dropEvery'),injectEvery:count('injectEvery'),injectDst,injectBytes:bytes};
}
function renderForwardTable(n){const el=$('forwardtable');if(!el)return;const rows=[...(forwardingTables.get(n.id)?.entries()||[])];
 el.innerHTML=rows.length?`<table><thead><tr><th>Destination</th><th>Next hop</th><th>Link</th><th>Cost</th></tr></thead><tbody>${rows.map(([dst,e])=>`<tr><td>${esc(node(dst)?.name||dst)}</td><td>${esc(node(e.next)?.name||e.next)}</td><td>${esc(e.link)}</td><td>${e.cost.toFixed(1)}</td></tr>`).join('')}</tbody></table>`:'<div class="summary">No reachable destination hosts.</div>';
 const stack=routingEngine?.ipv4;
 if(n.type==='switch'){
   el.innerHTML+='<div class="small" style="padding:8px">Logical Layer-2 relay only. ARP and MAC learning are not simulated.</div>';
   return;
 }
 const interfaces=stack?.interfacesFor(n.id)||[];
 const routes=stack?.table(n.id)?.entries||[];
 const ifaceText=interfaces.length
   ?'<table><thead><tr><th>Port</th><th>IPv4 address</th><th>Network</th></tr></thead><tbody>'+
     interfaces.map(i=>`<tr><td>${esc(i.linkId)}</td><td>${esc(i.address)}</td><td>${esc(i.prefix)}</td></tr>`).join('')+'</tbody></table>'
   :'<div class="summary">No link interfaces</div>';
 const routeText=routes.length
   ?'<table><thead><tr><th>IPv4 prefix</th><th>Next hop IP</th><th>Output link</th><th>Metric</th></tr></thead><tbody>'+
     routes.map(e=>`<tr><td>${esc(e.prefix)}</td><td>${esc(e.nextHop||'direct')}</td><td>${esc(e.outInterface||'-')}</td><td>${e.metric.toFixed(1)}</td></tr>`).join('')+'</tbody></table>'
   :'<div class="summary">No IPv4 routes</div>';
 el.innerHTML+=`<div class="blocktitle" style="margin:12px 0 5px">IPv4 interfaces (auto-assigned)</div>${ifaceText}<div class="blocktitle" style="margin:12px 0 5px">IPv4 routing table (longest-prefix match)</div>${routeText}`;

}
function updateNodeStats(){if(selected?.type!=='node'||!sim||!$('nodestats'))return;const c=sim.nodeCounts.get(selected.id)||{seen:0,drop:0,inject:0};$('nodestats').textContent=`Packets inspected: ${c.seen} · Rule drops: ${c.drop} · Injected: ${c.inject}`;}
function drawTopology(){const edges=$('edges'),nodes=$('nodes'),pkt=$('pktlayer');edges.replaceChildren();nodes.replaceChildren();pkt.replaceChildren();
 $('network').closest('.pane').classList.toggle('large-topology',Boolean(model?.canvas));
 const {width,height}=canvasBounds();$('network').setAttribute('viewBox',`0 0 ${width} ${height}`);
 $('network').querySelector(':scope > rect').setAttribute('width',width);$('network').querySelector(':scope > rect').setAttribute('height',height);
 const flash=performance.now()<highlightUntil;
 for(const l of model.links){const a=node(l.a),b=node(l.b);if(!a||!b)continue;const active=flash&&highlightLinks.has(l.id)&&l.enabled;
  const group=S('g',{},edges);S('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'transparent','stroke-width':22,'data-link':l.id,class:'hit'},group);
  S('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:l.enabled?(active?'#16834b':'#90ad9b'):'#b33d48','stroke-width':active?4:3,'stroke-dasharray':l.enabled?'':'8 7',opacity:selected?.type==='link'&&selected.id===l.id?1:.86,'pointer-events':'none'},group);
  const midx=(a.x+b.x)/2+(l.labelX||0),midy=(a.y+b.y)/2,offset=(Math.abs(a.y-b.y)<30?-16:-13);
  const label=l.enabled?`${l.bw} Mb/s · ${l.delay} ms${!model.canvas||model.routing==='custom'?' · cost '+weight(l).toFixed(1):''}`:'LINK DOWN';const title=S('title',{},group);title.textContent=`${a.name} ↔ ${b.name}: ${l.bw} Mb/s, ${l.delay} ms, route cost ${weight(l).toFixed(1)}`;const w=Math.min(230,label.length*6.5+13);S('rect',{x:midx-w/2,y:midy+offset-10,width:w,height:19,rx:6,fill:'#ffffff',stroke:selected?.type==='link'&&selected.id===l.id?'#16834b':'#d1e2d6','stroke-width':1,'pointer-events':'none'},group);
  const t=S('text',{x:midx,y:midy+offset+3,'font-size':11,'font-family':'system-ui',fill:l.enabled?'#3f614d':'#b33d48','text-anchor':'middle','pointer-events':'none'},group);t.textContent=label;
  group.addEventListener('pointerdown',e=>{if(tool==='select'){selected={type:'link',id:l.id};activateTab('inspect-panel');renderInspector();drawTopology();e.stopPropagation();}});
 }
 for(const n of model.nodes){const g=S('g',{'data-node':n.id,style:'cursor:'+(tool==='select'?'grab':'crosshair')},nodes);const isSelected=selected?.type==='node'&&selected.id===n.id;
  S('circle',{cx:n.x,cy:n.y,r:31,fill:'#f2f8f3',stroke:isSelected?'#a27413':'#aac8b5','stroke-width':isSelected?4:1.5},g);
  if(n.type==='host'){S('rect',{x:n.x-16,y:n.y-14,width:32,height:24,rx:3,fill:'#e8f0f4',stroke:colors.host,'stroke-width':2},g);S('path',{d:`M${n.x-18} ${n.y+14} h36 M${n.x} ${n.y+10}v4`,stroke:colors.host,'stroke-width':2},g);}
  else if(n.type==='router'){S('circle',{cx:n.x,cy:n.y,r:17,fill:'#e0f2e7',stroke:colors.router,'stroke-width':2},g);const txt=S('text',{x:n.x,y:n.y+5,'text-anchor':'middle',fill:'#167347','font-weight':800,'font-size':17},g);txt.textContent='↗';}
  else{S('rect',{x:n.x-18,y:n.y-13,width:36,height:26,rx:5,fill:'#eeeaf4',stroke:colors.switch,'stroke-width':2},g);const txt=S('text',{x:n.x,y:n.y+5,'text-anchor':'middle',fill:'#6b5b89','font-weight':800,'font-size':16},g);txt.textContent='⇄';}
  if(connecting===n.id){S('circle',{cx:n.x,cy:n.y,r:37,stroke:'#a27413','stroke-width':2,'stroke-dasharray':'5 4',fill:'none'},g);}
  const label=S('text',{x:n.x,y:n.y+48,'font-size':13,'text-anchor':'middle',fill:'#19382a','font-family':'system-ui','font-weight':650},g);label.textContent=n.name;
  const ty=S('text',{x:n.x,y:n.y+62,'font-size':10,'text-anchor':'middle',fill:'#52695c','font-family':'system-ui'},g);ty.textContent=n.type.toUpperCase();
  g.addEventListener('pointerdown',e=>{e.stopPropagation();if(tool==='connect'){if(!connecting){connecting=n.id;toast('Select another node to connect');}else if(connecting!==n.id){if(!model.links.some(l=>(l.a===connecting&&l.b===n.id)||(l.b===connecting&&l.a===n.id))){const l=defaultLink(connecting,n.id);model.links.push(l);selected={type:'link',id:l.id};dirty();}connecting=null;}else connecting=null;drawTopology();return;}
   if(['host','router','switch'].includes(tool)){return;}
   activateTab('inspect-panel');selected={type:'node',id:n.id};drag={id:n.id,moved:false,pointer:e.pointerId};try{$('network').setPointerCapture(e.pointerId);}catch{}renderInspector();drawTopology();});

 }
 for(const {flight:f,state} of packetAnimator.sample()){
  const a=node(f.a),b=node(f.b);if(!a||!b||!state)continue;
  const {raw,progress:t}=state,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t,color=f.lost?'#b33d48':f.protocol===6?'#996d14':'#25647e',dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,tail=8;
  S('line',{x1:x-dx/len*tail,y1:y-dy/len*tail,x2:x,y2:y,stroke:color,'stroke-width':2.5,'stroke-linecap':'round',opacity:.35+.6*(1-raw)},pkt);
  S('circle',{cx:x,cy:y,r:f.protocol===6?4:3.2,fill:color,stroke:'#ffffff','stroke-width':1,opacity:.96,'data-packet':f.packet},pkt);
 }
 for(const d of packetAnimator.sampleDrops()){
  const l=link(d.location),n=node(d.location);let x,y;
  if(l){const a=node(l.a),b=node(l.b);if(!a||!b)continue;x=(a.x+b.x)/2;y=(a.y+b.y)/2;}else if(n){x=n.x;y=n.y;}else continue;
  const fade=1-d.age/450,r=7+d.age/45;
  S('circle',{cx:x,cy:y,r,fill:'none',stroke:'#b33d48','stroke-width':2,opacity:fade},pkt);
  const mark=S('text',{x,y:y+5,'text-anchor':'middle',fill:'#b33d48','font-size':16,'font-weight':900,opacity:fade},pkt);mark.textContent='×';
 }
 updateCounters();updatePath();}
function canvasBounds(){return model?.canvas||{width:980,height:500};}
function clientToSvg(ev){const point=$('network').createSVGPoint();point.x=ev.clientX;point.y=ev.clientY;return point.matrixTransform($('network').getScreenCTM().inverse());}
$('network').addEventListener('pointermove',e=>{if(!drag||drag.pointer!==e.pointerId)return;const n=node(drag.id);if(!n)return;const p=clientToSvg(e);n.x=clamp(p.x,40,canvasBounds().width-40);n.y=clamp(p.y,45,canvasBounds().height-62);drag.moved=true;drawTopology();});
$('network').addEventListener('pointerup',()=>drag=null);$('network').addEventListener('pointercancel',()=>drag=null);
$('network').addEventListener('pointerdown',e=>{if(e.target.closest('[data-node]')||e.target.closest('[data-link]'))return;const p=clientToSvg(e);if(['host','router','switch'].includes(tool)){const names={host:'H',router:'R',switch:'S'};const id=uniqueId(names[tool].toLowerCase(),model.nodes);model.nodes.push({id,type:tool,name:id.toUpperCase(),x:clamp(p.x,42,canvasBounds().width-42),y:clamp(p.y,42,canvasBounds().height-62)});selected={type:'node',id};setTool('select');dirty();}else if(tool==='select'){selected=null;renderInspector();drawTopology();}else if(tool==='connect'){connecting=null;drawTopology();}});
function setTool(next){tool=next;connecting=null;document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===tool));$('canvashelp').innerHTML=next==='connect'?'<b>Connect:</b> click the first node, then the second node. Press Esc to cancel.':['host','router','switch'].includes(next)?'<b>Add '+next+':</b> click an empty part of the canvas.':'<b>Select / drag</b> nodes; click a link to edit. Use <b>Connect</b> then choose two nodes.';drawTopology();}
function renderInspector(){const t=selected&&((selected.type==='node'&&node(selected.id))||(selected.type==='link'&&link(selected.id)));$('selectedtag').textContent=t?(selected.type+' · '+t.id).toUpperCase():'NONE';const root=$('inspector');root.replaceChildren();if(!t){root.innerHTML='<div class="summary">Select a node or link in the network to edit its properties.</div>';return;}
 if(selected.type==='node'){
  const device=t.type!=='host';
  root.innerHTML=`<div class="field"><label for="nodeName">Node name</label><input id="nodeName" value="${esc(t.name)}" maxlength="28"></div><div class="field"><label>Device type</label><div class="tag">${t.type.toUpperCase()}</div></div>
   <div class="blocktitle">Forwarding table (logical datagram destinations)</div><div class="fwdtable" id="forwardtable"></div>
   ${device?`<div class="blocktitle">Sandboxed packet program</div><div class="small">Allowed fields: flowId, addresses, ports, protocol, ttl, bytes, injected. Allowed actions: set ttl, forward, drop, inject. This parser never executes JavaScript.</div><textarea class="rulebox" id="programCode" aria-label="Sandboxed packet program" spellcheck="false"></textarea><div id="programStatus" class="summary" role="status"></div><div class="inspector-actions"><button class="btn" id="applyProgram">Compile & apply</button><button class="btn" id="exampleProgram">Apply 8080-only example</button><button class="btn" id="clearProgram">Remove policy</button></div><div class="small">The example forwards port 8080 and drops other ports, including 8070. Apply it on a router or switch along the flow’s route.</div><div id="nodestats" class="summary"></div>`:'<div class="summary">Hosts send/receive datagrams but cannot forward transit traffic.</div>'}
   <div class="inspector-actions"><button id="deleteSelected" class="btn danger">Delete node</button></div>`;
  $('nodeName').addEventListener('change',e=>{t.name=e.target.value.trim()||t.id;drawTopology();renderForwardTable(t);});
  $('deleteSelected').addEventListener('click',()=>{model.nodes=model.nodes.filter(n=>n.id!==t.id);model.links=model.links.filter(l=>l.a!==t.id&&l.b!==t.id);model.flows=model.flows.filter(f=>f.src!==t.id&&f.dst!==t.id);model.tcpFlows=(model.tcpFlows||[]).filter(f=>f.src!==t.id&&f.dst!==t.id);selected=null;dirty('Node deleted');});
  renderForwardTable(t);
  if(device){
   const defaultSource='when dstPort == 8080:\n  forward\notherwise:\n  drop "blocked_port"';
   const appliedSource=()=>t.program?.language==='packetlab-rules-v1'?t.program.source:t.program?JSON.stringify(t.program,null,2):'';
   $('programCode').value=appliedSource();
   $('programCode').placeholder='No policy applied. Write a packet program or apply the 8080-only example.';
   const updateProgramStatus=(error='')=>{
    const draft=$('programCode').value.trim()!==appliedSource().trim();
    $('programStatus').textContent=error || (draft?'Unapplied edits. Compile & apply to change packet handling.':t.program?'Policy active on '+t.name+'.':'No policy applied on '+t.name+'. Packets are forwarded normally.');
    $('programStatus').classList.toggle('bad',Boolean(error));
    $('programStatus').classList.toggle('good',!error&&!draft&&Boolean(t.program));
   };
   const applyProgram=()=>{try{
    const source=$('programCode').value.trim();
    const program=source.startsWith('{')?normalizeProgram(JSON.parse(source)):normalizeProgram({language:'packetlab-rules-v1',source});
    t.program=program;dirty('Packet program changed',false);toast('Program compiled and applied on '+t.name);
   }catch(e){updateProgramStatus('Program error: '+e.message+'. Previous policy remains active.');}};
   $('programCode').addEventListener('input',()=>updateProgramStatus());
   $('applyProgram').addEventListener('click',applyProgram);
   $('exampleProgram').addEventListener('click',()=>{$('programCode').value=defaultSource;applyProgram();});
   $('clearProgram').addEventListener('click',()=>{delete t.program;dirty('Packet policy removed',false);toast('Policy removed from '+t.name);});
   updateProgramStatus();
   updateNodeStats();
  }
  return;
 }
 const a=node(t.a),b=node(t.b);root.innerHTML=`<div class="summary"><b>${esc(a?.name||t.a)} ⇄ ${esc(b?.name||t.b)}</b><div class="small">Bidirectional store-and-forward link</div></div><div class="twocol"><div class="field"><label for="l-bw">Bandwidth (Mbps)</label><input id="l-bw" type="number" min="0.01" max="100000" step="0.5" value="${t.bw}"></div><div class="field"><label for="l-delay">Propagation delay (ms)</label><input id="l-delay" type="number" min="0" max="10000" step="1" value="${t.delay}"></div><div class="field"><label for="l-weight">Custom routing weight</label><input id="l-weight" type="number" min="0.01" max="100000" step="0.5" value="${t.weight??(t.delay+1)}"></div><div class="field"><label for="l-loss">Random loss (%)</label><input id="l-loss" type="number" min="0" max="100" step="0.5" value="${t.loss}"></div><div class="field"><label for="l-queue">Queue (packets/direction)</label><input id="l-queue" type="number" min="1" max="20000" step="1" value="${t.queue}"></div></div><div class="fieldrow"><input id="l-enabled" type="checkbox" ${t.enabled?'checked':''}><label for="l-enabled">Link enabled</label></div><div id="linkstats" class="summary">Queue 0 / 0 · Link drops 0</div><div class="inspector-actions"><button id="deletelink" class="btn danger">Delete link</button></div>`;
 for(const [el,key,min,max] of [['l-bw','bw',0.01,100000],['l-delay','delay',0,10000],['l-weight','weight',0.01,100000],['l-loss','loss',0,100],['l-queue','queue',1,20000]])$(el).addEventListener('change',e=>{let v=Number(e.target.value);if(!Number.isFinite(v))v=t[key];t[key]=key==='queue'?Math.round(clamp(v,min,max)):clamp(v,min,max);refreshConfig('Link '+key+' changed',(key==='delay'&&model.routing==='delay')||(key==='weight'&&model.routing==='custom'));});
 $('l-enabled').addEventListener('change',e=>{t.enabled=e.target.checked;refreshConfig('Link state changed',true);});$('deletelink').addEventListener('click',()=>{model.links=model.links.filter(l=>l.id!==t.id);selected=null;dirty();});updateLinkStats();}
function flowHTML(f,i){const hosts=model.nodes.filter(n=>n.type==='host');const select=(key)=>hosts.map(h=>`<option value="${esc(h.id)}" ${f[key]===h.id?'selected':''}>${esc(h.name)}</option>`).join('');return `<div class="flowcard" data-flow="${esc(f.id)}"><div class="flowtop"><b>Flow ${i+1} <span class="tag">UDP-like datagrams</span></b><button class="close" data-remove="${esc(f.id)}" title="Remove this flow">✕</button></div><div class="flowfields"><label>Source<select data-key="src">${select('src')}</select></label><label>Destination<select data-key="dst">${select('dst')}</select></label><label>Source port<input data-key="srcPort" type="number" min="1" max="65535" value="${f.srcPort??49152}"></label><label>Destination port<input data-key="dstPort" type="number" min="1" max="65535" value="${f.dstPort??8080}"></label><label>Packet rate (packets/s)<input data-key="pps" type="number" min="1" max="5000" value="${f.pps}"></label><label>Payload size (bytes)<input data-key="bytes" type="number" min="64" max="9000" value="${f.bytes}"></label><label>Start time (s)<input data-key="start" type="number" min="0" max="1000" step="0.1" value="${f.start}"></label><label>Duration (s)<input data-key="duration" type="number" min="0.1" max="1000" step="0.1" value="${f.duration}"></label></div></div>`;}
function renderFlows(){const el=$('flowlist');el.innerHTML=model.flows.map(flowHTML).join('')||'<div class="summary">No traffic flows. Add at least two hosts and select Add flow.</div>';el.querySelectorAll('[data-flow]').forEach(card=>{const f=model.flows.find(x=>x.id===card.dataset.flow);card.querySelectorAll('[data-key]').forEach(input=>input.addEventListener('change',e=>{const k=e.target.dataset.key;const limits={srcPort:[1,65535],dstPort:[1,65535],pps:[1,5000],bytes:[64,9000],start:[0,1000],duration:[.1,1000]};if(k==='src'||k==='dst')f[k]=e.target.value;else f[k]=(k==='start'||k==='duration'?clamp(+e.target.value||limits[k][0],...limits[k]):Math.round(clamp(+e.target.value||limits[k][0],...limits[k])));refreshConfig('Traffic settings changed',false);}));card.querySelector('[data-remove]').addEventListener('click',()=>{model.flows=model.flows.filter(x=>x.id!==f.id);dirty('Traffic flow removed',false);});});}
function toast(msg){document.querySelector('.toast')?.remove();const el=document.createElement('div');el.className='toast';el.textContent=msg;document.body.appendChild(el);setTimeout(()=>el.remove(),2200);}
// Simulation events, queues, forwarding and programmable actions all run in core/Simulator.
function makeEngine(){return new Simulator({model});}
function advance(target){
  if(!sim)return;
  sim.advanceTo(target,30000,{stopWhenIdle:true});
  packetAnimator.observe(sim.flight,sim.dropBursts,+$('speed').value||1);
  if(!sim.heap.length){playing=false;drainingAnimation=packetAnimator.pending;}
  if(sim.limitReached){
    playing=false;
    toast('Simulation processing limit reached; reduce packet rate.');
  }
}
function renderMetrics(){if(!sim)return;$('clock').textContent=(sim.now/1000).toFixed(2)+' s';$('eventtotal').textContent=sim.processed.toLocaleString();$('sent').textContent=sim.sent.toLocaleString();$('received').textContent=sim.received.toLocaleString();$('dropped').textContent=sim.dropped.toLocaleString();const done=sim.received+sim.dropped;$('delivery').textContent=done?(100*sim.received/done).toFixed(1)+'%':'—';$('avgdelay').textContent=sim.received?(sim.delaySum/sim.received).toFixed(1)+' ms':'—';$('pending').textContent=sim.heap.length.toLocaleString();const tbody=$('tracerows');const rows=sim.trace.slice(-24).reverse();tbody.innerHTML=rows.length?rows.map(r=>`<tr><td>${r.time.toFixed(3)}s</td><td>#${esc(r.packet)}</td><td>${esc(r.flow)}${r.ports?`<br><span class="tiny">${esc(r.ports)}</span>`:''}</td><td>${esc(r.loc)}</td><td class="${r.action==='DROP'?'bad':r.action==='DELIVER'?'good':'info'}">${esc(r.action)}</td><td>${esc(r.detail)}</td></tr>`).join(''):'<tr><td colspan="6" class="muted">No packet events yet.</td></tr>';updateLinkStats();updateNodeStats();tcpPanel.renderStatus();}
function updateLinkStats(){if(!sim||selected?.type!=='link')return;const l=link(selected.id);if(!l||!$('linkstats'))return;const a=sim.queues.get(l.id+'|'+l.a),b=sim.queues.get(l.id+'|'+l.b);if(!a||!b)return;$('linkstats').textContent=`Queues A→B: ${a.waiting.length}/${l.queue}, B→A: ${b.waiting.length}/${l.queue} · Link drops: ${a.drop+b.drop} · Packet transmissions: ${a.tx+b.tx}`;}
function render(){drawTopology();renderMetrics();renderChallenge();const complete=sim&&!sim.heap.length;$('status').textContent=playing?'● Running':complete?'✓ Complete':'Ⅱ Paused';$('status').classList.toggle('playing',playing);$('play').textContent=playing?'Ⅱ Pause':complete?'↻ Run again':'▶ Run';}
function reset(run=false){packetAnimator.reset();drainingAnimation=false;playing=run;sim=makeEngine();lastClock=performance.now();render();}
function refreshConfig(reason='Configuration changed',changeRoutes=false){if(changeRoutes)recomputeRouting(reason);reset(false);if(selected?.type==='node')renderForwardTable(node(selected.id));}
function dirty(reason="Topology changed",changeRoutes=true){if(changeRoutes)recomputeRouting(reason);reset(false);renderInspector();renderFlows();tcpPanel.renderFlows();render();}
function seed(type){activateTab('workspace-panel');model=baseModel(type);model.algorithm='dijkstra';model.tcpFlows=model.tcpFlows||[];selected=null;setTool('select');$('routing').value=model.routing;$('algorithm').value=model.algorithm;recomputeRouting('Example topology loaded');reset(false);renderInspector();renderFlows();tcpPanel.renderFlows();}
function exportText(name,text,contentType){const url=URL.createObjectURL(new Blob([text],{type:contentType}));const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function csv(){const escCsv=x=>'"'+String(x??'').replaceAll('"','""')+'"';const columns=['time','packet','flow','ports','loc','action','detail'];const out=[columns.join(','),...sim.trace.map(r=>columns.map(k=>escCsv(r[k])).join(','))].join('\r\n');exportText('packetlab-trace.csv',out+'\r\n','text/csv;charset=utf-8');}
function validate(obj){if(!obj||!Array.isArray(obj.nodes)||!Array.isArray(obj.links)||!Array.isArray(obj.flows))throw Error('Missing nodes, links, or flows');if(obj.nodes.length>120||obj.links.length>300||obj.flows.length>60)throw Error('Network exceeds classroom size limits');if(obj.canvas){obj.canvas={width:clamp(Number(obj.canvas.width)||980,980,2400),height:clamp(Number(obj.canvas.height)||500,500,1400)};}const ids=new Set();for(const n of obj.nodes){if(typeof n.id!=='string'||!['host','router','switch'].includes(n.type)||ids.has(n.id)||n.id.length>50)throw Error('Invalid node');ids.add(n.id);n.name=String(n.name||n.id).slice(0,28);n.x=clamp(Number(n.x)||100,40,(obj.canvas?.width||980)-40);n.y=clamp(Number(n.y)||100,40,(obj.canvas?.height||500)-62);}for(const l of obj.links){if(!ids.has(l.a)||!ids.has(l.b)||l.a===l.b)throw Error('Link refers to nonexistent node');l.id=String(l.id||('l'+Math.random())).slice(0,60);l.bw=clamp(Number(l.bw)||1,.01,100000);l.delay=clamp(Number(l.delay)||0,0,10000);l.weight=clamp(Number(l.weight)>0?Number(l.weight):l.delay+1,0.01,100000);l.loss=clamp(Number(l.loss)||0,0,100);l.queue=Math.round(clamp(Number(l.queue)||20,1,20000));l.enabled=l.enabled!==false;}for(const f of obj.flows){if(!ids.has(f.src)||!ids.has(f.dst))throw Error('Flow refers to nonexistent node');f.id=String(f.id||'f'+Math.random()).slice(0,60);f.pps=clamp(Number(f.pps)||10,1,5000);f.bytes=clamp(Number(f.bytes)||1200,64,9000);f.start=clamp(Number(f.start)||0,0,1000);f.duration=clamp(Number(f.duration)||1,.1,1000);f.srcPort=Math.round(clamp(Number(f.srcPort)||49152,1,65535));f.dstPort=Math.round(clamp(Number(f.dstPort)||8080,1,65535));}validateTcpFlows(obj);obj.routing=['hops','delay','custom'].includes(obj.routing)?obj.routing:'delay';obj.algorithm=obj.algorithm==='bellman'?'bellman':'dijkstra';for(const n of obj.nodes)if(n.program)n.program=normalizeProgram(n.program,obj.nodes);return obj;}
function addFlow(){const hosts=model.nodes.filter(n=>n.type==='host');if(hosts.length<2){toast('Add two host nodes before creating traffic.');return;}model.flows.push({id:uniqueId('f',model.flows),src:hosts[0].id,dst:hosts.at(-1).id,srcPort:49152,dstPort:8080,pps:70,bytes:1000,start:0,duration:15});dirty('Traffic flow added',false);}
function injectCongestion(){const candidate=selected?.type==='link'?link(selected.id):model.links.find(l=>l.a==='r1'&&l.b==='s2')||model.links[Math.floor(model.links.length/2)];if(!candidate)return;candidate.bw=0.8;candidate.queue=12;candidate.enabled=true;selected={type:'link',id:candidate.id};dirty('Bandwidth/queue changed',false);toast('Congestion: '+candidate.id+' throttled to 0.8 Mbps');}
function failLink(){if(selected?.type!=='link'){toast('Select a link first, then choose Fail selected link.');return;}const l=link(selected.id);l.enabled=!l.enabled;dirty();toast(l.enabled?'Link restored':'Link disabled — routing will recompute');}
function raf(t){
 const dt=clamp(t-lastClock,0,100);lastClock=t;
 if(playing||drainingAnimation){
  packetAnimator.tick(dt);
  if(playing)advance(sim.now+dt*(+$('speed').value||1));
  drainingAnimation=drainingAnimation&&packetAnimator.pending;
  if(t-lastDraw>30||!playing){render();lastDraw=t;}
 }
 if(guidedTour?.isActive()&&t-lastTourCheck>250){guidedTour.refresh();lastTourCheck=t;}
 requestAnimationFrame(raf);
}
const tcpPanel=createTcpPanel({getModel:()=>model,getSim:()=>sim,onChange:()=>dirty('TCP transfer changed',false),toast});
guidedTour=createGuidedTour({
  button:$('starttour'),
  getState:()=>({model,selected,sim,routeVersion}),
  beginPractice:()=>{
    const saved=clone(model);
    seed('diamond');
    return saved;
  },
  restorePrevious:saved=>{
    model=clone(saved);
    model.tcpFlows=model.tcpFlows||[];
    selected=null;
    setTool('select');
    $('routing').value=model.routing;
    $('algorithm').value=model.algorithm;
    recomputeRouting('Previous experiment restored');
    reset(false);
    renderInspector();
    renderFlows();
    tcpPanel.renderFlows();
  },
  pause:()=>{if(playing){playing=false;render();}},
  focusLink:(a,b)=>{
    const l=model.links.find(l=>(l.a===a&&l.b===b)||(l.a===b&&l.b===a));
    if(!l)return;
    selected={type:'link',id:l.id};
    setTool('select');
    renderInspector();
    drawTopology();
  },
  announce:toast
});
document.querySelector('.trace th:nth-child(3)').textContent='Flow / ports';
document.querySelector('.legend').innerHTML='<span>Host</span><span>Router / switch</span><span>TCP packet</span><span>Drop pulse</span><span style="--dot:#25647e">UDP packet</span>';
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.mode)));
$('play').addEventListener('click',()=>{if(!sim.heap.length){reset(true);}else{playing=!playing;drainingAnimation=false;}lastClock=performance.now();render();});
$('step').addEventListener('click',()=>{playing=false;drainingAnimation=false;packetAnimator.tick(100/(+$('speed').value||1));advance(sim.now+100);render();});
$('reset').addEventListener('click',()=>reset(false));
$('presetcampus').addEventListener('click',()=>seed('campus'));
$('presetdiamond').addEventListener('click',()=>seed('diamond'));
$('presetstar').addEventListener('click',()=>seed('star'));
$('presettcp').addEventListener('click',()=>{seed('tcp');activateTab('tcp-results');});
$('presetchallenge').addEventListener('click',()=>seed('challenge'));
$('congest').addEventListener('click',injectCongestion);
$('breaklink').addEventListener('click',failLink);
$('addflow').addEventListener('click',addFlow);
$('routing').addEventListener('change',e=>{model.routing=e.target.value;refreshConfig('Routing metric changed',true);});
$('algorithm').addEventListener('change',e=>{model.algorithm=e.target.value;refreshConfig('Routing algorithm changed',true);});
$('recompute').addEventListener('click',()=>{recomputeRouting('Manual recomputation');renderInspector();render();});
$('export').addEventListener('click',()=>exportText('packetlab-topology.json',JSON.stringify(model,null,2)+'\n','application/json'));
$('import').addEventListener('click',()=>$('importfile').click());
$('importfile').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const obj=validate(JSON.parse(await file.text()));model=obj;selected=null;setTool('select');$('routing').value=model.routing;$('algorithm').value=model.algorithm;dirty('Imported network');toast('Network imported: '+file.name);}catch(err){toast('Import failed: '+err.message);}e.target.value='';});
$('exporttrace').addEventListener('click',csv);
document.addEventListener('keydown',e=>{if($('workspace-panel').hidden)return;if(e.key==='Escape'){setTool('select');return;}if((e.key==='Delete'||e.key==='Backspace')&&selected&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)){if(selected.type==='node'){const id=selected.id;model.nodes=model.nodes.filter(n=>n.id!==id);model.links=model.links.filter(l=>l.a!==id&&l.b!==id);model.flows=model.flows.filter(f=>f.src!==id&&f.dst!==id);model.tcpFlows=(model.tcpFlows||[]).filter(f=>f.src!==id&&f.dst!==id);}else model.links=model.links.filter(l=>l.id!==selected.id);selected=null;dirty();}});
renderLabLibrary($('lab-library'),id=>{seed(id);activateTab('workspace-panel',{focus:true});$('challenge-card').scrollIntoView({block:'start'});});
const requestedLab=new URLSearchParams(location.search).get('lab');
seed(CHALLENGE_LABS.some(lab=>lab.id===requestedLab)?requestedLab:'campus');
requestAnimationFrame(raf);
