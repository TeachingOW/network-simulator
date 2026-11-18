// Compress empty retry waits in wall-clock playback. Events still run at their
// scheduled simulated times, in their original order, with the same random loss.
export function playbackAdvance(sim, elapsedMs, speed=1, {skipIdle=true,animationPending=false}={}) {
  sim.discardInactiveTimers();
  const rate=Math.max(.1,Number(speed)||1);
  const target=sim.now+elapsedMs*rate;
  const next=sim.heap.peek();
  const normal={target,skippedMs:0};
  if(!skipIdle || animationPending || next?.type!=='tcp_timeout' || next.at-target<=250*rate)return normal;
  if(sim.flight.some(flight=>flight.end>sim.now))return normal;
  for(const queue of sim.queues.values())if(queue.busy||queue.waiting.length)return normal;
  return {target:next.at,skippedMs:next.at-target};
}
