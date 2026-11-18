// A larger starting experiment; the small examples remain available for lessons.
export function campusNetworkModel() {
  const nodes=[
    {id:'h1',type:'host',name:'Design lab',x:70,y:80},
    {id:'h3',type:'host',name:'Library',x:70,y:280},
    {id:'h4',type:'host',name:'Engineering',x:70,y:490},
    {id:'s1',type:'switch',name:'Access A',x:260,y:160},
    {id:'s3',type:'switch',name:'Access B',x:260,y:490},
    {id:'r1',type:'router',name:'R1',x:450,y:100},
    {id:'r2',type:'router',name:'R2',x:450,y:470},
    {id:'r3',type:'router',name:'Core A',x:650,y:200},
    {id:'r4',type:'router',name:'Core B',x:650,y:420},
    {id:'r5',type:'router',name:'Edge A',x:850,y:100},
    {id:'r6',type:'router',name:'Edge B',x:850,y:470},
    {id:'s2',type:'switch',name:'Services',x:1020,y:290},
    {id:'h2',type:'host',name:'Web server',x:1150,y:90},
    {id:'h5',type:'host',name:'File server',x:1150,y:490},
    {id:'h6',type:'host',name:'Branch office',x:850,y:600}
  ];
  const link=(id,a,b,bw=40,delay=18)=>({id,a,b,bw,delay,loss:0,queue:80,weight:delay+1,enabled:true});
  return {version:1,canvas:{width:1240,height:690},nodes,links:[
    link('design-access','h1','s1'),link('library-access','h3','s1'),link('engineering-access','h4','s3'),
    link('access-a-r1','s1','r1'),link('access-b-r2','s3','r2'),
    link('r1-core-a','r1','r3',15,26),link('r1-core-b','r1','r4',30,42),
    link('r2-core-b','r2','r4',30,22),link('core-cross','r3','r4',40,25),
    link('core-a-edge','r3','r5',25,22),link('core-b-edge','r4','r6',35,22),
    link('edge-a-services','r5','s2',25,26),link('edge-b-services','r6','s2',35,30),
    link('web-access','s2','h2'),link('files-access','s2','h5'),{...link('branch-access','r6','h6',10,35),labelX:100}
  ],flows:[
    {id:'design-web',src:'h1',dst:'h2',srcPort:49152,dstPort:443,pps:36,bytes:1000,start:0,duration:12},
    {id:'library-web',src:'h3',dst:'h2',srcPort:49153,dstPort:443,pps:24,bytes:800,start:1,duration:11},
    {id:'engineering-files',src:'h4',dst:'h5',srcPort:49154,dstPort:445,pps:30,bytes:1200,start:2,duration:10},
    {id:'branch-web',src:'h6',dst:'h2',srcPort:49155,dstPort:443,pps:18,bytes:700,start:3,duration:9}
  ],tcpFlows:[],algorithm:'dijkstra',routing:'delay'};
}
