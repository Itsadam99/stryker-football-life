import { encodeSave } from '../../server/career/save-codec.js';

export function careerFixture() {
  const data = Buffer.alloc(11516884), description = Buffer.alloc(384);
  data.writeUInt32LE(11, 0); data.writeUInt32LE(80, 4);
  for (const at of [11322908, 11516880]) { data.writeUInt16LE(2025, at); data[at + 2] = 10; data[at + 3] = 24; }
  description.write('Synthetic career');
  description.write('Synthetic Player\nTest FC / League\n24/10/2025', 128);
  for (let slot = 0; slot < 730; slot++) {
    const at = 84 + slot * 1680, coach = 1260084 + slot * 600;
    data.write(`Test FC ${slot}`, at); data.writeUInt32LE(slot, at + 648); data.writeUInt32LE(slot + 1, at + 652);
    data.writeUInt32LE(slot + 1, coach); data.write(`Test Coach ${slot}`, coach + 4);
    for (let r = 0; r < 15; r++) data.writeUInt16LE(65535, at + 744 + r * 20);
    for (const offset of [at + 1116, coach + 60, coach + 220, coach + 380]) {
      for (let phase = 0; phase < 3; phase++) {
        const start = offset + phase * 33;
        Buffer.from([0, 1, 1, 2, 3, 4, 5, 5, 9, 10, 12]).copy(data, start);
        for (let p = 0; p < 11; p++) { data[start + 11 + p * 2] = 3 + p * 4; data[start + 12 + p * 2] = 52; }
      }
      data[offset + 99] = 1;
      for (const field of [140, 142, 143]) data[offset + field] = 8;
    }
  }
  const blocks = { data, description, encryptHeader: Buffer.alloc(320, 47), header: Buffer.alloc(208), logo: Buffer.from('synthetic logo'), serial: Buffer.from('Synthetic', 'utf16le') };
  blocks.header.writeUInt32LE(data.length, 64);
  blocks.header.writeUInt32LE(blocks.logo.length, 68);
  blocks.header.writeUInt32LE(description.length, 72);
  blocks.header.writeUInt32LE(blocks.serial.length / 2, 76);
  return { blocks, encrypted: encodeSave(blocks) };
}

export function addThreeTeamSchedule(blocks) {
  const d = blocks.data;
  d.writeUInt16LE(20, 2040080); d.write('Synthetic League', 2040082);
  for (let i = 0; i < 58; i++) d.writeUInt32LE(i < 6 ? i : 0xffffffff, 2040216 + i * 4);
  [[0, 1], [1, 2], [2, 0], [1, 0], [2, 1], [0, 2]].forEach(([home, away], round) => {
    const at = 2276484 + round * 520;
    for (let position = 0; position < 16; position++) d.fill(255, at + position * 32, at + position * 32 + 16);
    d.writeUInt32LE(home | ((100 + home) << 14), at);
    d.writeUInt32LE(away | ((100 + away) << 14), at + 4);
    d.writeUInt32LE(round, at + 8); d.writeUInt32LE(20 | (round << 16), at + 12);
  });
  for (let slot = 0; slot < 3; slot++) d.writeUInt16LE(20, 84 + slot * 1680 + 744);
  return blocks;
}
