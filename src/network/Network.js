import { Node } from './Node.js';
import { Link } from './Link.js';

export class Network {
  constructor(model = null) {
    this.nodes = [];
    this.links = [];
    this.flows = [];
    this.tcpFlows = [];
    if (model) {
      for (const n of model.nodes ?? []) this.addNode(n.id, n.type, n);
      for (const l of model.links ?? []) this.connect(l.a, l.b, l);
      this.flows = (model.flows ?? []).map(f => ({ ...f }));
      this.tcpFlows = (model.tcpFlows ?? []).map(f => ({ ...f }));
    }
  }
  node(id) { return this.nodes.find(n => n.id === (typeof id === 'string' ? id : id?.id)); }
  link(id) { return this.links.find(l => l.id === id); }
  addNode(id, type, options = {}) {
    if (this.node(id)) throw new Error('Duplicate node: ' + id);
    const node = new Node({ id, type, ...options });
    this.nodes.push(node); return node;
  }
  addHost(id, options) { return this.addNode(id, 'host', options); }
  addRouter(id, options) { return this.addNode(id, 'router', options); }
  addSwitch(id, options) { return this.addNode(id, 'switch', options); }
  connect(a, b, options = {}) {
    const na = this.node(a), nb = this.node(b);
    if (!na || !nb || na === nb) throw new Error('Links require two different existing nodes');
    if (this.links.some(l => (l.a === na.id && l.b === nb.id) || (l.a === nb.id && l.b === na.id)))
      throw new Error('Nodes are already connected');
    const link = new Link(na.id, nb.id, options);
    if (this.link(link.id)) throw new Error('Duplicate link ID: ' + link.id);
    this.links.push(link); return link;
  }
  weight(link, metric) {
    if (metric === 'hops') return 1;
    if (metric === 'custom') return link.weight;
    if (metric === 'delay') return link.delay + 1;
    throw new Error('Unknown routing metric: ' + metric);
  }
  toJSON(routing = 'delay', algorithm = 'dijkstra') {
    return {version:2, nodes:this.nodes.map(n=>n.toJSON()),links:this.links.map(l=>l.toJSON()),
      flows:this.flows.map(f=>({...f})),tcpFlows:this.tcpFlows.map(f=>({...f})),routing,algorithm};
  }
}
