# PacketLab Studio — NS-3-inspired Browser Network Simulator

## Guided student lab: Your first network experiment

Click **🧭 Guided lab** in the simulator's header to start a hands-on, 14-step beginner scenario. It requires no account, installation, server, or prior networking experience. The tour runs against the **real** simulator and checks completion before enabling **Next** (or students can choose **Skip step**). It now includes a safe custom packet-rule exercise.

The guided scenario walks a learner through:

1. Understanding a diamond topology of hosts, routers, switches, and links.
2. Selecting router R1 and inspecting its automatically assigned IPv4 interfaces and route tables.
3. Choosing **Custom link weights**, selecting the R1–S2 link, and raising its weight to at least 120.
4. Recomputing forwarding tables and observing the route highlight **only at recomputation**.
5. Running an independent UDP-like datagram flow and reading packet-delivery counters.
6. Injecting congestion on the active R2–S2 path and observing finite-queue packet drops.
7. Loading a TCP Reno example, watching `cwnd` grow, and interpreting the live TCP status.
8. Comparing the educational IPv4/TCP mechanisms with a full standards-compliant protocol stack.

The tour provides **Previous**, **Next**, **Skip step**, and **Exit** controls, a progress indicator, a focused highlight, and descriptive instructions. **Exiting** using the ✕ button or Escape restores the previous *network configuration*. **Finishing** intentionally keeps the new practice network. Simulation clock and in-memory packet history are not restored after exiting. No data is saved to a server. The tour does not run automatically on page load.

## Protocol model: IPv4 + simplified TCP Reno

PacketLab now models **IPv4 addresses and routing** alongside its original independent UDP-like datagrams, plus an **educational TCP Reno byte-transfer model**. Both use the same discrete-event scheduler, finite link queues, propagation/serialization delays, packet losses, and simulated IP forwarding. None of these send real operating-system packets.

In the editor, click a host/router to inspect **auto-assigned IPv4 interfaces**, **CIDR routes**, and logical next hops. Select **TCP Reno example** or **Add TCP transfer** to run a TCP flow; the **TCP Reno congestion-window panel** shows sender state, delivered bytes, cwnd, ssthresh, retransmissions, estimated RTT, and a cwnd-over-time plot. Select a link and raise loss to observe timeouts and retransmissions.

### Programmatic IPv4 and TCP examples

```javascript
import { Simulator } from './src/core/Simulator.js';

const sim = new Simulator();
const a = sim.addHost('a');
const router = sim.addRouter('router');
const b = sim.addHost('b');

sim.connect(a, router, { delay: '10ms', bandwidth: '10Mbps' });
sim.connect(router, b, { delay: '20ms', bandwidth: '5Mbps', loss: 5 });

sim.setRouting('dijkstra', 'delay');
console.log('IPv4 host address:', sim.getIP('a'));
console.log('Router IPv4 interfaces:', sim.getInterfaces('router'));
console.log('IPv4 routes:', sim.getIPv4RoutingTable('router').toJSON());

// A TCP Reno byte stream with automatic SYN/ACK, cwnd, loss recovery, and FIN.
sim.generateTcp(a, b, { bytes: 24000, mss: 1000, rwnd: 32, start: 0 });
console.log(sim.run({ until: 30 }).tcp);
```

Or run `node examples/ipv4-tcp.js`.

### Teaching model versus full protocol implementation

| Area | Implemented behavior in PacketLab | What a full, interoperable protocol stack would require |
|---|---|---|
| **IPv4 datagram** | Source/destination IPv4 addresses, protocol number (17 = UDP-like, 6 = TCP), TTL, total simulated packet size, hop-by-hop forwarding | Binary IPv4 header encode/decode, checksum, options, fragmentation/reassembly, ICMP and standards-conformant packet parsing |
| **IPv4 interfaces** | Automatically assigned addresses in logical /24 broadcast domains; routers/hosts have interfaces | Real NIC configuration, netmasks, manual/DHCP addressing, interface state, packet sockets |
| **Routing** | Connected-prefix entries, computed /32 host routes, longest-prefix match and next-hop/output interface lookup; Dijkstra/Bellman–Ford cost selection | Actual dynamic routing protocols (OSPF, RIP, BGP), policy/ECMP, full convergence, administrative distances, real route updates |
| **Switches** | Logical Layer-2 relays in a shared subnet | Ethernet frames, MAC learning and aging, ARP, VLANs, broadcast behavior, spanning tree |
| **UDP-like traffic** | Independent packets with configurable size and generation rate; no reliability | UDP header ports, checksum, multiplexing, sockets, all UDP application semantics |
| **TCP Reno** | SYN/SYN-ACK/ACK handshake, byte sequence numbers, cumulative ACKs, out-of-order buffering, fixed receiver window, cwnd/ssthresh, slow start, additive increase, three-duplicate-ACK fast retransmit, timeout/RTO, FIN/ACK close | Full interoperable TCP state machine, bidirectional streams, advertised dynamic flow control, SACK, window scaling, MSS negotiation, timestamps, persist/keepalive, correct retransmission corner cases, full RFC conformance |
| **Execution and I/O** | Deterministic simulated time and synthetic loss/queueing | OS sockets and NIC drivers, actual transmitted bits, hardware timing, kernel state and real network traffic |

**An educational implementation reproduces selected mechanisms for experiments; a complete protocol implementation must meet the on-wire formats, protocol-state rules, interoperability requirements, and edge cases.** PacketLab models the former; it is not production IPv4/TCP, nor the actual NS-3 engine.

IPv4 addressing is intentionally automatic rather than user-editable in this release. Computed IP routes target destination hosts (/32); a programmatic static-route API supports additional prefixes for a running simulation, but static routes are not yet persisted in topology JSON or distributed by routing protocols.

---

