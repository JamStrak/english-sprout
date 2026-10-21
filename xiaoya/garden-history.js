import {EVENTS} from './content.js';

// The retired pot garden is an archive only. Never write, migrate balances or
// replay rewards into it; its completed rounds still count as past practice.
export const LEGACY_GARDEN_KEY = 'xiaoya-english:garden:v1';
const eventIds = new Set(EVENTS.map(event => event.id));
const fail = () => { throw new Error('历史花园记录无法读取，请先导出原记录。'); };

export function readGardenHistory(raw) {
  if (raw === null) return {archive:null,rounds:[]};
  let archive;
  try { archive = JSON.parse(raw); } catch { fail(); }
  if (!archive || archive.schemaVersion !== 1 || archive.product !== 'xiaoya-english-garden' || !Array.isArray(archive.rounds)) fail();
  const known = new Set();
  const rounds = archive.rounds.map(round => {
    if (!round || Object.keys(round).length !== 3 || typeof round.roundId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(round.roundId) || ['constructor','prototype','__proto__'].includes(round.roundId) || known.has(round.roundId) || !eventIds.has(round.eventId) || typeof round.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(round.date)) fail();
    const [year,month,day] = round.date.split('-').map(Number), date = new Date(Date.UTC(year,month-1,day));
    if (year < 2000 || year > 2199 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month-1 || date.getUTCDate() !== day) fail();
    known.add(round.roundId);
    return {roundId:round.roundId,eventId:round.eventId,date:round.date};
  });
  return {archive,rounds};
}
