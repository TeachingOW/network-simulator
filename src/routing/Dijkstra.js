// Nonnegative weighted shortest paths. Hosts are endpoints, not transit nodes.
export function dijkstra(network, source, metric = 'delay') {
  const ids = network.nodes.map(n => n.id);
  const dist = new Map(ids.map(id => [id, Infinity]));
  const prev = new Map(), visited = new Set();
  if (!network.node(source)) throw new Error('Unknown source: ' + source);
  dist.set(source, 0);
  for (let k = 0; k < ids.length; k++) {
    let u = null, best = Infinity;
    for (const [id,d] of dist) if (!visited.has(id) && d < best) { u=id; best=d; }
    if (u === null) break;
    visited.add(u);
    if (u !== source && network.node(u).type === 'host') continue;
    for (const l of network.links) {
      if (!l.enabled) continue;
      const v = l.a === u ? l.b : l.b === u ? l.a : null;
      if (!v || visited.has(v)) continue;
      const cand = best + network.weight(l, metric);
      if (cand < dist.get(v)) {
        dist.set(v,cand); prev.set(v,{from:u,link:l.id});
      }
    }
  }
  return { dist, prev };
}
