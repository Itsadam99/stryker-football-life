import { inflateSync, deflateSync } from 'node:zlib';
const MAGIC = Buffer.from('0010015745535953', 'hex');
const MAX = 32 * 1024 * 1024;

export function unpackDatabase(packed) {
  if (!Buffer.isBuffer(packed) || packed.length < 16 || packed.subarray(3, 8).toString('ascii') !== 'WESYS'
    || packed.readUInt32LE(8) !== packed.length - 16 || packed.readUInt32LE(12) > MAX) throw new Error('Enveloppe de base PES incompatible.');
  const output = inflateSync(packed.subarray(16), { maxOutputLength: MAX });
  if (output.length !== packed.readUInt32LE(12)) throw new Error('Taille de base PES incohérente.');
  return output;
}

export function packDatabase(data, nativeHeader = MAGIC) {
  if (!Buffer.isBuffer(data) || !data.length || data.length > MAX) throw new Error('Taille de base PES invalide.');
  if (!Buffer.isBuffer(nativeHeader) || nativeHeader.length < 8 || nativeHeader.subarray(3, 8).toString('ascii') !== 'WESYS') throw new Error('En-tête PES invalide.');
  const compressed = deflateSync(data), header = Buffer.alloc(16);
  nativeHeader.copy(header, 0, 0, 8); header.writeUInt32LE(compressed.length, 8); header.writeUInt32LE(data.length, 12);
  return Buffer.concat([header, compressed]);
}
