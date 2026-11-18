export class Node {
  constructor({ id, type = 'host', name = id, x = 100, y = 100, program = null } = {}) {
    if (!id || !['host','router','switch'].includes(type)) throw new Error('Invalid node');
    Object.assign(this, { id, type, name, x, y, program });
    this.handler = null;
  }
  onPacket(handler) {
    if (this.type === 'host') throw new Error('Only relay nodes can process transit datagrams');
    if (handler !== null && typeof handler !== 'function') throw new TypeError('Expected callback');
    this.handler = handler;
    return this;
  }
  toJSON() { const { id,type,name,x,y,program } = this; return { id,type,name,x,y,...(program ? {program} : {}) }; }
}
