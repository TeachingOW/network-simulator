// Student-facing guided lab; deliberately independent of browser DOM.
export function findTourLink(model, a, b) {
  return model?.links?.find(l =>
    (l.a === a && l.b === b) || (l.a === b && l.b === a)) ?? null;
}

export const TOUR_STEPS = Object.freeze([
  {
    id: 'welcome',
    title: 'Welcome to your first network experiment',
    target: '#network',
    instruction: 'The Diamond example is loaded as a practice network. Hosts are endpoints, routers choose IP routes, switches relay traffic, and links have delay, bandwidth, loss, and routing costs.',
    task: 'Take a look at the diagram, then select Next. Exiting the tour restores the network you were using before it started.',
    complete: () => true
  },
  {
    id: 'select-router',
    title: 'Select a router',
    target: '#network',
    instruction: 'Choose the Select / drag tool and click router R1, the upper-middle green node. The Selection inspector opens on the right.',
    task: 'Click R1 in the topology.',
    complete: s => s.selected?.type === 'node' && s.selected.id === 'r1'
  },
  {
    id: 'ipv4',
    title: 'Understand IPv4 interfaces and routing',
    target: '#forwardtable',
    instruction: 'R1 has automatically assigned IPv4 interfaces, a prefix-based routing table, and a logical next-hop table. A router looks up the destination IP when forwarding each packet. These are simulated, not real OS interfaces.',
    task: 'Find the IPv4 address and a destination /32 route in the Selection inspector, then select Next.',
    complete: () => true
  },
  {
    id: 'custom-code',
    title: 'Program a router safely',
    target: '#programCode',
    instruction: 'Routers and switches can run declarative packet rules in the browser. Conditions inspect fields such as destination port and TTL. Actions forward, drop, inject a datagram, or change TTL.',
    task: 'Select "Load example", then "Compile & apply" to apply the router’s packet policy.',
    complete: s => {
      const router=s.model?.nodes?.find(n=>n.id==='r1');
      return router?.program?.language==='packetlab-rules-v1'||Number(router?.program?.dropEvery)>0||Number(router?.program?.injectEvery)>0;
    }
  },
  {
    id: 'custom-routing',
    title: 'Choose a routing metric',
    target: '#routing',
    instruction: 'Dijkstra and Bellman–Ford compute shortest paths using the selected link metric. Custom weights let you control route choice independently of simulated propagation delay.',
    task: 'Set Routing metric to "Custom link weights".',
    complete: s => s.model?.routing === 'custom'
  },
  {
    id: 'select-link',
    title: 'Choose the upper path link',
    target: '#network',
    instruction: 'The diamond has two alternatives from S1 to S2. We will make the upper path less attractive by changing the R1–S2 link weight.',
    task: 'Click the link connecting R1 and S2 (the upper-right link).',
    complete: s => s.selected?.type === 'link' &&
      s.selected.id === findTourLink(s.model, 'r1', 's2')?.id
  },
  {
    id: 'set-weight',
    title: 'Change a routing weight',
    target: '#l-weight',
    instruction: 'The cost field belongs to the link, not the forwarding table. With custom routing enabled, increasing this weight causes the shortest path to move to the lower R2 route.',
    task: 'Change the R1–S2 Custom routing weight to 120 or more and commit the field (press Tab or Enter).',
    complete: s => s.model?.routing === 'custom' &&
      (findTourLink(s.model, 'r1', 's2')?.weight ?? 0) >= 120
  },
  {
    id: 'recompute',
    title: 'Watch routing recomputation',
    target: '#recompute',
    instruction: 'The forwarding tables were updated when you edited the active weight. Routing highlight is intentionally brief: normal packet forwarding does not redraw a persistent route.',
    task: 'Click "Recompute forwarding tables" to see the selected route flash for about two seconds.',
    complete: s => s.routeVersion > s.enteredRouteVersion
  },
  {
    id: 'datagrams',
    title: 'Send independent datagrams',
    target: '#play',
    instruction: 'The traffic generators send UDP-like independent datagrams. Every packet is queued, transmitted and forwarded hop by hop. Unlike TCP, this flow does not retransmit a missing datagram.',
    task: 'Click Run and watch the Received counter or packet trace until at least one packet is delivered.',
    complete: s => (s.sim?.received ?? 0) > 0
  },
  {
    id: 'congestion',
    title: 'Create a network bottleneck',
    target: '#congest',
    instruction: 'The R2–S2 link is selected for this step. Reducing its bandwidth and queue capacity makes it difficult for the combined traffic flows to get through. The experiment resets on a configuration change.',
    task: 'Click "Inject congestion" above the topology.',
    complete: s => {
      const l = findTourLink(s.model, 'r2', 's2');
      return !!l && l.bw <= 0.8 && l.queue <= 12;
    }
  },
  {
    id: 'drops',
    title: 'Observe queue drops',
    target: '#dropped',
    instruction: 'When too many datagrams wait for the bottleneck, the finite FIFO queue fills. The simulator drops excess packets and records a queue_full reason in the trace.',
    task: 'Click Run again. Wait until the Dropped counter is above zero.',
    complete: s => (s.sim?.dropped ?? 0) > 0
  },
  {
    id: 'tcp-preset',
    title: 'Try a TCP Reno transfer',
    target: '#presettcp',
    instruction: 'TCP uses the same simulated IPv4 links and queues, but introduces a connection, ACKs, retransmission, and congestion control. The TCP example replaces the practice topology/traffic with a TCP-focused scenario.',
    task: 'Click "TCP Reno example" above the topology.',
    complete: s => (s.model?.tcpFlows?.length ?? 0) > 0
  },
  {
    id: 'cwnd',
    title: 'See the TCP congestion window',
    target: '#play',
    instruction: 'After the SYN/SYN-ACK/ACK handshake, TCP starts sending application bytes and its congestion window (cwnd) grows as ACKs return. Open TCP results below the network metrics to inspect a live cwnd plot.',
    task: 'Click Run. Watch the TCP Reno panel until the congestion window has changed.',
    complete: s => [...(s.sim?.tcpConnections?.values?.() ?? [])]
      .some(t => t.cwndHistory?.length > 1)
  },
  {
    id: 'limitations',
    title: 'Simulation model vs full protocol',
    target: '#learning-guide-card',
    instruction: 'PacketLab simulates selected IPv4/TCP mechanisms. A full interoperable TCP/IP stack also needs binary header processing, checksums, all protocol states, Ethernet/ARP and many corner cases.',
    task: 'Open the learning guide when you want the complete comparison of what PacketLab models and deliberately omits. Select Finish to keep experimenting with the TCP practice network.',
    complete: () => true
  }
]);

export function tourStepComplete(step, state) {
  return Boolean(step?.complete(state));
}
