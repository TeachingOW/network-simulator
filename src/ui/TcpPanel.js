// Browser controls for the simplified TCP Reno teaching model.
// The simulator engine remains independent of all DOM/UI logic.
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const escapeHTML=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const hostsOf=model=>model.nodes.filter(n=>n.type==='host');

export function validateTcpFlows(model){
  if(model.tcpFlows===undefined){model.tcpFlows=[];return model;}
  if(!Array.isArray(model.tcpFlows)||model.tcpFlows.length>30)
    throw new Error('Expected up to 30 TCP transfers');
  const hosts=new Set(hostsOf(model).map(n=>n.id));
  const ids=new Set();
  for(const f of model.tcpFlows){
    if(!hosts.has(f.src)||!hosts.has(f.dst)||f.src===f.dst)
      throw new Error('TCP transfers must connect two distinct host nodes');
    f.id=String(f.id||'tcp'+(ids.size+1));
    if(ids.has(f.id))throw new Error('Duplicate TCP transfer ID');
    ids.add(f.id);
    const integers={srcPort:[1,65535,49152],dstPort:[1,65535,80],bytes:[1,100000000,16000],mss:[64,9000,1000],rwnd:[1,100000,32],
      ssthresh:[2,10000,16],rto:[100,60000,400]};
    for(const [name,[min,max,fallback]] of Object.entries(integers)){
      const value=Number(f[name]??fallback);
      if(!Number.isInteger(value)||value<min||value>max)
        throw new Error('Invalid TCP '+name);
      f[name]=value;
    }
    const start=Number(f.start??0);
    if(!Number.isFinite(start)||start<0||start>1000)throw new Error('Invalid TCP start');
    f.start=start;
  }
  return model;
}

