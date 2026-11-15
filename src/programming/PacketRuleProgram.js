// A deliberately small, non-JavaScript packet policy language. Programs are
// parsed into inert data and interpreted against an allow-listed packet view.
// No eval, Function constructor, globals, DOM, network, or object traversal.
const FIELDS=new Set(['flowId','src','dst','srcIP','dstIP','srcPort','dstPort','protocol','ttl','bytes','injected']);
const OPS=new Set(['==','!=','>','>=','<','<=']);

function value(raw,line){
  const text=raw.trim();
  if(/^"(?:[^"\\]|\\.)*"$/.test(text))return JSON.parse(text);
  if(/^-?\d+(?:\.\d+)?$/.test(text))return Number(text);
  if(text==='true'||text==='false')return text==='true';
  if(/^[A-Za-z][\w.-]*$/.test(text))return text;
  throw new SyntaxError(`Line ${line}: invalid value`);
}

function action(text,line){
  if(text==='forward')return {type:'forward'};
  let m=text.match(/^drop(?:\s+(.+))?$/);
  if(m)return {type:'drop',reason:m[1]?String(value(m[1],line)).slice(0,60):'program_drop'};
  m=text.match(/^set\s+ttl\s+(.+)$/);
  if(m){const ttl=value(m[1],line);if(!Number.isInteger(ttl)||ttl<1||ttl>255)throw new SyntaxError(`Line ${line}: TTL must be 1–255`);return {type:'setTTL',ttl};}
  m=text.match(/^inject\s+([^\s]+)\s+(\d+)$/);
  if(m){const bytes=Number(m[2]);if(bytes<64||bytes>9000)throw new SyntaxError(`Line ${line}: injected bytes must be 64–9000`);return {type:'inject',destination:String(value(m[1],line)),bytes};}
  throw new SyntaxError(`Line ${line}: unknown action`);
}

export function compilePacketProgram(source){
  if(typeof source!=='string'||source.length>8000)throw new SyntaxError('Program must be text up to 8,000 characters');
  const blocks=[];let current=null;
  for(const [index,original] of source.split(/\r?\n/).entries()){
    const line=index+1,text=original.trim();
    if(!text||text.startsWith('#'))continue;
    if(text==='otherwise:'){current={condition:null,actions:[]};blocks.push(current);continue;}
    const head=text.match(/^when\s+([A-Za-z][\w]*)\s*(==|!=|>=|<=|>|<)\s*(.+):$/);
    if(head){if(!FIELDS.has(head[1]))throw new SyntaxError(`Line ${line}: field ${head[1]} is not available`);if(!OPS.has(head[2]))throw new SyntaxError(`Line ${line}: invalid operator`);current={condition:{field:head[1],op:head[2],value:value(head[3],line)},actions:[]};blocks.push(current);continue;}
    if(!current)throw new SyntaxError(`Line ${line}: action must follow a when or otherwise block`);
    current.actions.push(action(text,line));
  }
  if(!blocks.length)throw new SyntaxError('Program needs at least one when or otherwise block');
  if(blocks.some(b=>!b.actions.length))throw new SyntaxError('Every block needs at least one action');
  if(blocks.filter(b=>b.condition===null).length>1)throw new SyntaxError('Program can contain only one otherwise block');
  return Object.freeze(blocks.map(b=>Object.freeze({...b,actions:Object.freeze(b.actions)})));
}

function matches(condition,packet){
  if(!condition)return true;
  const left=packet[condition.field],right=condition.value;
  switch(condition.op){case '==':return left===right;case '!=':return left!==right;case '>':return left>right;case '>=':return left>=right;case '<':return left<right;case '<=':return left<=right;default:return false;}
}

export function runPacketProgram(compiled,packet,context){
  const block=compiled.find(b=>b.condition&&matches(b.condition,packet))||compiled.find(b=>b.condition===null);
  if(!block)return {type:'forward'};
  for(const command of block.actions){
    if(command.type==='setTTL'){packet.ttl=command.ttl;continue;}
    if(command.type==='inject'){context.inject(command.destination,command.bytes);continue;}
    if(command.type==='drop')return {type:'drop',reason:command.reason};
    if(command.type==='forward')return {type:'forward'};
  }
  return {type:'forward'};
}
