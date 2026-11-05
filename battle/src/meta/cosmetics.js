// Cosmetics: army colours and hats. They change how your army looks, never
// how it fights. Bought with Jellybeans earned by playing; the Supporter
// items come only from the (optional, cosmetic-only) Supporter Pack.

import { TEAMS } from '../config.js';
import { UNIT_IDS, spendBeans } from './profile.js';

// The units that can wear a hat, in wardrobe order (sim/unit-types.js ids).
export const HAT_UNITS = [
  { id: 'clubber', name: 'Clubber' },
  { id: 'squire', name: 'Squire' },
  { id: 'archer', name: 'Archer' },
  { id: 'spiker', name: 'Spiker' },
  { id: 'bomb', name: 'Bomb' },
  { id: 'brick', name: 'Brick' },
  { id: 'bruiser', name: 'Bruiser' },
  { id: 'megabomb', name: 'Mega Bomb' },
].filter((u) => UNIT_IDS.includes(u.id));

// Every colour stays clearly different from the red enemy.
export const COLORS = [
  { id: 'blue', name: 'Royal Blue', price: 0, pal: TEAMS.blue },
  { id: 'green', name: 'Leaf Green', price: 300, pal: { body: '#3fa34d', shade: '#2a7a37', light: '#73d077', limb: '#35913f', dark: '#1b4d23' } },
  { id: 'purple', name: 'Grape', price: 300, pal: { body: '#8a4fd8', shade: '#6233a8', light: '#b386f2', limb: '#7843c4', dark: '#3d1f6e' } },
  { id: 'teal', name: 'Lagoon', price: 400, pal: { body: '#1fa3a3', shade: '#137878', light: '#5ad4cf', limb: '#1a8f8f', dark: '#0b4a4a' } },
  { id: 'sunny', name: 'Sunny', price: 500, pal: { body: '#f2cf3a', shade: '#c9a218', light: '#ffe887', limb: '#e3bd27', dark: '#7a5c08' } },
  { id: 'charcoal', name: 'Charcoal', price: 600, pal: { body: '#4b5059', shade: '#33363d', light: '#7f8590', limb: '#41454d', dark: '#1f2125' } },
  { id: 'gold', name: 'Supporter Gold', price: 0, supporter: true, pal: { body: '#e0a91c', shade: '#a8780a', light: '#ffd965', limb: '#cc9612', dark: '#5e4104' } },
];

export function colorById(id) {
  return COLORS.find((c) => c.id === id) || COLORS[0];
}

/** The palette your army uses (falls back to blue). */
export function armyPalette(p) {
  const c = colorById(p.equipped.color);
  return p.owned.colors.includes(c.id) ? c.pal : COLORS[0].pal;
}

/**
 * Buy a cosmetic. kind: 'hats' | 'colors'. Returns 'owned' (already had it),
 * 'supporter' (Supporter Pack only), 'poor' (not enough Jellybeans) or 'bought'.
 */
export function buyItem(p, kind, item) {
  if (p.owned[kind].includes(item.id)) return 'owned';
  if (item.supporter && !p.supporter) return 'supporter';
  if (!item.supporter && !spendBeans(p, item.price)) return 'poor';
  p.owned[kind].push(item.id);
  return 'bought';
}

export function equipColor(p, id) {
  if (!p.owned.colors.includes(id)) return false;
  p.equipped.color = id;
  return true;
}

export function equipHat(p, unitId, hatId) {
  if (!UNIT_IDS.includes(unitId) || !p.owned.hats.includes(hatId)) return false;
  const before = p.equipped.hats[unitId];
  p.equipped.hats[unitId] = hatId;
  if (hatId !== 'none' && before !== hatId) p.stats.hatsEquipped++;
  return true;
}

/** Supporter Pack: cosmetic only. (Purchases aren't connected in this prototype.) */
export function grantSupporter(p) {
  p.supporter = true;
  for (const c of COLORS) if (c.supporter && !p.owned.colors.includes(c.id)) p.owned.colors.push(c.id);
  if (!p.owned.hats.includes('goldcrown')) p.owned.hats.push('goldcrown');
}
