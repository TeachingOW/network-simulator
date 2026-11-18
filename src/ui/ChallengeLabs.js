import { compilePacketProgram } from '../programming/PacketRuleProgram.js';
import { configurationChallengeModel, configurationChallengeProgress } from './ConfigurationChallenge.js';

export const CHALLENGE_LABS = Object.freeze([
  {id:'slow-campus-network', title:'The slow campus network', level:'Intermediate', minutes:15, topic:'Routing', description:'Lab A is dropping requests while Lab B works. Find the bad routing configuration.', task:'Keep Dijkstra, custom weights, both redundant paths, and the original traffic. Inspect capacity and route costs to steer Lab A onto a healthier path.'},
  {id:'queue-rescue', title:'Rescue the bottleneck', level:'Beginner', minutes:10, topic:'Queues', description:'A busy uplink cannot keep up. Restore delivery without reducing the offered load.', task:'Inspect the Core → Server link. Adjust link capacity and queue settings until at least 100 packets are generated and loss is at most 2%, at least 90% have arrived, and mean delay is at most 100 ms. Keep traffic and topology unchanged.'},
  {id:'restore-connectivity', title:'Bring the server back', level:'Beginner', minutes:10, topic:'Link failures', description:'The server has gone silent after maintenance. Trace the break and reconnect it.', task:'Inspect link states and the route in the Routing tab. Restore connectivity without adding or deleting links, then deliver at least 100 packets.'},
  {id:'tcp-recovery', title:'Fix the slow TCP transfer', level:'Intermediate', minutes:15, topic:'TCP flow control', description:'TCP delivers the file, but a receive-window limit makes it miss its deadline. Diagnose the bottleneck on a long-delay, lossy path.', task:'Deliver the 48,000-byte file and close the connection within 6 simulated seconds. First run the baseline and compare the receive window, cwnd, and RTT in TCP results. Change only Receive window (MSS) in the Traffic tab. Keep the 1,000-byte MSS, file size, link delays, and 2% random loss unchanged. TCP handles lost segments; your task is to remove the throughput limit. Use Reset before each timed run; 12× playback speed is optional.'},
  {id:'ttl-expiry', title:'A packet runs out of hops', level:'Intermediate', minutes:15, topic:'IPv4 TTL', description:'Routes are valid and links are healthy, but packets expire before the server. Follow their remaining TTL to find out why.', task:'Run the baseline and find ttl_expired in Packet trace. Follow the TTL values in FORWARD events, then repair the TTL-setting packet policy on Ingress. Keep an explicit TTL rule, the original links, traffic, and routing. Deliver at least 100 packets with at least 95% received, no TTL drops, and no injected traffic. This teaching model consumes one TTL unit at each forwarding node, including the source and logical switches.'},
  {id:'port-policy', title:'Guard the application', level:'Advanced', minutes:20, topic:'Packet rules', description:'Two services share one router. Deliver web requests and block unwanted traffic.', task:'Select Core and compile a packet program that forwards destination port 443 and drops destination port 23. Keep traffic, topology, and link settings. Test at least 100 generated packets, deliver 30 web packets, and block 30 legacy packets at Core with no web drops or legacy deliveries.'}
]);

export function challengeLabModel(id) {
  if (!CHALLENGE_LABS.some(lab=>lab.id===id)) throw new Error('Unknown challenge lab');
  if (id==='slow-campus-network') return configurationChallengeModel();
  if(id==='ttl-expiry')return {
    version:1,challenge:id,algorithm:'dijkstra',routing:'delay',
    nodes:[
      {id:'client',type:'host',name:'Client',x:65,y:225},
      {id:'ingress',type:'router',name:'Ingress',x:275,y:225,program:{language:'packetlab-rules-v1',source:'when dstPort == 443:\n  set ttl 2\n  forward\notherwise:\n  forward'}},
      {id:'transit',type:'router',name:'Transit',x:490,y:225},
      {id:'edge',type:'router',name:'Edge',x:705,y:225},
      {id:'server',type:'host',name:'Server',x:915,y:225}
    ],
    links:[['client','ingress'],['ingress','transit'],['transit','edge'],['edge','server']].map(([a,b],i)=>({id:'hop-'+i,a,b,bw:20,delay:20,loss:0,queue:60,weight:1,enabled:true})),
    flows:[{id:'ttl-probe',src:'client',dst:'server',srcPort:49152,dstPort:443,pps:60,bytes:800,start:0,duration:8}],tcpFlows:[]
  };
  const model={version:1,challenge:id,algorithm:'dijkstra',routing:'delay',
    nodes:[{id:'client',type:'host',name:'Client',x:120,y:240},{id:'core',type:'router',name:'Core',x:490,y:240},{id:'server',type:'host',name:'Server',x:850,y:240}],
    links:[{id:'access',a:'client',b:'core',bw:20,delay:8,loss:0,queue:60,weight:1,enabled:true},{id:'uplink',a:'core',b:'server',bw:20,delay:12,loss:0,queue:20,weight:1,enabled:true}],
    flows:[{id:'web',src:'client',dst:'server',srcPort:49152,dstPort:443,pps:220,bytes:1000,start:0,duration:15}],tcpFlows:[]};
  if(id==='queue-rescue') { model.links[1].bw=.4;model.links[1].queue=6; }
  if(id==='restore-connectivity') model.links[1].enabled=false;
  if(id==='tcp-recovery') {
    model.flows=[];model.links.forEach(link=>{link.delay=80;});model.links[1].loss=2;
    model.tcpFlows=[{id:'file',src:'client',dst:'server',srcPort:49152,dstPort:443,bytes:48000,mss:1000,rwnd:1,start:0,rto:400,ssthresh:16}];
  }
  if(id==='port-policy') {
    model.flows[0].pps=60;
    model.flows.push({...model.flows[0],id:'legacy',srcPort:49153,dstPort:23});
  }
  return model;
}

