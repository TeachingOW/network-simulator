## Datagram forwarding (v2)

PacketLab Studio now models **connectionless datagrams only**. Each forwarding device maintains a per-destination **logical host-ID forwarding table**. A datagram is looked up again at every hop; no complete precomputed route is stored inside each packet.

- Click any **router or switch** to see its logical forwarding table (destination, next hop, link, cost).
- Choose **Dijkstra** or **Bellman–Ford**, with lowest-delay or fewest-hop metrics.
- Click **Recompute forwarding tables** to rebuild routes manually. Topology/link-state and routing configuration changes recompute automatically.
- The active route is highlighted **briefly only when routing is recomputed**; ordinary packet forwarding does not keep the path highlighted.
- The packet trace records `GENERATE`, `FORWARD`, `ENQUEUE`, `TX_START`, `ARRIVE`, `DROP`, and `DELIVER` events.

### Programmable packet rules

Click a router or switch, select **Load example**, and **Apply rules** to configure an in-network drop/injection experiment. The editor accepts declarative JSON (not arbitrary JavaScript):

```json
{
  "flowId": "f1",
  "dropEvery": 5,
  "injectEvery": 7,
  "injectDst": "h2",
  "injectBytes": 256
}
```

This drops every fifth matching arrival and creates a new 256-byte datagram every seventh matching arrival at the node. Set a rate to 0 to disable it. Generated datagrams do not recursively trigger node rules; a cap limits injected packets per run.

This is an **educational datagram model**, not IP or Ethernet. Router/switch entries are logical destination IDs, not IP-prefix routing or MAC learning tables. It does not simulate TCP, ARP, or an actual NS-3 stack.

---

# PacketLab Studio — Browser Network Simulator

An NS-3-inspired, **browser-only** educational discrete-event network simulator. No installation or server is required to run the single-file app.

## Run

Open `index.html` directly in Chrome, Edge, or Firefox. To publish for students, put `index.html` in a public GitHub repository and enable GitHub Pages (deploy from the root directory of the default branch).

## Editor

1. Click **+ Host**, **+ Router**, or **+ Switch**, then click an empty place on the canvas.
2. Use **Select / drag** to reposition nodes.
3. Use **Connect**, then click the endpoints to make a bidirectional link.
4. Select a link to edit **bandwidth, propagation delay, loss percentage, FIFO queue capacity, and enabled state**.
5. Use **Traffic generators** to define source and destination hosts, datagram size, packets per second, start, and duration.
6. Click **Run**, **Pause**, **+100 ms**, or **Reset**.
7. Inspect per-packet trace events; export CSV traces and JSON topologies.

`Delete` removes a selected node/link, and `Escape` exits the active add/connect tool.

## Experiments

- **Baseline:** Run the Diamond example and observe packet delivery and the shortest-delay path.
- **Congestion:** Select the `R1–S2` link, click **Inject congestion**, and measure FIFO queue drops.
- **Failure and rerouting:** Select and fail the `R1–S2` link; observe the alternative `R2` path if it remains connected.
- **Loss:** Set a link loss rate to 10% and compare delivery statistics to the baseline.
- **Routing:** Compare lowest propagation delay versus fewest hops.

## What the model includes

- Configurable host/router/switch graph; packet traffic between hosts
- Per-direction FIFO packet queues, link serialization delay, propagation delay, and random link loss
- Per-datagram shortest-path routing using Dijkstra
- A discrete-event simulation scheduler, packet visualization, log export, and topology import/export

## Deliberate limitations

This is an educational simulation, **not the NS-3 engine**. It currently does not implement Ethernet, ARP, real IP addresses, TCP/UDP protocol stacks, Wi-Fi physical layers, or real packet I/O. The `UDP-like` traffic flows are synthetic packets with configurable sizes and send rates. Routes are selected using static hop count or propagation delay, not dynamic routing protocols. The browser app runs entirely locally; exporting a file is necessary to retain a topology across browser sessions.

## Deployment

To publish on GitHub Pages: upload `index.html` and `README.md`, then go to **Settings → Pages → Build and deployment → Deploy from a branch**, choose your default branch and `/ (root)`. GitHub Pages can then serve the static simulator for students.

## Editable routing weights

The routing metric selector supports **Lowest propagation delay**, **Fewest hops**, and **Custom link weights**.

- **Delay:** each link costs `propagation delay (ms) + 1` in the educational routing model.
- **Hops:** each link costs `1`.
- **Custom:** every link has its own independent positive **Custom routing weight**, editable by clicking that link in the visual topology.

The selected metric is used by **both Dijkstra and Bellman–Ford**. A forwarding-table **Cost** is the *total* route weight, not necessarily one link's weight. Changing a custom weight automatically recomputes tables only when the **Custom link weights** metric is active. A route is highlighted briefly only after recomputation. The chosen custom weights survive topology JSON export/import. Link delays and bandwidth continue to affect packet simulation separately from custom routing costs.