export function createTcpPanel({getModel,getSim,onChange,toast}){
  const list=document.getElementById('tcplist');
  const status=document.getElementById('tcpstatus');
  const add=document.getElementById('addtcp');
  if(!list||!status||!add)throw new Error('TCP UI containers missing');
  function uniqueId(flows){
    let i=1;
    while(flows.some(f=>f.id==='tcp'+i))i++;
    return 'tcp'+i;
  }
  function addFlow(){
    const model=getModel();
    const hosts=hostsOf(model);
    if(hosts.length<2){toast('Add at least two hosts for a TCP transfer');return;}
    model.tcpFlows=model.tcpFlows||[];
    model.tcpFlows.push({id:uniqueId(model.tcpFlows),src:hosts[0].id,dst:hosts.at(-1).id,
      srcPort:49152,dstPort:80,bytes:24000,mss:1000,rwnd:32,start:0,rto:400,ssthresh:16});
    onChange();
  }
  add.addEventListener('click',addFlow);
  function renderFlows(){
    const model=getModel(),flows=model?.tcpFlows||[];
    if(!model)return;
    const hosts=hostsOf(model);
    const select=(f,key)=>hosts.map(n=>`<option value="${escapeHTML(n.id)}" ${f[key]===n.id?'selected':''}>${escapeHTML(n.name||n.id)}</option>`).join('');
    list.innerHTML=flows.map((f,i)=>`
      <div class="flowcard" data-tcp="${escapeHTML(f.id)}">
        <div class="flowtop"><b>TCP ${i+1} <span class="tag">Reno teaching model</span></b>
          <button class="close" data-remove="${escapeHTML(f.id)}" title="Remove TCP flow">✕</button></div>
        <div class="flowfields">
          <label>Sender<select data-field="src">${select(f,'src')}</select></label>
          <label>Receiver<select data-field="dst">${select(f,'dst')}</select></label>
          <label>Source port<input data-field="srcPort" type="number" min="1" max="65535" value="${f.srcPort??49152}"></label>
          <label>Destination port<input data-field="dstPort" type="number" min="1" max="65535" value="${f.dstPort??80}"></label>
          <label>Application bytes<input data-field="bytes" type="number" min="1" max="100000000" step="1000" value="${f.bytes}"></label>
          <label>MSS payload (bytes)<input data-field="mss" type="number" min="64" max="9000" value="${f.mss}"></label>
          <label>Receive window (MSS)<input data-field="rwnd" type="number" min="1" max="100000" value="${f.rwnd}"></label>
          <label>Start time (seconds)<input data-field="start" type="number" min="0" max="1000" step="0.1" value="${f.start??0}"></label>
        </div>
      </div>`).join('')||'<div class="summary">No TCP transfers. Add one or select the TCP Reno example.</div>';
    for(const card of list.querySelectorAll('[data-tcp]')){
      const f=flows.find(x=>x.id===card.dataset.tcp);
      if(!f)continue;
      for(const input of card.querySelectorAll('[data-field]'))input.addEventListener('change',e=>{
        const field=e.target.dataset.field;
        if(field==='src'||field==='dst'){
          if(e.target.value===(field==='src'?f.dst:f.src)){toast('TCP sender and receiver must differ');renderFlows();return;}
          f[field]=e.target.value;
        }else if(field==='start'){
          f.start=clamp(Number(e.target.value)||0,0,1000);
        }else{
          const limits={srcPort:[1,65535],dstPort:[1,65535],bytes:[1,100000000],mss:[64,9000],rwnd:[1,100000]};
          f[field]=Math.round(clamp(Number(e.target.value)||limits[field][0],...limits[field]));
        }
        onChange();
      });
      card.querySelector('[data-remove]').addEventListener('click',()=>{
        model.tcpFlows=model.tcpFlows.filter(x=>x.id!==f.id);
        onChange();
      });
    }
  }
  function renderStatus(){
    const sim=getSim();
    if(!sim||!status)return;
    const connections=[...sim.tcpConnections.values()];
    if(!connections.length){
      status.innerHTML='<div class="summary">No TCP transfers. Select the TCP Reno example or add a transfer above.</div>';return;
    }
    status.innerHTML=connections.map(c=>{
      const history=c.cwndHistory||[];
      const h=85,w=600;
      const maxX=Math.max(.1,sim.now/1000),maxY=Math.max(2,...history.map(p=>p.cwnd))*1.1;
      const points=history.map(p=>`${(p.time/maxX*w).toFixed(2)},${(h-p.cwnd/maxY*h).toFixed(2)}`).join(' ');
      return `<div class="summary" style="margin-bottom:8px">
        <b>${escapeHTML(c.id)} · ${escapeHTML(c.state)}</b> · ports ${c.srcPort} → ${c.dstPort} ·
        ${c.receivedBytes.toLocaleString()} / ${c.bytes.toLocaleString()} application bytes ·
        cwnd ${c.cwnd.toFixed(2)} MSS · receive window ${c.rwnd} MSS · ssthresh ${c.ssthresh.toFixed(2)} MSS ·
        retransmissions ${c.retransmissions} · timeouts ${c.timeouts} ·
        estimated RTT ${c.srtt===null?'—':c.srtt.toFixed(1)+' ms'} ·
        ${c.completedAt===null?'Elapsed':'Completed in'} ${((c.completedAt??sim.now)-c.start*1000>=0?((c.completedAt??sim.now)-c.start*1000)/1000:0).toFixed(2)} s
        <svg viewBox="0 0 600 85" width="100%" height="85" role="img" aria-label="TCP Reno congestion window plotted over simulated time" style="display:block;background:#eaf4ed;border-radius:6px;margin-top:8px">
          <polyline fill="none" stroke="#167347" stroke-width="2.5" points="${points}"></polyline>
        </svg>
        <span class="small">cwnd (in MSS) versus simulated time · illustrative Reno congestion-control model</span>
      </div>`;
    }).join('');
  }
  return {renderFlows,renderStatus,addFlow};
}
