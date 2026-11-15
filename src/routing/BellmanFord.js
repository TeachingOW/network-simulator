// Bellman–Ford on bidirectional links; hosts cannot forward transit packets.
export function bellmanFord(network, source, metric = 'delay') {
  const ids=network.nodes.map(n=>n.id);
  if(!network.node(source)) throw new Error('Unknown source: '+source);
  const dist=new Map(ids.map(id=>[id,Infinity])), prev=new Map();
  dist.set(source,0);
  const relax=(u,v,l)=>{
    if(u!==source && network.node(u).type==='host') return false;
    const d=dist.get(u);
    if(!Number.isFinite(d)) return false;
    const cand=d+network.weight(l,metric);
    if(cand<dist.get(v)) { dist.set(v,cand);prev.set(v,{from:u,link:l.id});return true; }
    return false;
  };
  for(let i=1;i<ids.length;i++) {
    let changed=false;
    for(const l of network.links) {
      if(!l.enabled) continue;
      if(relax(l.a,l.b,l)) changed=true;
      if(relax(l.b,l.a,l)) changed=true;
    }
    if(!changed) break;
  }
  return {dist,prev};
}
