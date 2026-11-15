import { dijkstra } from './Dijkstra.js';
import { bellmanFord } from './BellmanFord.js';

// Device table entries are logical destination-host IDs, not IPv4 prefixes/MAC addresses.
export function computeForwardingTables(network, algorithm='dijkstra', metric='delay') {
  const search=algorithm==='dijkstra'?dijkstra:algorithm==='bellman'?bellmanFord:null;
  if(!search) throw new Error('Unknown routing algorithm: '+algorithm);
  const tables=new Map(), destinations=network.nodes.filter(n=>n.type==='host');
  for(const source of network.nodes) {
    const {dist,prev}=search(network,source.id,metric), entries=new Map();
    for(const dst of destinations) {
      if(source.id===dst.id || !Number.isFinite(dist.get(dst.id))) continue;
      let cur=dst.id,first=null,steps=0;
      while(cur!==source.id && steps++<network.nodes.length) {
        const p=prev.get(cur);
        if(!p){first=null;break;}
        first={next:cur,link:p.link,cost:dist.get(dst.id)};
        cur=p.from;
      }
      if(cur===source.id && first) entries.set(dst.id,first);
    }
    tables.set(source.id,entries);
  }
  return tables;
}

export function tablePath(network,tables,source,destination) {
  if(!network.node(source)||!network.node(destination)) return null;
  if(source===destination) return {nodes:[source],links:[]};
  const nodes=[source],links=[],seen=new Set();
  let current=source;
  while(current!==destination && nodes.length<=network.nodes.length) {
    if(seen.has(current)) return null;
    seen.add(current);
    const hop=tables.get(current)?.get(destination);
    if(!hop) return null;
    const l=network.link(hop.link);
    if(!l||!l.enabled) return null;
    nodes.push(hop.next);links.push(hop.link);
    current=hop.next;
  }
  return current===destination?{nodes,links}:null;
}
