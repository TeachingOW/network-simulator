// Defines a stream of synthetic, independent datagrams.
export class DatagramGenerator {
  constructor(source,destination,options={}) {
    this.id=options.id||'f1';
    this.src=typeof source==='string'?source:source?.id;
    this.dst=typeof destination==='string'?destination:destination?.id;
    this.pps=Number(options.pps??options.rate??100);
    this.bytes=Number(options.bytes??options.packetSize??1024);
    this.start=Number(options.start??0);
    this.duration=Number(options.duration??10);
    if(!this.src||!this.dst||this.src===this.dst||!(this.pps>0)||!(this.bytes>0)||
       !(this.duration>0)||this.start<0||![this.pps,this.bytes,this.duration,this.start].every(Number.isFinite))
      throw new RangeError('Invalid datagram generator configuration');
  }
  toJSON() {const {id,src,dst,pps,bytes,start,duration}=this;return {id,src,dst,pps,bytes,start,duration};}
}
