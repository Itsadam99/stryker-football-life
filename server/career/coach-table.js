// Native Coach.bin is supplied locally; never redistribute the game's table.
// Layout cross-checked against FL26 data_s25262b and pes-db-generator.
import { sha256 } from './bal-adapter.js';

const SIZE = 100;
const decoder = new TextDecoder('utf-8', { fatal: true });

function readName(bytes) {
  const end = bytes.indexOf(0);
  if (end < 0) throw new Error('Nom natif sans terminaison.');
  return decoder.decode(bytes.subarray(0, end));
}

export function readCoachTable(data) {
  if (!Buffer.isBuffer(data) || !data.length || data.length % SIZE || data.length > 5_000_000) throw new Error('Table des entraîneurs incompatible.');
  const coaches = new Map();
  for (let offset = 0; offset < data.length; offset += SIZE) {
    const id = data.readUInt32LE(offset), name = readName(data.subarray(offset + 54, offset + 100));
    if (coaches.has(id) || !name) throw new Error('Identité native absente ou dupliquée.');
    coaches.set(id, { id, name, nativeMetadata: data.readUInt32LE(offset + 4), offset });
  }
  return coaches;
}

export function addFictionalCoaches(data, profiles, { templateId, expectedHash }) {
  if (sha256(data) !== expectedHash) throw new Error('La base des entraîneurs a changé.');
  const catalog = readCoachTable(data), template = catalog.get(templateId);
  if (!template || !Array.isArray(profiles) || !profiles.length || profiles.length > 5000) throw new Error('Modèle natif et profils explicites obligatoires.');
  const additional = [], mapping = {}, ids = new Set(catalog.keys()), identities = new Set();
  for (const profile of profiles) {
    const { id, name, identity, kind } = profile;
    const encoded = Buffer.from(typeof name === 'string' ? name : '', 'utf8');
    if (kind !== 'fictional' || typeof identity !== 'string' || !identity.startsWith('fictional:') || identities.has(identity)
      || !Number.isInteger(id) || id <= 0 || id >= 0xffffffff || ids.has(id) || !encoded.length || encoded.length >= 46 || encoded.includes(0)) throw new Error('Nouveau coach fictif invalide ou identité déjà utilisée.');
    // Preserve the native template's four metadata bytes (packed fields).
    // IDs and both localized name fields are the only changed parts.
    const record = Buffer.from(data.subarray(template.offset, template.offset + SIZE));
    record.writeUInt32LE(id, 0);
    record.fill(0, 8, SIZE);
    encoded.copy(record, 8); encoded.copy(record, 54);
    additional.push(record); ids.add(id); identities.add(identity); mapping[identity] = id;
  }
  const output = Buffer.concat([data, ...additional]);
  const verified = readCoachTable(output);
  if (verified.size !== catalog.size + profiles.length || !output.subarray(0, data.length).equals(data)) throw new Error('Échec de vérification de la table étendue.');
  return { data: output, mapping, catalog: Object.fromEntries([...verified].map(([id, c]) => [id, c.name])),
    report: { originalCoaches: catalog.size, addedCoaches: profiles.length, originalSha256: expectedHash, outputSha256: sha256(output),
      templateId, inheritedNativeMetadata: template.nativeMetadata, nativeGameValidation: false } };
}
