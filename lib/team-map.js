import { TEAMS } from './load-data.js';

const ALIASES = {
  mexico: 'mexico',
  'south africa': 'south-africa',
  'south korea': 'korea-republic',
  'korea republic': 'korea-republic',
  czechia: 'czechia',
  'czech republic': 'czechia',
  usa: 'usa',
  'united states': 'usa',
  'u.s.': 'usa',
  'bosnia and herzegovina': 'bosnia-herzegovina',
  'bosnia-herzegovina': 'bosnia-herzegovina',
  'ivory coast': 'ivory-coast',
  "cote d'ivoire": 'ivory-coast',
  'cape verde': 'cape-verde',
  'saudi arabia': 'saudi-arabia',
  'new zealand': 'new-zealand',
  'dr congo': 'congo-dr',
  'democratic republic of congo': 'congo-dr',
  'congo dr': 'congo-dr',
  netherlands: 'netherlands',
  holland: 'netherlands',
  turkiye: 'turkiye',
  turkey: 'turkiye',
  curacao: 'curacao',
  'curaçao': 'curacao',
  uzbekistan: 'uzbekistan',
  panama: 'panama',
  england: 'england',
  scotland: 'scotland',
};

function normalize(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NAME_TO_ID = {};

Object.entries(TEAMS).forEach(([id, team]) => {
  NAME_TO_ID[normalize(team.name)] = id;
  NAME_TO_ID[normalize(id.replace(/-/g, ' '))] = id;
});

Object.entries(ALIASES).forEach(([alias, id]) => {
  NAME_TO_ID[normalize(alias)] = id;
});

export function espnNameToTeamId(displayName) {
  const key = normalize(displayName);
  return NAME_TO_ID[key] || ALIASES[key] || null;
}

export function teamIdToName(id) {
  return TEAMS[id]?.name || id;
}
