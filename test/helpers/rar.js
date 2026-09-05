import { crc32 } from "./zip.js";

// Original, uncompressed RAR 4 fixture. No third-party mod is committed to tests.
export function createRar(entries) {
  const header = (type, size, flags = 0) => {
    const buffer = Buffer.alloc(size);
    buffer[2] = type;
    buffer.writeUInt16LE(flags, 3);
    buffer.writeUInt16LE(size, 5);
    return buffer;
  };
  const checksum = (buffer) => { buffer.writeUInt16LE(crc32(buffer.subarray(2)) & 0xffff, 0); return buffer; };
  const parts = [Buffer.from("526172211a0700", "hex"), checksum(header(0x73, 13))];
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.from(entry.data || "");
    const file = header(0x74, 32 + name.length, 0x8000);
    file.writeUInt32LE(data.length, 7);
    file.writeUInt32LE(data.length, 11);
    file[15] = 2; // Windows
    file.writeUInt32LE(crc32(data), 16);
    file[24] = 20;
    file[25] = 0x30; // store
    file.writeUInt16LE(name.length, 26);
    file.writeUInt32LE(0x20, 28);
    name.copy(file, 32);
    parts.push(checksum(file), data);
  }
  parts.push(checksum(header(0x7b, 7)));
  return Buffer.concat(parts);
}