// Geometry and display names may change; the experiment's topology and load may not.
function experimentPreserved(model, baseline) {
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const fields=(items,keys)=>items.map(item=>keys.map(key=>item[key])).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
  const fixedTcp=flows=>model.challenge==='tcp-recovery'?flows.map(({rwnd,...fixed})=>fixed):flows;
  return same(fields(model.nodes,['id','type']),fields(baseline.nodes,['id','type'])) &&
    same(fields(model.links,['id','a','b']),fields(baseline.links,['id','a','b'])) &&
    same(model.flows,baseline.flows) && same(fixedTcp(model.tcpFlows||[]),fixedTcp(baseline.tcpFlows||[])) &&
    model.algorithm===baseline.algorithm && model.routing===baseline.routing &&
    model.nodes.every(n=>!n.program || (model.challenge==='port-policy' && n.id==='core') || (model.challenge==='ttl-expiry' && n.id==='ingress'));
}

export function challengeLabProgress(model, sim, path) {
  const lab=CHALLENGE_LABS.find(lab=>lab.id===model?.challenge);
  if(!lab) return null;
  const baseline=challengeLabModel(lab.id), sent=sim?.sent||0, received=sim?.received||0;
  const healthy=sent>=100 && received>=30 && (sim?.dropped||0)/sent<=.02;
  const checks=[{done:experimentPreserved(model,baseline),text:lab.id==='tcp-recovery'?'Original topology, file size, MSS, and routing preserved':'Original topology, traffic, and routing mode preserved'}];
  const add=(done,text)=>checks.push({done:Boolean(done),text});
  if(lab.id==='slow-campus-network') {
    const p=configurationChallengeProgress(model,path,sim);
    add(p.preserved,'Both redundant paths remain enabled');
    add(p.repairedRoute,'Lab A uses the higher-capacity route');
    add(p.tested && healthy,'At least 100 generated packets with loss at most 2%');
  } else if(lab.id==='queue-rescue') {
    add(model.links.every(l=>l.enabled && l.loss===0),'Links enabled with no random loss');
    add(healthy,'At least 100 generated packets with loss at most 2%');
    add(sent>=100 && received/sent>=.9 && sim.delaySum/received<=100,'At least 90% delivered with mean delay at most 100 ms');
  } else if(lab.id==='restore-connectivity') {
    add(model.links.every(l=>l.enabled) && path,'End-to-end route restored');
    add(received>=100,'At least 100 packets delivered');
  } else if(lab.id==='tcp-recovery') {
    add(JSON.stringify(model.links)===JSON.stringify(baseline.links),'Original path preserved: 80 ms per link and 2% uplink loss');
    const connection=sim?.tcpConnections?.get('file');
    const elapsed=connection?.completedAt==null?null:(connection.completedAt-connection.start*1000)/1000;
    add(connection?.receivedBytes===48000 && connection?.state==='CLOSED','All 48,000 application bytes delivered and connection closed');
    add(elapsed!==null && elapsed<=6,`Finish within 6 simulated seconds${elapsed===null?'':' · result '+elapsed.toFixed(2)+' s'}`);
  } else if(lab.id==='ttl-expiry') {
    const policy=model.nodes.find(n=>n.id==='ingress')?.program;
    const retainsTTL=policy?.language==='packetlab-rules-v1' && compilePacketProgram(policy.source).some(block=>block.actions.some(action=>action.type==='setTTL'));
    add(retainsTTL,'Explicit TTL-setting policy retained on Ingress');
    add(JSON.stringify(model.links)===JSON.stringify(baseline.links),'Original healthy links preserved');
    add(received>=100 && received/(sent||1)>=.95,'At least 100 delivered packets and 95% received');
    add(sent>=100 && !sim?.dropReasons?.get('ttl_expired') && !sim?.injected,'No TTL-expiry drops or injected packets in the repaired run');
  } else {
    add(JSON.stringify(model.links)===JSON.stringify(baseline.links),'Original link settings preserved');
    const events=sim?.trace||[], count=(flow,action,loc)=>events.filter(e=>e.flow===flow && e.action===action && (!loc || e.loc===loc)).length;
    add(sent>=100,'At least 100 packets generated');
    add(count('web','DELIVER')>=30 && count('web','DROP')===0,'At least 30 web packets delivered without drops');
    add(count('legacy','DROP','core')>=30 && count('legacy','DELIVER')===0,'At least 30 legacy packets blocked at Core; none delivered');
  }
  return {lab,checks,complete:checks.every(check=>check.done)};
}
