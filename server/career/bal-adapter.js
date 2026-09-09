// Layout observed on FL26 26.2.0.3 BAL saves. Never use these offsets for ML.
// Evidence and independent Python adapter: research/team-identity-probe/.
import { createHash } from 'node:crypto';
import { FORMATIONS, CLUB_PROFILES } from './tactical-data.js';

export const LAYOUT = 'FL26-26.2.0.3-BAL-750-v1';
export const FIELDS = { attacking_style: 99, build_up: 100, attacking_area: 101,
  positioning: 102, defensive_style: 103, containment_area: 104, pressuring: 105,
  support_range: 140, defensive_line: 142, compactness: 143 };
export const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
const utf8 = new TextDecoder('utf-8', { fatal: true });

function text(data, offset, length) {
  const bytes = data.subarray(offset, offset + length), end = bytes.indexOf(0);
  if (bytes.length !== length || end < 0) throw new Error('Champ texte BAL incompatible.');
  return utf8.decode(bytes.subarray(0, end));
}

function validDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 2200 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error('Date de carrière invalide.');
  return date.toISOString().slice(0, 10);
}

export function careerDate(data, description) {
  if (data.length < 11516884 || data.readUInt32LE(0) !== 11 || data.readUInt32LE(4) !== 80 || description.length !== 384) throw new Error('Cette sauvegarde ne correspond pas au format Vers une légende FL26 pris en charge.');
  const copies = [11322908, 11516880].map(at => validDate(data.readUInt16LE(at), data[at + 2], data[at + 3]));
  const line = text(description, 128, 256).trim().split(/\r?\n/).at(-1);
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(line);
  if (!match || copies[0] !== copies[1] || copies[0] !== validDate(+match[3], +match[2], +match[1])) throw new Error('Les dates de la sauvegarde ne concordent pas.');
  return copies[0];
}

export function decodePlan(plan) {
  if (plan.length !== 160) throw new Error('Plan tactique incomplet.');
  for (let phase = 0; phase < 3; phase++) {
    const p = plan.subarray(phase * 33, (phase + 1) * 33);
    if (p[0] !== 0 || p.subarray(0, 11).some(r => r > 12) || p.subarray(11).some(c => c > 127)) throw new Error('Formation native incompatible.');
  }
  const settings = Object.fromEntries(Object.entries(FIELDS).map(([key, at]) => [key, plan[at]]));
  if (Object.entries(settings).some(([key, n]) => FIELDS[key] < 140 ? n > 1 : n < 1 || n > 10)) throw new Error('Consignes natives incompatibles.');
  return settings;
}

export function readCareer(blocks) {
  const { data, description } = blocks, date = careerDate(data, description);
  const teams = [], competitions = {};
  for (let slot = 0; slot < 750; slot++) {
    const at = 84 + slot * 1680, coachAt = 1260084 + slot * 600;
    const name = text(data, at, 70);
    if (!name) continue;
    const coachId = data.readUInt32LE(coachAt), coachName = text(data, coachAt + 4, 46);
    if ((!coachName && coachId !== 0xffffffff) || data.readUInt32LE(at + 648) !== slot || data.readUInt32LE(at + 652) !== coachId) throw new Error('Les références des équipes et entraîneurs ne concordent pas.');
    const offsets = [at + 1116, ...[0, 1, 2].map(i => coachAt + 60 + 160 * i)];
    const plans = offsets.map(o => decodePlan(data.subarray(o, o + 160)));
    const results = [], seen = new Set();
    for (let index = 0; index < 15; index++) {
      const o = at + 744 + index * 20, competitionId = data.readUInt16LE(o);
      if (competitionId === 65535) continue;
      if (seen.has(competitionId)) throw new Error('Résultats de compétition ambigus.');
      seen.add(competitionId);
      const [points, matches, wins, draws, losses] = data.subarray(o + 2, o + 7);
      const record = { slot, competitionId, points, matches, wins, draws, losses,
        goalsFor: data.readUInt32LE(o + 8), goalsAgainst: data.readUInt32LE(o + 12),
        standard: points === 3 * wins + draws && matches === wins + draws + losses };
      results.push(record);
      (competitions[competitionId] ??= { records: [] }).records.push(record);
    }
    teams.push({ slot, name, coachId, coachName, at, coachAt, offsets, plans, results });
  }
  if (teams.length < 700 || new Set(teams.map(t => t.name)).size !== teams.length) throw new Error('Table des équipes incomplète ou ambiguë.');
  for (const group of Object.values(competitions)) {
    const sum = key => group.records.reduce((n, r) => n + r[key], 0);
    group.standard = group.records.every(r => r.standard) && sum('wins') === sum('losses') && sum('draws') % 2 === 0 && sum('goalsFor') === sum('goalsAgainst');
  }
  return { layout: LAYOUT, date, title: text(description, 0, 128), teams, competitions };
}

