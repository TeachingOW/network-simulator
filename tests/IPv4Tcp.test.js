import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulator } from '../src/core/Simulator.js';
import { parseIPv4, formatIPv4, parseCIDR, cidrContains } from '../src/ip/IPv4Address.js';
import { IPv4RoutingTable } from '../src/ip/IPv4RoutingTable.js';

function line(){
 const s=new Simulator();s.addHost('h1');s.addRouter('r1');s.addHost('h2');
 s.connect('h1','r1',{bw:10,delay:10});s.connect('r1','h2',{bw:10,delay:20});
 return s;
}
test('IPv4 address and CIDR parsing',()=>{
 assert.equal(formatIPv4(parseIPv4('192.168.1.2')),'192.168.1.2');
 assert.equal(parseCIDR('10.1.2.45/24').cidr,'10.1.2.0/24');
 assert.ok(cidrContains('10.1.2.0/24','10.1.2.255'));
 assert.ok(!cidrContains('10.1.2.0/24','10.1.3.1'));
 assert.throws(()=>parseIPv4('300.2.3.4'));
});
test('Longest prefix wins over lower metric',()=>{
 const t=new IPv4RoutingTable('r');
 t.add({prefix:'0.0.0.0/0',metric:1,nextNode:'default'});
 t.add({prefix:'10.0.0.0/8',metric:20,nextNode:'specific'});
 assert.equal(t.lookup('10.10.1.2').nextNode,'specific');
 assert.equal(t.lookup('8.8.8.8').nextNode,'default');
});
test('IPv4 interfaces, forwarding and TTL',()=>{
 const s=line();assert.equal(s.getInterfaces('r1').length,2);
 assert.notEqual(s.getIP('h1'),s.getIP('h2'));
 assert.equal(s.ipv4.resolve(s.getIP('h2')),'h2');
 const pkt=s.createPacket('h1','h2',400);
 assert.equal(pkt.protocol,17);assert.equal(pkt.ttl,32);
 s.forwardDatagram(pkt,'h1');assert.equal(pkt.ttl,31);
 s.advanceTo(1000);assert.equal(s.received,1);
});
test('Switched broadcast domain has same subnet but distinct IPs',()=>{
 const s=new Simulator();s.addHost('a');s.addSwitch('sw');s.addHost('b');
 s.connect('a','sw');s.connect('sw','b');
 assert.notEqual(s.getIP('a'),s.getIP('b'));
 assert.equal(s.getIP('a').split('.').slice(0,3).join('.'),s.getIP('b').split('.').slice(0,3).join('.'));
 s.generateDatagrams('a','b',{rate:10,duration:1});const m=s.run({until:3});
 assert.equal(m.generated,m.received);
});
test('Static IPv4 routes validate next-hop interfaces',()=>{
 const s=line(),l=s.network.links[0];
 assert.throws(()=>s.addIPv4Route('h1',{prefix:'192.0.2.0/24',outInterface:'bad'}));
 const e=s.addIPv4Route('h1',{prefix:'192.0.2.0/24',outInterface:l.id,nextNode:'r1',metric:1});
 assert.equal(s.getIPv4RoutingTable('h1').lookup('192.0.2.7'),e);
});
test('TCP Reno handshake, ACK, cwnd and FIN complete',()=>{
 const s=line();s.generateTcp('h1','h2',{bytes:7000,mss:1000});
 const m=s.run({until:10}).tcp[0];
 assert.equal(m.state,'CLOSED');assert.equal(m.bytesDelivered,7000);
 assert.ok(m.cwnd>1);
 for(const action of ['TCP_SYN','TCP_SYN_ACK','TCP_FIN'])assert.ok(s.trace.some(e=>e.action===action));
});
test('TCP Reno recovers from packet loss with retransmissions',()=>{
 const s=line();s.configureLink(s.network.links[0].id,{loss:15});
 s.generateTcp('h1','h2',{bytes:10000,mss:1000,rto:300});
 const m=s.run({until:60}).tcp[0];
 assert.equal(m.state,'CLOSED');assert.equal(m.bytesDelivered,10000);
 assert.ok(m.retransmissions>0);
});
test('TCP Reno timeout reduces congestion window',()=>{
 const s=line();s.configureLink(s.network.links[0].id,{loss:25});
 s.generateTcp('h1','h2',{bytes:18000,rto:250});
 const m=s.run({until:100}).tcp[0];
 assert.ok(m.cwndHistory.some(p=>p.reason==='retransmission timeout'));
});
test('TCP and datagrams share link queues and event scheduler',()=>{
 const s=line();s.generateDatagrams('h1','h2',{rate:10,duration:1});
 s.generateTcp('h1','h2',{bytes:6000,mss:1000});
 const m=s.run({until:6});assert.equal(m.tcp[0].bytesDelivered,6000);
 const ids=new Set(s.trace.filter(t=>t.action==='FORWARD').map(t=>t.flow));
 assert.ok(ids.has('f1'));assert.ok(ids.has('tcp1'));
});
test('TCP transfers survive topology export and reload',()=>{
 const s=line();s.generateTcp('h1','h2',{bytes:5000,mss:500,start:1});
 const clone=new Simulator({model:JSON.parse(JSON.stringify(s.toJSON()))});
 assert.equal(clone.network.tcpFlows[0].mss,500);
 assert.equal(clone.run({until:8}).tcp[0].bytesDelivered,5000);
});
