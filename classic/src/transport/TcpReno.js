// Educational TCP Reno: one-direction byte transfer with a genuine simulated
// three-way handshake, cumulative ACKs, byte sequence numbers, cwnd/slow start,
// Reno additive increase/multiplicative decrease, duplicate ACK fast retransmit,
// estimated RTO and timeout retransmissions. Not an RFC-complete TCP stack.
export class TcpRenoConnection {
  constructor(sim,options) {
    this.sim=sim;
    this.id=String(options.id);
    this.src=String(options.src);
    this.dst=String(options.dst);
    this.srcPort=Number(options.srcPort??49152);
    this.dstPort=Number(options.dstPort??80);
    this.bytes=Number(options.bytes);
    this.mss=Number(options.mss??1000);
    this.rwnd=Number(options.rwnd??32);
    this.start=Number(options.start??0);
    this.rto=Number(options.rto??400);
    this.initialRto=this.rto;
    this.initialSsthresh=Number(options.ssthresh??16);
    this.maxRetries=Number(options.maxRetries??20);
    if(!this.id || !this.src || !this.dst || this.src===this.dst ||
       !Number.isInteger(this.bytes)||this.bytes<1||this.bytes>100000000 ||
       !Number.isInteger(this.mss)||this.mss<64||this.mss>9000 ||
       !Number.isInteger(this.rwnd)||this.rwnd<1||this.rwnd>100000 ||
       !Number.isInteger(this.srcPort)||this.srcPort<1||this.srcPort>65535||
       !Number.isInteger(this.dstPort)||this.dstPort<1||this.dstPort>65535||
       !(this.start>=0)||!(this.rto>0)||!(this.initialSsthresh>=2))
      throw new RangeError('Invalid TCP Reno transfer parameters');
    this.reset();
  }
  reset(){
    this.state='CLOSED';
    this.cwnd=1;this.ssthresh=this.initialSsthresh;
    this.nextSeq=1;this.baseSeq=1;
    this.recvNext=1;this.recvBuffer=new Map();
    this.unacked=new Map();
    this.dupAcks=0;this.fastRecovery=false;
    this.retransmissions=0;this.timeouts=0;this.receivedBytes=0;
    this.synRetries=0;this.finRetries=0;
    this.srtt=null;this.rttvar=null;this.rto=this.initialRto;
    this.timerToken=0;
    this.cwndHistory=[{time:0,cwnd:1,ssthresh:this.ssthresh,reason:'initial'}];
    this.lastError=null;
  }
  recordWindow(reason){
    const row={time:this.sim.now/1000,cwnd:this.cwnd,ssthresh:this.ssthresh,reason};
    this.cwndHistory.push(row);
    this.sim.log(null,this.src,'TCP_CWND',`${this.id}: cwnd=${this.cwnd.toFixed(2)} MSS; ssthresh=${this.ssthresh.toFixed(2)}; ${reason}`);
  }
  send(from,to,kind,fields={}){
    this.sim.sendTcpSegment(this,from,to,{kind,...fields});
  }
  armTimer(phase){
    const token=++this.timerToken;
    this.sim.event(this.sim.now+this.rto,'tcp_timeout',{id:this.id,token,phase});
  }
  stopTimer(){this.timerToken++;}
  startTransfer(){
    if(this.state!=='CLOSED')return;
    this.state='SYN_SENT';
    this.sim.log(null,this.src,'TCP_STATE',this.id+': SYN_SENT');
    this.send(this.src,this.dst,'SYN',{seq:0});
    this.armTimer('SYN');
  }
  // A single cumulative receiver; out-of-order bytes buffered until gap filled.
  onSegment(packet,at){
    const seg=packet.tcp;
    if(!seg||seg.connId!==this.id)return;
    if(at===this.dst){
      if(seg.kind==='SYN'){
        this.send(this.dst,this.src,'SYN_ACK',{seq:0,ack:1});
      } else if(seg.kind==='DATA'){
        const length=seg.payloadBytes;
        if(seg.seq===this.recvNext){
          this.recvNext+=length;this.receivedBytes+=length;
          while(this.recvBuffer.has(this.recvNext)){
            const size=this.recvBuffer.get(this.recvNext);
            this.recvBuffer.delete(this.recvNext);
            this.recvNext+=size;this.receivedBytes+=size;
          }
        }else if(seg.seq>this.recvNext && seg.seq<this.recvNext+this.rwnd*this.mss){
          if(!this.recvBuffer.has(seg.seq))this.recvBuffer.set(seg.seq,length);
        }
        this.send(this.dst,this.src,'ACK',{ack:this.recvNext,seq:1});
      } else if(seg.kind==='FIN') {
        this.send(this.dst,this.src,'FIN_ACK',{seq:1,ack:seg.seq+1});
      }
      return;
    }
    if(at!==this.src)return;
    if(seg.kind==='SYN_ACK'&&this.state==='SYN_SENT'){
      this.stopTimer();
      this.state='ESTABLISHED';
      this.sim.log(null,this.src,'TCP_STATE',this.id+': ESTABLISHED');
      this.send(this.src,this.dst,'ACK',{seq:1,ack:1});
      this.sendAvailable();
    }else if(seg.kind==='ACK'&&this.state==='ESTABLISHED'){
      this.onAck(seg.ack);
    }else if(seg.kind==='FIN_ACK'&&this.state==='FIN_WAIT'){
      if(seg.ack===this.bytes+2){
        this.stopTimer();
        this.state='CLOSED';
        this.sim.log(null,this.src,'TCP_STATE',this.id+': CLOSED');
      }
    }
  }
  sendAvailable(){
    if(this.state!=='ESTABLISHED')return;
    const window=Math.max(1,Math.floor(Math.min(this.cwnd,this.rwnd)));
    while(this.unacked.size<window && this.nextSeq<=this.bytes){
      const length=Math.min(this.mss,this.bytes-this.nextSeq+1);
      const seq=this.nextSeq;
      this.nextSeq+=length;
      this.unacked.set(seq,{seq,length,at:this.sim.now,retransmitted:false,retries:0});
      this.send(this.src,this.dst,'DATA',{seq,payloadBytes:length});
    }
    if(this.unacked.size && !this.activeTimer) {
      this.activeTimer=true;this.armTimer('DATA');
    }
    if(this.nextSeq>this.bytes && !this.unacked.size) this.finish();
  }
  onAck(ack){
    if(!Number.isInteger(ack)||ack<1||ack>this.nextSeq)return;
    if(ack>this.baseSeq) {
      this.dupAcks=0;
      const old=this.baseSeq;
      this.baseSeq=ack;
      let acknowledged=0;
      for(const [seq,entry] of this.unacked){
        if(seq+entry.length<=ack){
          acknowledged++;
          if(!entry.retransmitted)this.sampleRtt(this.sim.now-entry.at);
          this.unacked.delete(seq);
        }
      }
      if(this.fastRecovery){
        this.fastRecovery=false;this.cwnd=this.ssthresh;
        this.recordWindow('Reno fast recovery exit');
      }else{
        // cwnd in whole MSS units; slow start is exponential over RTTs.
        for(let i=0;i<acknowledged;i++){
          if(this.cwnd<this.ssthresh)this.cwnd+=1;
          else this.cwnd+=1/this.cwnd;
        }
        this.recordWindow('new ACK '+old+'→'+ack);
      }
      this.activeTimer=false;this.stopTimer();
      this.sendAvailable();
    } else if(ack===this.baseSeq&&this.unacked.size){
      this.dupAcks++;
      if(this.dupAcks===3&&!this.fastRecovery){
        this.ssthresh=Math.max(2,this.cwnd/2);
        this.cwnd=this.ssthresh+3;
        this.fastRecovery=true;
        this.recordWindow('three duplicate ACKs / fast retransmit');
        this.retransmitOldest();
        this.activeTimer=false;this.armTimer('DATA');this.activeTimer=true;
      }else if(this.fastRecovery && this.dupAcks>3){
        this.cwnd+=1;this.sendAvailable();
      }
    }
  }
  sampleRtt(sample){
    if(sample<=0||!Number.isFinite(sample))return;
    if(this.srtt===null){this.srtt=sample;this.rttvar=sample/2;}
    else{this.rttvar=.75*this.rttvar+.25*Math.abs(this.srtt-sample);this.srtt=.875*this.srtt+.125*sample;}
    this.rto=Math.min(60000,Math.max(100,this.srtt+4*this.rttvar));
  }
  retransmitOldest(){
    const entry=this.unacked.values().next().value;
    if(!entry)return false;
    if(++entry.retries>this.maxRetries){
      this.state='FAILED';this.lastError='maximum retransmissions exceeded';
      this.stopTimer();this.sim.log(null,this.src,'TCP_FAIL',this.id+': '+this.lastError);
      return false;
    }
    entry.retransmitted=true;entry.at=this.sim.now;
    this.retransmissions++;
    this.send(this.src,this.dst,'DATA',{seq:entry.seq,payloadBytes:entry.length,retransmit:true});
    return true;
  }
  finish(){
    if(this.state!=='ESTABLISHED')return;
    this.stopTimer();this.activeTimer=false;
    this.state='FIN_WAIT';
    this.sim.log(null,this.src,'TCP_STATE',this.id+': FIN_WAIT');
    this.send(this.src,this.dst,'FIN',{seq:this.bytes+1});
    this.armTimer('FIN');
  }
  onTimeout(token,phase){
    if(token!==this.timerToken)return; // cancelled by a new acknowledgment
    if(phase==='SYN'&&this.state==='SYN_SENT'){
      if(++this.synRetries>this.maxRetries){this.state='FAILED';this.lastError='SYN retry limit';return;}
      this.retransmissions++;this.rto=Math.min(60000,this.rto*2);
      this.send(this.src,this.dst,'SYN',{seq:0,retransmit:true});
      this.armTimer('SYN');
    }else if(phase==='DATA'&&this.state==='ESTABLISHED'&&this.unacked.size){
      this.timeouts++;
      this.ssthresh=Math.max(2,this.cwnd/2);this.cwnd=1;
      this.dupAcks=0;this.fastRecovery=false;
      this.recordWindow('retransmission timeout');
      this.rto=Math.min(60000,this.rto*2);
      if(this.retransmitOldest())this.armTimer('DATA');
    }else if(phase==='FIN'&&this.state==='FIN_WAIT'){
      if(++this.finRetries>this.maxRetries){this.state='FAILED';this.lastError='FIN retry limit';return;}
      this.retransmissions++;this.rto=Math.min(60000,this.rto*2);
      this.send(this.src,this.dst,'FIN',{seq:this.bytes+1,retransmit:true});
      this.armTimer('FIN');
    }
  }
  summary(){
    return {id:this.id,state:this.state,bytesRequested:this.bytes,bytesDelivered:this.receivedBytes,
      retransmissions:this.retransmissions,timeouts:this.timeouts,
      cwnd:this.cwnd,ssthresh:this.ssthresh,srttMs:this.srtt,
      rtoMs:this.rto,cwndHistory:this.cwndHistory.slice()};
  }
}
