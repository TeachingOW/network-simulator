// Deliberately broken student exercise. Keep diagnosis/repair values out of the
// student-facing copy so learners must use the simulator's evidence.
export const CONFIGURATION_CHALLENGE_ID = 'slow-campus-network';

export function configurationChallengeModel() {
  return {
    version:1,
    challenge:CONFIGURATION_CHALLENGE_ID,
    nodes:[
      {id:'labA',type:'host',name:'Lab A',x:80,y:125},
      {id:'labB',type:'host',name:'Lab B',x:80,y:380},
      {id:'r1',type:'router',name:'R1',x:300,y:125},
      {id:'r2',type:'router',name:'R2',x:535,y:80},
      {id:'r3',type:'router',name:'R3',x:535,y:350},
      {id:'server',type:'host',name:'Application Server',x:875,y:215}
    ],
    links:[
      {id:'lab-a-r1',a:'labA',b:'r1',bw:20,delay:4,loss:0,queue:60,weight:1,enabled:true},
      {id:'r1-r2',a:'r1',b:'r2',bw:1,delay:8,loss:0,queue:8,weight:1,enabled:true},
      {id:'r2-server',a:'r2',b:'server',bw:1,delay:8,loss:0,queue:8,weight:1,enabled:true},
      {id:'r1-r3',a:'r1',b:'r3',bw:20,delay:14,loss:0,queue:80,weight:30,enabled:true},
      {id:'lab-b-r3',a:'labB',b:'r3',bw:20,delay:4,loss:0,queue:60,weight:1,enabled:true},
      {id:'r3-server',a:'r3',b:'server',bw:20,delay:14,loss:0,queue:80,weight:30,enabled:true}
    ],
    flows:[
      {id:'lab-a-load',src:'labA',dst:'server',srcPort:49152,dstPort:443,pps:220,bytes:1000,start:0,duration:15},
      {id:'lab-b-check',src:'labB',dst:'server',srcPort:49153,dstPort:443,pps:20,bytes:700,start:0,duration:15}
    ],
    tcpFlows:[],routing:'custom',algorithm:'dijkstra'
  };
}

export function configurationChallengeProgress(model, path, sim) {
  const active = model?.challenge === CONFIGURATION_CHALLENGE_ID;
  const preserved = active && ['r1-r2','r2-server','r1-r3','r3-server']
    .every(id => model.links.some(link => link.id === id && link.enabled));
  const repairedRoute = active && path?.nodes?.includes('r3') && !path.nodes.includes('r2');
  // A live Simulator exposes `sent`; run() summaries expose `generated`.
  const generated = Number(sim?.sent ?? sim?.generated ?? 0);
  const tested = generated >= 100;
  const healthyRun = tested && Number(sim?.dropped || 0) / (generated || 1) <= 0.02;
  return {active,preserved,repairedRoute,tested,healthyRun,complete:preserved&&repairedRoute&&healthyRun};
}