function group(role) { return role === 0 ? 0 : role <= 3 ? 1 : role <= 8 ? 2 : 3; }
function assignment(plan, targets) {
  const memo = new Map();
  function solve(slot, used) {
    if (slot === 10) return [0, []];
    const key = slot * 1024 + used;
    if (memo.has(key)) return memo.get(key);
    let best = [Infinity, []];
    for (let i = 0; i < 10; i++) {
      if (used & (1 << i)) continue;
      const previous = plan[slot + 1], [role, , x] = targets[i];
      const cost = (previous === role ? 0 : group(previous) === group(role) ? 100 : 1000) + Math.abs(plan[11 + 2 * (slot + 1) + 1] - x);
      const [rest, list] = solve(slot + 1, used | (1 << i));
      if (cost + rest < best[0]) best = [cost + rest, [i, ...list]];
    }
    memo.set(key, best);
    return best;
  }
  return solve(0, 0)[1];
}

export function compilePlan(plan, settings = {}, formation = null) {
  decodePlan(plan);
  const output = Buffer.from(plan);
  for (const [key, value] of Object.entries(settings)) {
    if (!Object.hasOwn(FIELDS, key) || !Number.isInteger(value) || (FIELDS[key] < 140 ? value < 0 || value > 1 : value < 1 || value > 10)) throw new Error('Consigne tactique inconnue ou hors limites.');
    output[FIELDS[key]] = value;
  }
  if (formation !== null) {
    if (!Object.hasOwn(FORMATIONS, formation)) throw new Error('Formation non prise en charge.');
    const targets = FORMATIONS[formation], order = assignment(plan, targets);
    for (let phase = 0; phase < 3; phase++) for (let slot = 1; slot <= 10; slot++) {
      const [role, y, x] = targets[order[slot - 1]], at = phase * 33;
      output[at + slot] = role;
      output[at + 11 + slot * 2] = y + (phase === 1 ? 1 : phase === 2 ? -1 : 0) * (role >= 2 ? 3 : 1);
      output[at + 12 + slot * 2] = x;
    }
  }
  decodePlan(output);
  return output;
}

export function family(s) {
  if (s.attacking_style === 1 && s.build_up === 1) return 'Possession';
  if (s.defensive_style === 1 && s.compactness >= 7) return 'Bloc compact et transitions';
  if (s.build_up === 0) return 'Jeu direct structuré';
  if (s.defensive_style === 0 && s.pressuring === 0) return 'Pressing haut';
  return 'Transitions courtes';
}

export function identityOperations(career) {
  return career.teams.map(team => {
    // Club identity survives future native appointments; coach-specific presets
    // only apply to their matching coach, never overwrite a successor's ideas.
    const profile = CLUB_PROFILES[team.name];
    const authored = profile?.expected_coach === team.coachId ? profile : null;
    return { slot: team.slot, name: team.name, expectedCoach: team.coachId,
      plans: team.plans.map((original, i) => {
        const settings = { ...original };
        if (settings.attacking_style === 1 && settings.build_up === 0) {
          settings.build_up = 1;
          settings.support_range = Math.min(6, settings.support_range);
        }
        const variant = authored ? { ...authored.settings } : null;
        if (variant && i === 2) { variant.defensive_line = Math.max(2, variant.defensive_line - 2); variant.compactness = Math.min(10, variant.compactness + 1); }
        if (variant && i === 3) { variant.defensive_style = 0; variant.pressuring = 0; variant.defensive_line = Math.min(9, variant.defensive_line + 1); }
        return authored ? { settings: variant, formation: authored.formations[i === 0 ? 0 : i - 1] }
          : { settings, formation: null };
      }) };
  });
}

