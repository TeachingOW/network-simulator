import { parseCIDR, parseIPv4, cidrContains } from './IPv4Address.js';

// Entries store longest-prefix-match IP destinations, interface and next-hop.
export class IPv4RoutingTable {
  constructor(nodeId) {this.nodeId=nodeId;this.entries=[];this._serial=0;}
  add({prefix,nextHop=null,outInterface=null,nextNode=null,metric=0,origin='static'}){
    const parsed=parseCIDR(prefix);
    if(nextHop!==null)parseIPv4(nextHop);
    if(!Number.isFinite(metric)||metric<0)throw new RangeError('Route metric must be nonnegative');
    const entry={prefix:parsed.cidr,length:parsed.length,network:parsed.network,mask:parsed.mask,
      nextHop,outInterface,nextNode,metric,origin,order:this._serial++};
    this.entries.push(entry);return entry;
  }
  clear(origin=null) {
    if(origin===null)this.entries=[];
    else this.entries=this.entries.filter(e=>e.origin!==origin);
  }
  lookup(destination) {
    const addr=typeof destination==='string'?parseIPv4(destination):destination;
    let best=null;
    for(const e of this.entries) {
      if(!cidrContains(e,addr))continue;
      if(!best||e.length>best.length||(e.length===best.length&&e.metric<best.metric)||
         (e.length===best.length&&e.metric===best.metric&&e.order<best.order))best=e;
    }
    return best;
  }
  toJSON(){return this.entries.map(({prefix,nextHop,outInterface,nextNode,metric,origin})=>({prefix,nextHop,outInterface,nextNode,metric,origin}));}
}
