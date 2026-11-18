import { EventScheduler } from './EventScheduler.js';
import { Packet } from './Packet.js';
import { Network } from '../network/Network.js';
import { Queue } from '../network/Queue.js';
import { DatagramGenerator } from '../applications/DatagramGenerator.js';
import { IPv4Stack } from '../ip/IPv4Stack.js';
import { TcpRenoConnection } from '../transport/TcpReno.js';
import { computeForwardingTables, tablePath } from '../routing/ForwardingTable.js';
import { compilePacketProgram, runPacketProgram } from '../programming/PacketRuleProgram.js';

/**
 * NS-3-inspired, connectionless discrete-event network simulator.
 * All times inside the engine are milliseconds; run({until}) uses seconds.
 * Simulates datagrams, not actual Ethernet/IP/UDP or a real NS-3 engine.
 */
export class Simulator {
  constructor({model = null, seed = 24313, traceLimit = 35000, maxInjected = 2000} = {}) {
    this.network = new Network(model);
    this.routing = model?.routing ?? 'delay';
    this.algorithm = model?.algorithm ?? 'dijkstra';
    this.seed = seed >>> 0 || 24313;
    this.traceLimit = traceLimit;
    this.maxInjected = maxInjected;
    this.forwardingTables = new Map();
    this.routeVersion = 0;
    this.recomputeRouting();
    this.reset();
  }