export function applyOperations(blocks, operations, coachCatalog = {}) {
  const career = readCareer(blocks), source = blocks.data, output = Buffer.from(source);
  if (!Array.isArray(operations) || operations.length > 750) throw new Error('Liste d’opérations invalide.');
  const bySlot = new Map(), arrivals = new Set();
  for (const operation of operations) {
    const team = career.teams.find(t => t.slot === operation.slot);
    if (!team || team.name !== operation.name || team.coachId !== operation.expectedCoach || bySlot.has(team.slot)) throw new Error('L’équipe ou son entraîneur a changé. Relancez l’analyse.');
    bySlot.set(team.slot, operation);
    if (operation.newCoach !== undefined) {
      if (arrivals.has(operation.newCoach)) throw new Error('Un entraîneur ne peut pas rejoindre deux équipes.');
      arrivals.add(operation.newCoach);
    }
  }
  for (const id of arrivals) {
    // Every current employer must release this identity in the same transaction.
    // This permits swaps without a transient duplicated native coach.
    if (career.teams.some(t => t.coachId === id && (bySlot.get(t.slot)?.newCoach === undefined || bySlot.get(t.slot).newCoach === id))) throw new Error('Entraîneur natif encore employé par une autre équipe.');
  }
  const allowed = new Set(), touched = new Set();
  const allow = (at, count) => { for (let n = at; n < at + count; n++) allowed.add(n); };
  for (const operation of operations) {
    const team = career.teams.find(t => t.slot === operation.slot);
    if (!team || team.name !== operation.name || team.coachId !== operation.expectedCoach || touched.has(team.slot)) throw new Error('L’équipe ou son entraîneur a changé. Relancez l’analyse.');
    touched.add(team.slot);
    if (operation.newCoach !== undefined) {
      const id = operation.newCoach, name = coachCatalog[id];
      if (!Number.isInteger(id) || id < 0 || id >= 0xffffffff || !Object.hasOwn(coachCatalog, id) || typeof name !== 'string' || !name) throw new Error('Entraîneur natif absent du catalogue.');
      const bytes = Buffer.from(name, 'utf8');
      if (!bytes.length || bytes.length >= 46 || bytes.includes(0)) throw new Error('Nom d’entraîneur incompatible.');
      for (const at of [team.at + 652, team.coachAt]) { output.writeUInt32LE(id, at); allow(at, 4); }
      output.fill(0, team.coachAt + 4, team.coachAt + 50);
      bytes.copy(output, team.coachAt + 4);
      allow(team.coachAt + 4, 46);
    }
    if (operation.plans.length !== 4) throw new Error('Les quatre plans tactiques sont obligatoires.');
    team.offsets.forEach((at, i) => {
      const spec = operation.plans[i], plan = compilePlan(source.subarray(at, at + 160), spec.settings, spec.formation ?? null);
      for (const field of Object.keys(spec.settings || {})) allow(at + FIELDS[field], 1);
      if (spec.formation) for (let phase = 0; phase < 3; phase++) for (let relative = 0; relative < 33; relative++) {
        if (![0, 11, 12].includes(relative)) allow(at + phase * 33 + relative, 1);
      }
      plan.copy(output, at);
    });
  }
  const changes = [];
  for (let at = 0; at < source.length; at++) if (source[at] !== output[at]) {
    if (!allowed.has(at)) throw new Error('Modification imprévue hors des consignes tactiques.');
    changes.push([at, source[at], output[at]]);
  }
  readCareer({ ...blocks, data: output });
  return { blocks: { ...blocks, data: output }, changes, teamCount: touched.size };
}
