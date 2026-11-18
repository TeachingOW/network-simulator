// One worked repair per mission. The simulator still accepts other valid repairs.
export const CHALLENGE_SOLUTIONS = Object.freeze({
  'tipping-point': {
    steps:[
      'Load Star example. Keep both 1,000-byte flows and the shared S1–R1 link at 5 Mbps.',
      'Run the original rates of 160 and 120 packets/s as a baseline.',
      'In Traffic, set Flow 1 to 400 packets/s and Flow 2 to 300 packets/s. Run again and compare mean delay, Dropped, and queue_full events.'
    ],
    explanation:'The baseline offers 280 × 1,000 × 8 = 2.24 Mb/s. The shared 5 Mb/s link can serve about 625 of these packets per second. At a combined 700 packets/s, the offered load is 5.6 Mb/s, so arrivals outpace service, the finite queue fills, delay rises, and excess packets drop. A larger queue postpones drops but adds waiting time.',
    expected:'The baseline delivers without queue loss. The overloaded run produces queue_full drops and greater one-way delay. Export both traces to support the comparison.'
  },
  'slow-campus-network': {
    edits:[{link:'r1-r2',name:'R1 ↔ R2',field:'weight',label:'Custom routing weight',value:100}],
    steps:[
      'Keep Dijkstra, Custom link weights, and both redundant paths enabled.',
      'In Routing, select Recompute forwarding tables. Lab A should now go through R1 → R3 → Application Server.',
      'Run for at least two simulated seconds and check that every objective turns green.'
    ],
    explanation:'The slow R1 → R2 → Server path originally costs 1 + 1, while the higher-capacity R1 → R3 → Server path costs 30 + 30. Raising the R1–R2 weight to 100 makes its path cost 101, so Dijkstra chooses the cost-60 alternative. Other weights that produce the same healthy route can also work.',
    expected:'Lab A uses R3, both paths stay available, and at least 100 packets are generated with loss at or below 2%.'
  },
  'queue-rescue': {
    edits:[{link:'uplink',name:'Core ↔ Server',field:'bw',label:'Bandwidth (Mbps)',value:10}],
    steps:[
      'Keep the original traffic, queue capacity, and other link settings.',
      'Run for at least two simulated seconds, then compare delivery rate and mean one-way delay.'
    ],
    explanation:'The source offers 220 × 1,000 × 8 = 1.76 Mb/s. The original 0.4 Mb/s uplink cannot keep up, so its queue fills. A 10 Mb/s uplink clears the bottleneck. Enlarging the queue alone cannot fix sustained overload.',
    expected:'At least 100 packets are generated, loss stays at or below 2%, at least 90% arrive, and mean delay stays below 100 ms.'
  },
  'restore-connectivity': {
    edits:[{link:'uplink',name:'Core ↔ Server',field:'enabled',label:'Link enabled',value:true}],
    steps:[
      'Select the dashed Core ↔ Server link and check Link enabled.',
      'Open Routing and confirm Client → Core → Server. Link-state edits automatically recompute the route.',
      'Run for at least two simulated seconds to deliver 100 packets.'
    ],
    explanation:'The disabled uplink removes the only route to the server. Enabling the existing link restores forwarding without changing the topology or traffic.',
    expected:'Both links are enabled, an end-to-end route exists, and at least 100 packets reach the server.'
  },
  'tcp-recovery': {
    intro:'Fix the receiver-window bottleneck while leaving the lossy network unchanged.',
    tcpEdits:[{id:'file',field:'rwnd',label:'Receive window (MSS)',value:8}],
    steps:[
      'Run the baseline and open TCP results. The receive window is 1 MSS even as cwnd grows. The supplied baseline takes about 17 simulated seconds.',
      'Open Traffic → TCP Reno transfers. Change Receive window (MSS) from 1 to 8. Keep MSS at 1,000 bytes and the file at 48,000 bytes.',
      'Leave both link delays at 80 ms and uplink random loss at 2%. Run the fresh experiment and compare Completed in with the 6-second deadline.'
    ],
    explanation:'A sender can have only min(cwnd, receive window) segments outstanding. With a 1,000-byte window and roughly 320 ms round-trip propagation, the baseline sends about one kilobyte per RTT: the 48-kilobyte transfer needs at least 15.36 seconds even before losses and setup. An eight-segment window permits pipelining. TCP still retransmits losses; increasing the window removes the separate flow-control bottleneck. More window is useful only until cwnd or the path becomes the limit.',
    expected:'With receive window 8, the supplied seeded run closes in about 3.85 simulated seconds and delivers every application byte with 2% random loss retained. Other sufficiently large receive windows also pass. Packet drops may remain; a completed transfer above 6 seconds does not pass.'
  },
  'ttl-expiry': {
    program:{node:'ingress',name:'Ingress',source:'when dstPort == 443:\n  set ttl 8\n  forward\notherwise:\n  forward'},
    steps:[
      'Run the original lab first. In Packet trace, look for ttl_expired at Edge and the decreasing TTL values in FORWARD events.',
      'Select Ingress, replace its packet program with the code below, and select Compile & apply.',
      'Keep all links and traffic unchanged. Run for at least three simulated seconds and check the objectives.'
    ],
    explanation:'The original Ingress rule resets TTL to 2. Forwarding through Ingress and Transit consumes that budget, so Edge drops the packet. A TTL of 8 leaves enough hops to reach the server. PacketLab consumes TTL at every forwarding node, including sources and logical switches; this is a teaching simplification.',
    expected:'At least 100 packets arrive, at least 95% are received, and the repaired run has no TTL-expiry drops or injected packets. A full run delivers all 480 packets.'
  },
  'port-policy': {
    program:{node:'core',name:'Core',source:'when dstPort == 443:\n  forward\nwhen dstPort == 23:\n  drop "blocked_port"\notherwise:\n  forward'},
    steps:[
      'Select Core, replace its packet program with the code below, and select Compile & apply.',
      'Keep the original link settings and both traffic flows. Run for at least two simulated seconds.',
      'Use Flow / ports in Packet trace to distinguish delivered port-443 packets from port-23 drops at Core.'
    ],
    explanation:'The router forwards web traffic to port 443 and explicitly drops the legacy service on port 23. The fallback forwards other traffic. Intentional policy drops count toward Dropped, so this mission checks each flow separately instead of requiring zero overall loss.',
    expected:'At least 100 packets are generated, at least 30 web packets arrive without drops, and at least 30 legacy packets are blocked at Core with none delivered.'
  }
});

const escapeHTML=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');

export function renderChallengeSolution(lab) {
  const solution=CHALLENGE_SOLUTIONS[lab.id];
  if(!solution)return '';
  const edits=(solution.edits||[]).map(edit=>`<li>Select the <b>${escapeHTML(edit.name)}</b> link. Set <b>${escapeHTML(edit.label)}</b> to <b>${edit.value===true?'checked':escapeHTML(edit.value)}</b>.</li>`).join('');
  return `<details class="challenge-solution" data-solution="${escapeHTML(lab.id)}" aria-live="off"><summary aria-label="Show solution for ${escapeHTML(lab.title)}">Show solution</summary><div class="solution-body"><p class="solution-intro">${escapeHTML(solution.intro||'One working repair, starting from the original lab network.')}</p><ol>${edits}${solution.steps.map(step=>`<li>${escapeHTML(step)}</li>`).join('')}</ol>${solution.program?`<pre><code>${escapeHTML(solution.program.source)}</code></pre>`:''}<p><b>Why it works</b><br>${escapeHTML(solution.explanation)}</p><p><b>Expected result</b><br>${escapeHTML(solution.expected)}</p></div></details>`;
}
