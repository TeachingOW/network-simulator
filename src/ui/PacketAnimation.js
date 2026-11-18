const MIN_VISIBLE_REAL_MS = 140;

export function packetAnimationState(flight, simulationTime, speed = 1) {
  const rate = Number.isFinite(Number(speed))
    ? Math.max(0.1, Math.min(100, Number(speed)))
    : 1;
  const propagationTime = Math.max(0, flight.end - flight.start);
  const visibleTime = Math.max(propagationTime, MIN_VISIBLE_REAL_MS * rate);
  const visualEnd = flight.start + visibleTime;
  if (simulationTime < flight.start || simulationTime > visualEnd) return null;
  const raw = Math.max(0, Math.min(1, (simulationTime - flight.start) / visibleTime));
  return {raw, progress: raw * raw * (3 - 2 * raw)};
}

// Animation has its own pauseable clock. Protocol time can stop at the last
// event while visible packets finish their journeys. Per-packet tails preserve
// hop order even when many short hops occur within a single simulation frame.
export class PacketAnimator {
  constructor() { this.reset(); }
  reset() {
    this.time=0;this.flights=[];this.drops=[];
    this.seenFlights=new WeakSet();this.seenDrops=new WeakSet();this.tails=new Map();
  }
  observe(flights, drops=[], speed=1) {
    const rate=Math.max(.1,Number(speed)||1);
    for(const flight of flights) {
      if(this.seenFlights.has(flight))continue;
      this.seenFlights.add(flight);
      if(!this.tails.has(flight.packet) && this.tails.size>=96)continue;
      const start=Math.max(this.time,this.tails.get(flight.packet)||0);
      const end=start+Math.max(MIN_VISIBLE_REAL_MS,(flight.end-flight.start)/rate);
      this.flights.push({...flight,start,end});
      this.tails.set(flight.packet,end);
    }
    for(const drop of drops) {
      if(this.seenDrops.has(drop))continue;
      this.seenDrops.add(drop);
      // A drop at a downstream node appears after the packet reaches that node.
      const start=Math.max(this.time,this.tails.get(drop.packet)||0);
      if(this.drops.length<80)this.drops.push({...drop,start,end:start+450});
    }
  }
  tick(milliseconds) {
    this.time+=Math.max(0,milliseconds);
    this.flights=this.flights.filter(f=>f.end>this.time);
    this.drops=this.drops.filter(d=>d.end>this.time);
    for(const [packet,end] of this.tails)if(end<=this.time)this.tails.delete(packet);
  }
  get pending() { return this.flights.length>0 || this.drops.length>0; }
  sample(limit=48) {
    return this.flights.filter(f=>f.start<=this.time).slice(-limit).map(f=>({
      flight:f,state:packetAnimationState(f,this.time,1)
    }));
  }
  sampleDrops() {
    return this.drops.filter(d=>d.start<=this.time).slice(-16).map(d=>({...d,age:this.time-d.start}));
  }
}
