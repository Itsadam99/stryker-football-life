// Native fixture evidence: research/team-identity-probe/season_observations.md.
// These are the observed simple leagues, not a list of real-world regulations.
import { createHash } from 'node:crypto';
import { readCareer } from './bal-adapter.js';

export const SIMPLE_LEAGUES = Object.freeze([17, 18, 19, 20, 21, 22, 50, 79, 80, 81, 82, 116, 117, 118]);
const FIRST_COMPETITION = 2040080, FIRST_FIXTURE = 2276484;
const EMPTY = 0xffffffff;
const decoder = new TextDecoder('utf-8', { fatal: true });

export function readLeagueSchedule(blocks, competitionId, career = readCareer(blocks)) {
  if (!SIMPLE_LEAGUES.includes(competitionId)) throw new Error('Cette phase de compétition ne possède pas encore de calendrier pris en charge.');
  const { data } = blocks, anchors = [];
  for (let i = 0; i < 300; i++) if (data.readUInt16LE(FIRST_COMPETITION + i * 788) === competitionId) anchors.push(FIRST_COMPETITION + i * 788);
  if (anchors.length !== 1) throw new Error('Identité de championnat absente ou ambiguë.');
  const at = anchors[0], rawName = data.subarray(at + 2, at + 118), end = rawName.indexOf(0);
  if (end <= 0) throw new Error('Nom de championnat incompatible.');
  const name = decoder.decode(rawName.subarray(0, end)), references = [];
  let terminated = false;
  for (let i = 0; i < 58; i++) {
    const reference = data.readUInt32LE(at + 136 + i * 4);
    if (reference === EMPTY) terminated = true;
    else {
      if (terminated || references.includes(reference)) throw new Error('Références de journées incohérentes.');
      references.push(reference);
    }
  }
  if (!references.length) throw new Error('Le calendrier du championnat est vide.');
  const teams = new Map(), pairs = new Map(), appearances = new Map(), ids = new Set(), fixtures = [];
  const hash = createHash('sha256'), prefix = Buffer.alloc(2); prefix.writeUInt16LE(competitionId); hash.update(prefix);
  references.forEach((reference, round) => {
    const start = FIRST_FIXTURE + reference * 520, playing = new Set();
    if (start + 512 > data.length) throw new Error('Référence de journée hors de la sauvegarde.');
    for (let position = 0; position < 16; position++) {
      const offset = start + position * 32, home = data.readUInt32LE(offset), away = data.readUInt32LE(offset + 4);
      if (home === EMPTY && away === EMPTY) continue;
      const homeSlot = home & 0x3fff, awaySlot = away & 0x3fff;
      if (homeSlot === awaySlot || homeSlot >= 750 || awaySlot >= 750 || playing.has(homeSlot) || playing.has(awaySlot)) throw new Error('Participants de rencontre incohérents.');
      const id = data.readUInt32LE(offset + 8) & 0xffff, flags = data.readUInt32LE(offset + 12);
      if ((flags & 0xffff) !== competitionId || ((flags >>> 16) & 0x3f) !== round || ((flags >>> 22) & 0xf) !== position || id === 65535 || ids.has(id)) throw new Error('Rencontre incompatible avec sa compétition ou sa journée.');
      ids.add(id);
      for (const packed of [home, away]) {
        const slot = packed & 0x3fff, databaseId = packed >>> 14, team = career.teams.find(t => t.slot === slot);
        if (!team || (teams.has(slot) && teams.get(slot).databaseId !== databaseId)) throw new Error('Identité d’équipe incompatible avec le calendrier.');
        teams.set(slot, { slot, name: team.name, databaseId });
        playing.add(slot); appearances.set(slot, (appearances.get(slot) || 0) + 1);
      }
      const pair = `${homeSlot}:${awaySlot}`; pairs.set(pair, (pairs.get(pair) || 0) + 1);
      hash.update(data.subarray(offset, offset + 16));
      fixtures.push({ id, round, homeSlot, awaySlot });
    }
    if (!playing.size) throw new Error('Journée référencée sans rencontre.');
  });
  if (teams.size < 2) throw new Error('Championnat incomplet.');
  for (const home of teams.keys()) for (const away of teams.keys()) if (home !== away && pairs.get(`${home}:${away}`) !== 1) throw new Error('Le programme n’est pas un championnat aller-retour complet.');
  const counts = [...new Set(appearances.values())];
  if (counts.length !== 1) throw new Error('Nombre de rencontres déséquilibré.');
  const group = career.competitions[competitionId], slots = [...teams.keys()].sort((a, b) => a - b);
  if (!group?.standard || group.records.length !== slots.length || group.records.some(r => !teams.has(r.slot) || r.matches > counts[0])) throw new Error('Le classement et le programme de la même sauvegarde ne concordent pas.');
  return { competitionId, name, rounds: references.length, fixtures: fixtures.length, matchesPerTeam: counts[0], teamSlots: slots,
    teams: slots.map(slot => teams.get(slot)), scheduleHash: hash.digest('hex'),
    complete: group.records.every(r => r.matches === counts[0]),
    matchesPlayedMin: Math.min(...group.records.map(r => r.matches)), matchesPlayedMax: Math.max(...group.records.map(r => r.matches)) };
}

export function leagueProgress(blocks, career = readCareer(blocks)) {
  return SIMPLE_LEAGUES.map(competitionId => {
    try { return readLeagueSchedule(blocks, competitionId, career); }
    catch (error) { return { competitionId, supported: false, reason: error.message }; }
  });
}
