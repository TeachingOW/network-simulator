import { parseIPv4 } from './IPv4Address.js';
import { IPv4RoutingTable } from './IPv4RoutingTable.js';

// IPv4 endpoint interfaces and /32 host routes over the existing graph.
// Switches are simulated as logical L2 relays: MAC learning and ARP are NOT modeled.
export class IPv4Stack {
  constructor(network,forwardingTables,pathFor) {
    this.network=network;
    this.forwardingTables=forwardingTables;
    this.pathFor=pathFor;
    this.interfaces=new Map(network.nodes.map(n=>[n.id,[]]));
    this.tables=new Map(network.nodes.filter(n=>n.type!=='switch').map(n=>[n.id,new IPv4RoutingTable(n.id)]));
    this.primary=new Map();
    this.byAddress=new Map();
    this.assignInterfaces();
    this.buildRoutes();
  }
  assignInterfaces(){
    const links=this.network.links;
    const switches=this.network.nodes.filter(n=>n.type==='switch').map(n=>n.id);
    const parents=new Map(switches.map(id=>[id,id]));
    const root=id=>{let x=id;while(parents.get(x)!==x)x=parents.get(x);return x;};
    const union=(a,b)=>{const ra=root(a),rb=root(b);if(ra!==rb)parents.set(rb,ra);};
    for(const l of links)if(parents.has(l.a)&&parents.has(l.b))union(l.a,l.b);
    const segments=new Map();
    // Interfaces connected to the same switched component share one IPv4 subnet.
    for(const l of links){
      const sa=parents.has(l.a),sb=parents.has(l.b);
      const key=sa||sb?'switch:'+root(sa?l.a:l.b):'link:'+l.id;
      if(!segments.has(key))segments.set(key,new Map());
      const members=segments.get(key);
      for(const id of [l.a,l.b]) if(!parents.has(id)){
        if(!members.has(id))members.set(id,[]);
        members.get(id).push(l.id);
      }
    }
    const groups=[...segments.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
    if(groups.length>254)throw new RangeError('IPv4 topology supports at most 254 broadcast domains');
    for(let g=0;g<groups.length;g++){
      const [key,members]=groups[g],domain=g+1;
      const endpoints=[...members.entries()].sort(([a],[b])=>a.localeCompare(b));
      if(endpoints.length>253)throw new RangeError('Too many IPv4 interfaces in subnet');
      for(let i=0;i<endpoints.length;i++){
        const [nodeId,linkIds]=endpoints[i];
        const address=`10.${domain}.0.${i+1}`,prefix=`10.${domain}.0.0/24`;
        // A physical port on a switched domain can share an interface address with another
        // port of the same node. This is a deliberately simplified classroom abstraction.
        for(const linkId of linkIds){
          const iface={id:nodeId+':'+linkId,nodeId,linkId,address,prefix,domain:key};
          this.interfaces.get(nodeId).push(iface);
        }
        this.primary.set(nodeId,this.primary.get(nodeId)||address);
        this.byAddress.set(address,nodeId);
      }
    }
    for(const n of this.network.nodes){
      if(n.type==='switch')continue;
      if(!this.primary.has(n.id)){
        // Isolated hosts remain addressable by a local loopback, without a route.
        const addr=`172.31.${Math.floor(this.primary.size/254)}.${(this.primary.size%254)+1}`;
        this.primary.set(n.id,addr);this.byAddress.set(addr,n.id);
      }
    }
  }
  addressFor(nodeId){return this.primary.get(typeof nodeId==='string'?nodeId:nodeId?.id)||null;}
  interfacesFor(nodeId){return this.interfaces.get(typeof nodeId==='string'?nodeId:nodeId?.id)||[];}
  ownsAddress(nodeId,address){return this.byAddress.get(address)===nodeId;}
  resolve(address){parseIPv4(address);return this.byAddress.get(address)||null;}
  buildRoutes(){
    const hosts=this.network.nodes.filter(n=>n.type==='host');
    for(const n of this.network.nodes){
      if(n.type==='switch')continue;
      const table=this.tables.get(n.id);
      const ifaces=this.interfacesFor(n.id);
      for(const iface of ifaces)table.add({prefix:iface.prefix,outInterface:iface.linkId,metric:0,origin:'connected'});
      for(const dst of hosts){
        if(dst.id===n.id)continue;
        const address=this.addressFor(dst.id),path=this.pathFor(n.id,dst.id);
        if(!address||!path||path.nodes.length<2)continue;
        const lId=path.links[0];
        const firstInterface=ifaces.find(i=>i.linkId===lId);
        if(!firstInterface)continue;
        // Find the next IP-speaking endpoint after any transparent switch hops.
        const nextL3=path.nodes.slice(1).find(id=>this.network.node(id)?.type!=='switch');
        const peerAddress=this.interfacesFor(nextL3).find(i=>i.domain===firstInterface.domain)?.address||null;
        table.add({prefix:address+'/32',nextHop:peerAddress,
          outInterface:lId,nextNode:path.nodes[1],metric:this.forwardingTables.get(n.id)?.get(dst.id)?.cost??0,
          origin:'computed'});
      }
    }
  }
  table(nodeId){return this.tables.get(typeof nodeId==='string'?nodeId:nodeId?.id)||null;}
  lookup(nodeId,destination){return this.table(nodeId)?.lookup(destination)||null;}
  // Static routes can override computed routes using more-specific prefix and metric.
  addRoute(nodeId,entry){
    const table=this.table(nodeId);
    if(!table)throw new Error('Only hosts and routers have IPv4 routing tables');
    if(!entry.outInterface||!this.network.link(entry.outInterface))throw new Error('Route requires a valid outgoing link');
    const link=this.network.link(entry.outInterface);
    if(link.a!==nodeId && link.b!==nodeId)throw new Error('Outgoing link is not attached to this node');
    const nextNode=entry.nextNode||(link.a===nodeId?link.b:link.a);
    if(nextNode!==link.a&&nextNode!==link.b)throw new Error('Next node must be attached to outgoing link');
    return table.add({...entry,nextNode,origin:'static'});
  }
}
