// Small IPv4 address/CIDR utility. All integer addresses are unsigned 32-bit.
export function parseIPv4(value) {
  if(typeof value!=='string'||!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value))
    throw new TypeError('Invalid dotted IPv4 address: '+String(value));
  const parts=value.split('.').map(Number);
  if(parts.some(n=>n>255))throw new RangeError('IPv4 octet is out of range');
  return (((parts[0]*0x1000000)+(parts[1]<<16)+(parts[2]<<8)+parts[3])>>>0);
}
export function formatIPv4(num) {
  if(!Number.isInteger(num)||num<0||num>0xffffffff)throw new RangeError('IPv4 address out of range');
  return [num>>>24,(num>>>16)&255,(num>>>8)&255,num&255].join('.');
}
export function prefixMask(length) {
  if(!Number.isInteger(length)||length<0||length>32)throw new RangeError('IPv4 prefix length must be 0–32');
  return length===0?0:(0xffffffff<<(32-length))>>>0;
}
export function parseCIDR(cidr) {
  if(typeof cidr!=='string'||!cidr.includes('/'))throw new TypeError('CIDR requires address/prefix');
  const [ip,len,...extra]=cidr.split('/');
  if(extra.length||!/^(?:0|[1-9]\d?)$/.test(len))throw new TypeError('Invalid prefix length');
  const length=Number(len),mask=prefixMask(length);
  const network=(parseIPv4(ip)&mask)>>>0;
  return {network,length,mask,cidr:formatIPv4(network)+'/'+length};
}
export function cidrContains(cidr,address) {
  const {network,mask}=typeof cidr==='string'?parseCIDR(cidr):cidr;
  const ip=typeof address==='string'?parseIPv4(address):address;
  return ((ip&mask)>>>0)===network;
}
