# PacketLab Studio — NS-3-inspired Browser Network Simulator

PacketLab Studio is a programmable **datagram-only discrete-event network simulator** with a browser topology editor and a reusable JavaScript simulation API. It is an educational project inspired by NS-3, **not** the NS-3 engine. The editor and code examples now share the same simulation, routing, and packet-processing modules.

**Repository:** https://github.com/TeachingOW/network-simulator

## Run in a browser

Open the repository's GitHub Pages site at **https://teachingow.github.io/network-simulator/** (after Pages has been enabled). Students need only a browser and do not run or administer a server.

The editor loads native JavaScript ES modules. For local development, use a static HTTP server rather than opening `index.html` as `file://`; for example `python3 -m http.server 8000` and visit `http://localhost:8000`. GitHub Pages requires no build step.

## What you can edit

- Add, drag, connect, and remove hosts, switches, routers, and bidirectional links.
- Change bandwidth, propagation delay, random loss, output FIFO capacity, enable/disable state, and independent routing weight for each link.
- Configure synthetic datagram flows by source, destination, packets/s, size, start time, and duration.
- Choose **Dijkstra** or **Bellman–Ford** and **delay**, **hops**, or **custom link weight** routing metrics.
- Click a forwarding node to inspect its logical destination-host → next-hop/link/cost table.
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

sim.generateDatagrams(h1, h2, { rate: 100, packetSize: 1024, duration: 5 });
const result = sim.run({ until: 7 }); // simulation seconds
console.log(result, sim.trace);
```

The callback is a **trusted programmatic hook** for JavaScript callers. The web interface exposes **declarative JSON rules** rather than executing arbitrary JavaScript typed into an input field.

```json
{"flowId":"f1","dropEvery":5,"injectEvery":7,"injectDst":"h2","injectBytes":256}
```

Injected packets originate at the selected relay; injected datagrams do not recursively trigger more node programs, and injections are capped. Per-hop forwarding respects a TTL and currently uses destination host IDs rather than real IP addresses.

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
  ui/
    TopologyEditor.js
examples/
  simple-network.js
  routing-example.js
tests/
  Simulator.test.js
```

The UI imports `Simulator` directly. Programmatic examples import the same class; there is no separate inline simulation implementation.

## Tests and examples (optional developer tools)

Requires Node.js 22+ for the provided examples and test runner. The normal browser UI does not require Node.js.

```bash
npm test
npm run check
node examples/simple-network.js
node examples/routing-example.js
```

GitHub Actions runs these tests on pull requests and pushes to `main`.

## Model assumptions and scope

- Each datagram is independently forwarded at every intermediate node using a precomputed per-device logical forwarding table.
- A datagram can be generated, forwarded, queued, serialized, delayed, randomly dropped, programmatically dropped, injected, or delivered.
- Link queues are finite FIFO per direction. Propagation delay is separate from serialization time.
- Routing-table recomputation occurs when a user changes the topology, active routing inputs, or manually requests it. Packet forwarding never recomputes the routing table itself.
- Link costs are `delay(ms)+1` for delay metric, `1` for hop metric, or an independently editable positive value for custom metric.
- The simulator does **not** implement real IP prefixes, MAC learning, Ethernet, ARP, TCP, UDP stacks, retransmission, Wi-Fi PHY, or NS-3 internals. A switch currently behaves like a generic logical forwarding device.
- No real packets are emitted to the host operating system or local network. All traffic is synthetic and processed in memory.

This repository is the **simulator itself**, not a collection of student assignments or TODO starter files.
