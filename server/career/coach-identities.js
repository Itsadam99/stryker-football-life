// Stable native IDs are shared by all careers using the same local Coach.bin.
// Career-local "fictional:0" is never a global database identity on its own.
import { readCoachTable, addFictionalCoaches } from './coach-table.js';
import { sha256 } from './bal-adapter.js';

const MAX_IDENTITIES = 5000, FIRST_ID = 2_000_000;
const keyFor = (careerId, identity) => `${careerId}/${identity}`;
function validProfile(value) {
  return value?.kind === 'fictional' && typeof value.identity === 'string' && /^fictional:[A-Za-z0-9:_-]{1,120}$/.test(value.identity)
    && typeof value.name === 'string' && value.name.trim() === value.name && value.name.length > 0
    && Buffer.byteLength(value.name, 'utf8') < 46 && !/[\u0000-\u001f\u007f]/.test(value.name);
}

export function registerCoachIdentities(data, registry, { careerId, profiles, templateId }) {
  if (!/^[a-f0-9]{64}$/.test(careerId || '') || !Array.isArray(profiles) || profiles.length > MAX_IDENTITIES
    || profiles.some(p => !validProfile(p)) || new Set(profiles.map(p => p.identity)).size !== profiles.length) throw new Error('Identités fictives de carrière invalides.');
  const table = readCoachTable(data), output = registry ? structuredClone(registry) : { version: 1, entries: {} };
  if (output.version !== 1 || !output.entries || Array.isArray(output.entries) || Object.keys(output.entries).length > MAX_IDENTITIES) throw new Error('Registre natif des coachs incompatible.');
  const occupied = new Set(table.keys()), registered = new Set(), additions = [], mapping = {};
  for (const [key, entry] of Object.entries(output.entries)) {
    if (!entry || !/^[a-f0-9]{64}$/.test(entry.careerId || '') || key !== keyFor(entry.careerId, entry.identity)
      || !validProfile({ ...entry, kind: 'fictional' }) || !Number.isInteger(entry.id) || entry.id < FIRST_ID || entry.id >= 0xffffffff
      || registered.has(entry.id) || !Number.isInteger(entry.templateId)) throw new Error('Registre natif des coachs endommagé.');
    registered.add(entry.id); occupied.add(entry.id);
    const native = table.get(entry.id);
    if (native && native.name !== entry.name) throw new Error('Un autre mod utilise une identité de coach réservée par Striker.');
    if (!native) additions.push(entry);
  }
  if (!table.has(templateId)) throw new Error('Le modèle de coach natif demandé est absent.');
  let candidate = FIRST_ID;
  for (const profile of profiles) {
    const key = keyFor(careerId, profile.identity), existing = output.entries[key];
    if (existing) {
      if (existing.name !== profile.name) throw new Error('Le nom d’une identité fictive persistante a changé.');
      mapping[profile.identity] = existing.id; continue;
    }
    if (Object.keys(output.entries).length >= MAX_IDENTITIES) throw new Error('La capacité du registre des coachs est atteinte.');
    while (occupied.has(candidate)) candidate++;
    if (candidate >= 0xffffffff) throw new Error('Aucune identité native disponible.');
    const entry = { careerId, identity: profile.identity, name: profile.name, id: candidate, templateId };
    output.entries[key] = entry; additions.push(entry); mapping[profile.identity] = candidate; occupied.add(candidate++);
  }
  let expanded = Buffer.from(data);
  // Rebuild missing entries from every registered career after a base update;
  // existing careers keep exactly the same references and names.
  for (const id of [...new Set(additions.map(e => e.templateId))]) {
    if (!table.has(id)) throw new Error('Le modèle natif d’une carrière enregistrée a disparu.');
    const group = additions.filter(e => e.templateId === id).map(e => ({ kind: 'fictional',
      identity: `fictional:${e.careerId}:${e.identity.slice('fictional:'.length)}`, id: e.id, name: e.name }));
    expanded = addFictionalCoaches(expanded, group, { templateId: id, expectedHash: sha256(expanded) }).data;
  }
  if (!expanded.subarray(0, data.length).equals(data)) throw new Error('La base originale des coachs a été altérée.');
  return { data: expanded, registry: output, mapping, added: additions.length, hash: sha256(expanded),
    catalog: Object.fromEntries([...readCoachTable(expanded)].map(([id, c]) => [id, c.name])) };
}