PacketLab Studio is a programmable **discrete-event network simulator** with a browser topology editor and reusable JavaScript API. Its network layer forwards independent IPv4 datagrams, while traffic can be generated as UDP-like datagrams or a simplified TCP Reno byte stream. It is an educational project inspired by NS-3, **not** the NS-3 engine. The editor and code examples now share the same simulation, routing, and packet-processing modules.

**Repository:** https://github.com/TeachingOW/network-simulator

## Run in a browser

Open the repository's GitHub Pages site at **https://teachingow.github.io/network-simulator/** (after Pages has been enabled). Students need only a browser and do not run or administer a server.

The editor loads native JavaScript ES modules. For local development, use a static HTTP server rather than opening `index.html` as `file://`; for example `python3 -m http.server 8000` and visit `http://localhost:8000`. GitHub Pages requires no build step.

## What you can edit

- Add, drag, connect, and remove hosts, switches, routers, and bidirectional links.
- Change bandwidth, propagation delay, random loss, output FIFO capacity, enable/disable state, and independent routing weight for each link.
- Configure synthetic UDP-like datagram flows (rate and size) or TCP Reno transfers (application bytes, MSS, receiver window and start time).
- Choose **Dijkstra** or **Bellman–Ford** and **delay**, **hops**, or **custom link weight** routing metrics.
- Click hosts or routers to inspect auto-assigned IPv4 interfaces, CIDR routing tables and logical next-hop forwarding entries.
- Set node rules in JSON to drop every Nth matched datagram or inject new datagrams in a relay.
- Pause, step by 100 ms, reset, examine packet events, and export CSV traces or JSON topologies.

**Routing highlight is transient:** the path flashes only when forwarding tables are recomputed. Ordinary datagram transmissions do not repeatedly highlight the path.

## JavaScript API

```javascript
import { Simulator } from './src/core/Simulator.js';

const sim = new Simulator();

const h1 = sim.addHost('h1');
const r1 = sim.addRouter('r1');
const h2 = sim.addHost('h2');

sim.connect(h1, r1, { bandwidth: '10Mbps', delay: '10ms', weight: 5 });
sim.connect(r1, h2, { bandwidth: '5Mbps', delay: '20ms', weight: 2 });
sim.setRouting('dijkstra', 'custom');

let seen = 0;
r1.onPacket((packet, { inject }) => {
  if (++seen % 5 === 0) return packet.drop('sampling');
  if (seen % 7 === 0) inject('h2', 256);
  return packet.forward();
});

sim.generateDatagrams(h1, h2, {
  rate: 100, packetSize: 1024, duration: 5,
  srcPort: 49152, dstPort: 8080
});
const result = sim.run({ until: 7 }); // simulation seconds
console.log(result, sim.trace);
```

The callback is a **trusted programmatic hook** for JavaScript callers. The web interface also includes a sandboxed, code-like packet policy language. It is parsed into inert commands and never uses `eval` or executes JavaScript.

```text
when dstPort == 8080:
  set ttl 4
  forward
otherwise:
  drop "blocked_port"
```

Conditions can inspect `flowId`, node IDs, IP addresses, ports, protocol, TTL, size, and injection state. Actions are `set ttl`, `forward`, `drop`, and `inject <host> <bytes>`. Legacy exported JSON rules remain supported. Injected packets originate at the selected relay; injected datagrams do not recursively trigger more node programs, and injections are capped. Per-hop forwarding respects IPv4 destination addresses and TTL on hosts/routers; switches still use logical next-hop forwarding rather than an Ethernet MAC table.

## Source layout

```text
index.html
src/
  core/
    Simulator.js
    EventScheduler.js
    Packet.js
  network/
    Network.js
    Node.js
    Link.js
    Queue.js
  routing/
    Dijkstra.js
    BellmanFord.js
    ForwardingTable.js
  applications/
    DatagramGenerator.js
  ip/
    IPv4Address.js
    IPv4RoutingTable.js
    IPv4Stack.js
  transport/
    TcpReno.js
  ui/
    TopologyEditor.js
    TcpPanel.js
examples/
  simple-network.js
  routing-example.js
  ipv4-tcp.js
tests/
  Simulator.test.js
  IPv4Tcp.test.js
```

The UI imports `Simulator` directly. Programmatic examples import the same class; there is no separate inline simulation implementation.

## Tests and examples (optional developer tools)

Requires Node.js 22+ for the provided examples and test runner. The normal browser UI does not require Node.js.

```bash
npm test
npm run check
node examples/simple-network.js
node examples/routing-example.js
node examples/ipv4-tcp.js
```

GitHub Actions runs these tests on pull requests and pushes to `main`.

## Model assumptions and scope

- Each IPv4 datagram is forwarded independently. Hosts and routers use destination-IP longest-prefix lookup; switches remain simplified logical Layer-2 forwarding nodes.
- A datagram can be generated, forwarded, queued, serialized, delayed, randomly dropped, programmatically dropped, injected, or delivered.
- Link queues are finite FIFO per direction. Propagation delay is separate from serialization time.
- Routing-table recomputation occurs when a user changes the topology, active routing inputs, or manually requests it. Packet forwarding never recomputes the routing table itself.
- Link costs are `delay(ms)+1` for delay metric, `1` for hop metric, or an independently editable positive value for custom metric.
- IPv4 prefix matching and a simplified TCP Reno (including retransmission) are simulated. Production Ethernet/ARP, binary IPv4 headers/checksums, full UDP/TCP stacks, Wi-Fi PHY, and NS-3 internals are not. A switch currently behaves like a logical Layer-2 relay without MAC learning.
- No real packets are emitted to the host operating system or local network. All traffic is synthetic and processed in memory.

This repository is the **simulator itself**, not a collection of student assignments or TODO starter files.
