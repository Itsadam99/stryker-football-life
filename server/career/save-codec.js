// PES 2021 codec ported from the4chancup/pesXdecrypter (public domain).
// MT19937: Copyright 1997–2002 Makoto Matsumoto and Takuji Nishimura.
// Full notices: server/career/THIRD_PARTY.txt (distributed with the app).
const MASTER = Buffer.from('9061d866437724f892bab87121c76063f0919a7ded4780de51f5ddd108fe3284f5099200b23e889feb244305587600229bfeecf6500029d3427550b9ecd2f675', 'hex');
const MAX_BYTES = 64 * 1024 * 1024;

export class MT19937 {
  constructor(key) {
    if (!Array.isArray(key) || !key.length || key.some(n => !Number.isInteger(n) || n < 0 || n > 0xffffffff)) throw new Error('Invalid MT key.');
    const mt = this.mt = new Uint32Array(624);
    mt[0] = 19650218;
    for (let i = 1; i < 624; i++) mt[i] = Math.imul(1812433253, mt[i - 1] ^ (mt[i - 1] >>> 30)) + i;
    let i = 1, j = 0;
    for (let k = Math.max(624, key.length); k; k--) {
      mt[i] = (mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1664525)) + key[j] + j;
      if (++i >= 624) { mt[0] = mt[623]; i = 1; }
      if (++j >= key.length) j = 0;
    }
    for (let k = 623; k; k--) {
      mt[i] = (mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1566083941)) - i;
      if (++i >= 624) { mt[0] = mt[623]; i = 1; }
    }
    mt[0] = 0x80000000;
    this.index = 624;
  }
  next() {
    const mt = this.mt;
    if (this.index === 624) {
      for (let i = 0; i < 624; i++) {
        const y = (mt[i] & 0x80000000) | (mt[(i + 1) % 624] & 0x7fffffff);
        mt[i] = mt[(i + 397) % 624] ^ (y >>> 1) ^ ((y & 1) ? 0x9908b0df : 0);
      }
      this.index = 0;
    }
    let y = mt[this.index++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }
}

function stream(input, key) {
  const rng = new MT19937(Array.from({ length: 16 }, (_, i) => key.readUInt32LE(i * 4)));
  let c0 = rng.next(), c1 = rng.next(), c2 = rng.next(), c3 = rng.next();
  const output = Buffer.alloc(input.length);
  for (let offset = 0; offset < input.length; offset += 4) {
    const c4 = rng.next(), mask = c0 ^ c1 ^ c2 ^ c3 ^ c4;
    if (offset + 4 <= input.length) output.writeUInt32LE((input.readUInt32LE(offset) ^ mask) >>> 0, offset);
    else for (let b = 0; b < input.length - offset; b++) output[offset + b] = input[offset + b] ^ (mask >>> (b * 8));
    c0 = (c1 >>> 15) | (c1 << 17);
    c1 = (c2 << 11) | (c2 >>> 21);
    c2 = (c3 << 7) | (c3 >>> 25);
    c3 = (c4 >>> 13) | (c4 << 19);
  }
  return output;
}

function cryptHeader(input) {
  const key = Buffer.from(input.subarray(256, 320));
  for (let i = 0; i < 64; i++) key[i] ^= MASTER[(i & ~7) + 7 - (i % 8)];
  const output = stream(input, key);
  input.copy(output, 256, 256, 320);
  return output;
}

function rollingKey(header, parameter) {
  const key = Buffer.from(header.subarray(0, 64));
  for (let i = 64; i < 320; i++) key[i % 64] ^= header[i];
  for (let i = 0; i < 64; i += 8) key.writeUInt32LE((key.readUInt32LE(i) ^ parameter) >>> 0, i);
  return key;
}

function sizes(header) {
  const result = [header.readUInt32LE(72), header.readUInt32LE(68), header.readUInt32LE(64), header.readUInt32LE(76) * 2];
  if (result.some(n => n > MAX_BYTES) || result.reduce((a, b) => a + b, 528) > MAX_BYTES) throw new Error('Dimensions de sauvegarde incompatibles.');
  return result;
}

export function decodeSave(input) {
  if (!Buffer.isBuffer(input) || input.length < 528 || input.length > MAX_BYTES) throw new Error('Sauvegarde PES 2021 incomplète ou trop volumineuse.');
  const encryptHeader = cryptHeader(input.subarray(0, 320));
  const header = stream(input.subarray(320, 528), rollingKey(encryptHeader, 208));
  const lengths = sizes(header);
  if (lengths.reduce((a, b) => a + b, 528) !== input.length) throw new Error('Format ou version de sauvegarde incompatible.');
  let offset = 528;
  const result = { encryptHeader, header };
  for (const [i, name] of ['description', 'logo', 'data', 'serial'].entries()) {
    result[name] = stream(input.subarray(offset, offset + lengths[i]), rollingKey(encryptHeader, i));
    offset += lengths[i];
  }
  return result;
}

export function encodeSave(blocks) {
  if (!Buffer.isBuffer(blocks.encryptHeader) || blocks.encryptHeader.length !== 320 || !Buffer.isBuffer(blocks.header) || blocks.header.length !== 208) throw new Error('En-têtes invalides.');
  const header = Buffer.from(blocks.header);
  const names = ['description', 'logo', 'data', 'serial'];
  if (names.some(name => !Buffer.isBuffer(blocks[name])) || blocks.serial.length % 2) throw new Error('Blocs de sauvegarde invalides.');
  [72, 68, 64, 76].forEach((at, i) => header.writeUInt32LE(blocks[names[i]].length / (i === 3 ? 2 : 1), at));
  sizes(header);
  return Buffer.concat([cryptHeader(blocks.encryptHeader), stream(header, rollingKey(blocks.encryptHeader, 208)),
    ...names.map((name, i) => stream(blocks[name], rollingKey(blocks.encryptHeader, i)))]);
}