  addHost(id, options={}) {const n=this.network.addHost(id,options);this.changed();return n;}
  addRouter(id, options={}) {const n=this.network.addRouter(id,options);this.changed();return n;}
  addSwitch(id, options={}) {const n=this.network.addSwitch(id,options);this.changed();return n;}
  connect(a,b,options={}) {const l=this.network.connect(a,b,options);this.changed();return l;}
  changed() {this.recomputeRouting();this.reset();}
  setRouting(algorithm='dijkstra', metric=this.routing) {
    if(!['dijkstra','bellman'].includes(algorithm)||!['delay','hops','custom'].includes(metric))
      throw new Error('Unsupported algorithm or metric');
    this.algorithm=algorithm;this.routing=metric;this.changed();
    return this;
  }
  configureLink(id, updates) {
    const l=this.network.link(id);
    if(!l) throw new Error('Unknown link '+id);
    const replacement=new l.constructor(l.a,l.b,{...l.toJSON(),...updates,id:l.id});
    Object.assign(l,replacement);this.changed();
    return l;
  }
  onNodePacket(id, callback) {
    const n=this.network.node(id);
    if(!n) throw new Error('Unknown node '+id);
    n.onPacket(callback);return n;
  }
  generateDatagrams(source, destination, options={}) {
    const flow=new DatagramGenerator(source,destination,{
      id:options.id||'f'+(this.network.flows.length+1),...options
    });
    if(this.network.node(flow.src)?.type!=='host'||this.network.node(flow.dst)?.type!=='host')
      throw new Error('Traffic endpoints must be hosts');
    if(this.network.flows.some(f=>f.id===flow.id))throw new Error('Duplicate flow ID: '+flow.id);
    this.network.flows.push(flow.toJSON());this.reset();
    return flow;
  }
  recomputeRouting() {
    this.forwardingTables=computeForwardingTables(this.network,this.algorithm,this.routing);
    this.ipv4=new IPv4Stack(this.network,this.forwardingTables,
      (src,dst)=>tablePath(this.network,this.forwardingTables,src,dst));
    this.routeVersion++;
    return this.forwardingTables;
  }
  getInterfaces(nodeOrId) {return this.ipv4.interfacesFor(nodeOrId);}
  getIP(nodeOrId) {return this.ipv4.addressFor(nodeOrId);}
  getIPv4RoutingTable(nodeOrId) {return this.ipv4.table(nodeOrId);}
  addIPv4Route(nodeId,route) {return this.ipv4.addRoute(nodeId,route);}
  sendDatagram(source,destinationIP,{bytes=1024,flowId='manual',srcPort=49152,dstPort=8080}={}) {
    const src=typeof source==='string'?source:source?.id;
    const dst=this.ipv4.resolve(destinationIP);
    if(!this.network.node(src)||this.network.node(dst)?.type!=='host')
      throw new Error('IPv4 datagram requires a valid source and destination IP host');
    if(!Number.isInteger(bytes)||bytes<28||bytes>65535)throw new RangeError('IPv4 datagram length must be 28–65535');
    if(!Number.isInteger(srcPort)||srcPort<1||srcPort>65535||!Number.isInteger(dstPort)||dstPort<1||dstPort>65535)
      throw new RangeError('Transport ports must be integers from 1–65535');
    const pkt=this.createPacket(src,dst,bytes,flowId,false,{dstIP:destinationIP,protocol:17,srcPort,dstPort});
    this.forwardDatagram(pkt,src);
    return pkt;
  }
  generateTcp(source,destination,options={}) {
    const src=typeof source==='string'?source:source?.id;
    const dst=typeof destination==='string'?destination:destination?.id;
    if(this.network.node(src)?.type!=='host'||this.network.node(dst)?.type!=='host')
      throw new Error('TCP endpoints must be hosts');
    const config={id:options.id||'tcp'+(this.network.tcpFlows.length+1),
      src,dst,bytes:options.bytes??options.dataBytes??16000,
      srcPort:options.srcPort??49152,dstPort:options.dstPort??80,
      start:options.start??0,mss:options.mss??1000,rwnd:options.rwnd??32,
      rto:options.rto??400,ssthresh:options.ssthresh??16};
    new TcpRenoConnection(this,config); // validate early
    if(this.network.tcpFlows.some(x=>x.id===config.id))
      throw new Error('Duplicate TCP flow ID: '+config.id);
    this.network.tcpFlows.push(config);this.reset();
    return config;
  }
  tablePath(source,destination) {return tablePath(this.network,this.forwardingTables,source,destination);}
  getForwardingTable(nodeOrId) {
    const id=typeof nodeOrId==='string'?nodeOrId:nodeOrId?.id;
    return new Map(this.forwardingTables.get(id)||[]);
  }
  get nowSeconds() {return this.now/1000;}
  toJSON() {return this.network.toJSON(this.routing,this.algorithm);}
  reset() {
    this.now=0;
    this.seq=0;
    this.pkts=0;this.sent=0;this.received=0;this.dropped=0;
    this.delaySum=0;this.processed=0;this.rng=this.seed;
    this.scheduler=new EventScheduler();this.heap=this.scheduler;
    this.queues=new Map();this.trace=[];this.flight=[];this.dropBursts=[];
    this.dropReasons=new Map();this.nodeCounts=new Map();this.injected=0;
    this.tcpConnections=new Map();this.programCache=new Map();
    for(const flow of this.network.tcpFlows){
      const tcp=new TcpRenoConnection(this,flow);
      this.tcpConnections.set(tcp.id,tcp);
      this.event(tcp.start*1000,'tcp_start',{id:tcp.id});
    }
    this.limitReached=false;
    for(const l of this.network.links) for(const from of [l.a,l.b])
      this.queues.set(l.id+'|'+from,new Queue(l.queue));
    for(const flow of this.network.flows) {
      if(this.network.node(flow.src)&&this.network.node(flow.dst)&&flow.src!==flow.dst)
        this.event(flow.start*1000,'emit',{flowId:flow.id});
    }
    return this;
  }
  event(at,type,data) {return this.scheduler.schedule(at,type,data,this.now);}
  random() {
    let x=this.rng;x^=x<<13;x^=x>>>17;x^=x<<5;this.rng=x;
    return (x>>>0)/4294967296;
  }
  log(packet, location, action, detail='') {
    if(this.trace.length<this.traceLimit) this.trace.push({
      time:this.now/1000,packet:packet?.id??'',flow:packet?.flowId??'',
      ports:packet?.srcPort&&packet?.dstPort?`${packet.srcPort}→${packet.dstPort}`:'',loc:location,action,detail
    });
  }
  drop(packet,location,reason) {
    this.dropped++;this.dropReasons.set(reason,(this.dropReasons.get(reason)||0)+1);
    this.dropBursts.push({location,time:this.now,reason,protocol:packet?.protocol,flow:packet?.flowId});
    if(this.dropBursts.length>80)this.dropBursts.shift();
    this.log(packet,location,'DROP',reason);
  }
  createPacket(src,dst,bytes,flowId='manual',injected=false,ipOptions={}) {
    const pkt=new Packet({id:++this.pkts,flowId,src,dst,bytes,created:this.now,injected,
      srcIP:ipOptions.srcIP||this.ipv4.addressFor(src),
      dstIP:ipOptions.dstIP||this.ipv4.addressFor(dst),
      protocol:ipOptions.protocol??17,srcPort:ipOptions.srcPort??null,
      dstPort:ipOptions.dstPort??null,tcp:ipOptions.tcp??null});
    this.sent++;this.log(pkt,src,'GENERATE',injected?'generated at relay':'datagram');
    return pkt;
  }
  inject(source,destination,bytes=256) {
    const s=typeof source==='string'?source:source?.id;
    const d=typeof destination==='string'?destination:destination?.id;
    if(!this.network.node(s) || this.network.node(d)?.type!=='host')
      throw new Error('Injected packets need a valid source and host destination');
    if(!(bytes>=64 && bytes<=9000))throw new RangeError('Injected datagram size must be 64–9000 bytes');
    if(this.injected>=this.maxInjected) return false;
    this.injected++;
    this.event(this.now,'inject',{src:s,dst:d,bytes});
    return true;
  }
  processNodeRules(packet,at) {
    const n=this.network.node(at);
    if(!n||n.type==='host'||packet.injected) return true;
    let c=this.nodeCounts.get(at);
    if(!c){c={seen:0,drop:0,inject:0};this.nodeCounts.set(at,c);}
    const p=n.program;
    if(p?.language==='packetlab-rules-v1'){
      let cached=this.programCache.get(at);
      if(!cached||cached.source!==p.source){cached={source:p.source,compiled:compilePacketProgram(p.source)};this.programCache.set(at,cached);}
      c.seen++;
      const context={time:this.now/1000,node:n,simulator:this,inject:(dst,bytes=256)=>{const ok=this.inject(at,dst,bytes);if(ok)c.inject++;return ok;}};
      const action=runPacketProgram(cached.compiled,packet,context);
      if(action.type==='drop'){c.drop++;this.drop(packet,at,action.reason);return false;}
      return true;
    }
    if(p && (!p.flowId||p.flowId===packet.flowId)){
      c.seen++;
      const dropEvery=Number(p.dropEvery)||0;
      if(dropEvery>0 && c.seen%dropEvery===0) {
        c.drop++;this.drop(packet,at,'program_drop');return false;
      }
      const injectEvery=Number(p.injectEvery)||0;
      if(injectEvery>0 && c.seen%injectEvery===0) {
        const dest=p.injectDst||packet.dst;
        if(this.inject(at,dest,Number(p.injectBytes)||256))c.inject++;
      }
    }
    if(n.handler) {
      const context={
        time:this.now/1000,node:n,simulator:this,
        inject:(dst,bytes=256)=>{const ok=this.inject(at,dst,bytes);if(ok)c.inject++;return ok;}
      };
      const action=n.handler(packet,context);
      if(action===false || action?.type==='drop') {
        c.drop++;this.drop(packet,at,action?.reason||'program_drop');return false;
      }
      if(action?.type==='inject')context.inject(action.destination,action.bytes);
      if(action && !['drop','forward','inject'].includes(action.type))
        throw new Error('Unknown packet action');
    }
    return true;
  }
  sendTcpSegment(conn,from,to,segment) {
    const bytes=40+(segment.payloadBytes||0);
    if(bytes>65535)throw new RangeError('TCP segment exceeds IPv4 length');
    const tcp={connId:conn.id,...segment};
    const forward=from===conn.src;
    const pkt=this.createPacket(from,to,bytes,conn.id,false,{protocol:6,tcp,
      srcPort:forward?conn.srcPort:conn.dstPort,dstPort:forward?conn.dstPort:conn.srcPort});
    this.log(pkt,from,'TCP_'+segment.kind,(segment.retransmit?'retransmit ':'')+
      'seq '+(segment.seq??'-')+' ack '+(segment.ack??'-'));
    this.forwardDatagram(pkt,from);
    return pkt;
  }
  forwardDatagram(packet,at) {
    if(at===packet.dst && this.ipv4.ownsAddress(at,packet.dstIP)) {
      this.received++;this.delaySum+=this.now-packet.created;
      this.log(packet,at,'DELIVER',`delay ${(this.now-packet.created).toFixed(1)} ms; IPv4 ${packet.dstIP}`);
      if(packet.protocol===6 && packet.tcp)
        this.tcpConnections.get(packet.tcp.connId)?.onSegment(packet,at);
      return;
    }
    const n=this.network.node(at);
    if(!n || (at!==packet.src && n.type==='host')){this.drop(packet,at,'host_cannot_forward');return;}
    if(packet.ttl<=0){this.drop(packet,at,'ttl_expired');return;}
    if(at!==packet.src&&!this.processNodeRules(packet,at))return;
    if(!packet.dstIP){this.drop(packet,at,'invalid_ipv4_destination');return;}
    // Routers and hosts use longest-prefix IPv4 route lookup.
    // Switches are simplified L2 relays using logical next-hop entries.
    const entry=n.type==='switch'
      ? this.forwardingTables.get(at)?.get(packet.dst)
      : this.ipv4.lookup(at,packet.dstIP);
    if(!entry){this.drop(packet,at,'no_ip_route');return;}
    const outLink=entry.outInterface||entry.link;
    const nextNode=entry.nextNode||entry.next;
    if(!nextNode){this.drop(packet,at,'no_next_hop');return;}
    const l=this.network.link(outLink);
    if(!l||!l.enabled){this.drop(packet,at,'link_down');return;}
    const q=this.queues.get(l.id+'|'+at);
    if(!q){this.drop(packet,at,'queue_missing');return;}
    if(!q.enqueue({pkt:packet,from:at,to:nextNode})) {
      this.drop(packet,l.id,'queue_full');return;
    }
    packet.ttl--;
    this.log(packet,at,'FORWARD',`IPv4 ${packet.dstIP} to ${nextNode} via ${l.id}; ttl ${packet.ttl}`);
    this.log(packet,l.id,'ENQUEUE',`queue ${q.waiting.length}/${l.queue}`);
    this.service(l,q);
  }
  service(link,queue) {
    if(queue.busy||!queue.waiting.length)return;
    const item=queue.shift();
    queue.busy=true;
    const duration=item.pkt.bytes*8/(link.bw*1000);
    queue.tx++;
    this.log(item.pkt,link.id,'TX_START',`${duration.toFixed(2)} ms serialization`);
    this.event(this.now+duration,'tx_done',{lid:link.id,from:item.from,item});
  }
  dispatch(event) {
    const x=event.data;
    if(event.type==='emit') {
      const f=this.network.flows.find(z=>z.id===x.flowId);
      if(!f||this.now>(f.start+f.duration)*1000+1e-7)return;
      this.forwardDatagram(this.createPacket(f.src,f.dst,f.bytes,f.id,false,{protocol:17,srcPort:f.srcPort??49152,dstPort:f.dstPort??8080}),f.src);
      const next=this.now+1000/f.pps;
      if(next<=(f.start+f.duration)*1000-0.01)this.event(next,'emit',{flowId:f.id});
    } else if(event.type==='inject'){
      this.forwardDatagram(this.createPacket(x.src,x.dst,x.bytes,'injected@'+x.src,true),x.src);
    } else if(event.type==='tcp_start'){
      this.tcpConnections.get(x.id)?.startTransfer();
    } else if(event.type==='tcp_timeout'){
      this.tcpConnections.get(x.id)?.onTimeout(x.token,x.phase);
    } else if(event.type==='tx_done') {
      const l=this.network.link(x.lid),q=this.queues.get(x.lid+'|'+x.from);
      if(q){q.busy=false;if(l)this.service(l,q);}
      if(!l||!l.enabled){this.drop(x.item.pkt,x.lid,'link_down');return;}
      this.log(x.item.pkt,l.id,'TX_DONE');
      const lost=this.random()<l.loss/100;
      // Record exact propagation timing. The UI applies its own speed-aware
      // minimum display time without changing simulation event timing.
      this.flight.push({a:x.item.from,b:x.item.to,start:this.now,end:this.now+l.delay,
        protocol:x.item.pkt.protocol,flow:x.item.pkt.flowId,lost});
      if(this.flight.length>6000)this.flight.splice(0,this.flight.length-6000);
      this.event(this.now+l.delay,'arrive',{item:x.item,lid:l.id,lost});
    } else if(event.type==='arrive') {
      if(x.lost){this.drop(x.item.pkt,x.lid,'random_loss');return;}
      this.log(x.item.pkt,x.item.to,'ARRIVE',`via ${x.lid}`);
      this.forwardDatagram(x.item.pkt,x.item.to);
    } else {
      throw new Error('Unknown simulation event: '+event.type);
    }
  }
  // Cancelled TCP timers are retained in the heap until they reach its head.
  // Playback discards these without advancing the clock or delaying completion.
  discardInactiveTimers() {
    while(this.scheduler.peek()?.type==='tcp_timeout') {
      const {id,token,phase}=this.scheduler.peek().data, connection=this.tcpConnections.get(id);
      const active=connection && token===connection.timerToken &&
        ((phase==='SYN' && connection.state==='SYN_SENT') ||
         (phase==='DATA' && connection.state==='ESTABLISHED' && connection.unacked.size>0) ||
         (phase==='FIN' && connection.state==='FIN_WAIT'));
      if(active)break;
      this.scheduler.pop();
    }
  }
  advanceTo(targetMs, maxEvents=30000) {
    if(!Number.isFinite(targetMs)||targetMs<this.now)throw new RangeError('Simulation time must not go backward');
    let count=0;this.limitReached=false;
    while(this.scheduler.length && this.scheduler.peek().at<=targetMs && count<maxEvents) {
      const ev=this.scheduler.pop();this.now=ev.at;this.dispatch(ev);
      this.processed++;count++;
    }
    if(count<maxEvents)this.now=targetMs;
    else this.limitReached=true;
    // Keep enough recent history for the UI to animate fast simulation speeds.
    this.flight=this.flight.filter(x=>x.end>=this.now-2000);
    this.dropBursts=this.dropBursts.filter(x=>x.time>=this.now-700);
    return count;
  }
  step(milliseconds=100){this.advanceTo(this.now+milliseconds);return this;}
  run({until=10}={}) {
    const target=until*1000;
    let total=0;
    while(this.now<target) {
      const count=this.advanceTo(target,30000);total+=count;
      if(!this.limitReached)break;
      if(total>2_000_000)throw new Error('Experiment event budget exceeded');
    }
    return this.summary();
  }
  summary() {
    return {time:this.now/1000,generated:this.sent,received:this.received,dropped:this.dropped,
      meanDelayMs:this.received?this.delaySum/this.received:null,processed:this.processed,
      dropReasons:Object.fromEntries(this.dropReasons),tcp:[...this.tcpConnections.values()].map(c=>c.summary())};
  }
}
