/**
 * Audit helpers: card constructors + assertion framework.
 * Results are tagged so the report can separate rule violations from passes.
 */
import { Card, Suit, Rank, JokerType, TrumpInfo, GameSettings, defaultSettings } from '../shared/src/types.js';

const SUIT_MAP: Record<string, Suit> = { S: Suit.Spades, H: Suit.Hearts, D: Suit.Diamonds, C: Suit.Clubs };
const RANK_MAP: Record<string, Rank> = {
  '2': Rank.Two, '3': Rank.Three, '4': Rank.Four, '5': Rank.Five, '6': Rank.Six,
  '7': Rank.Seven, '8': Rank.Eight, '9': Rank.Nine, '10': Rank.Ten, T: Rank.Ten,
  J: Rank.Jack, Q: Rank.Queen, K: Rank.King, A: Rank.Ace,
};

/** C('AS') -> ace of spades deck 0; C('AS', 1) -> deck 1; C('BJ') / C('LJ') -> jokers */
export function C(spec: string, deckIndex = 0): Card {
  if (spec === 'BJ') return { kind: 'joker', jokerType: JokerType.Big, deckIndex };
  if (spec === 'LJ') return { kind: 'joker', jokerType: JokerType.Little, deckIndex };
  const suit = SUIT_MAP[spec[spec.length - 1]];
  const rank = RANK_MAP[spec.slice(0, -1)];
  if (!suit || !rank) throw new Error(`Bad card spec: ${spec}`);
  return { kind: 'suited', suit, rank, deckIndex };
}

/** CC('AS AS:1 KS BJ') -> array; ":n" suffix = deckIndex */
export function CC(specs: string): Card[] {
  return specs.trim().split(/\s+/).map(s => {
    const [face, di] = s.split(':');
    return C(face, di ? parseInt(di, 10) : 0);
  });
}

export function trump(rankSpec: string, suitSpec: string | null): TrumpInfo {
  return {
    trumpRank: RANK_MAP[rankSpec],
    trumpSuit: suitSpec ? SUIT_MAP[suitSpec] : null,
  };
}

export function settings(overrides: Partial<GameSettings> = {}): GameSettings {
  return { ...defaultSettings(4), ...overrides };
}

// ---- result collection ----
export interface CheckResult {
  id: string;
  desc: string;
  status: 'RULE-OK' | 'BUG' | 'INFO';
  detail?: string;
}
export const results: CheckResult[] = [];

/**
 * check: assert `actual` matches what the RULES say should happen.
 * If it matches -> RULE-OK. If not -> BUG (with detail).
 */
export function check(id: string, desc: string, actual: unknown, expectedPerRules: unknown, detail?: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expectedPerRules);
  results.push({
    id, desc,
    status: ok ? 'RULE-OK' : 'BUG',
    detail: ok ? undefined : `expected(rules)=${JSON.stringify(expectedPerRules)} actual=${JSON.stringify(actual)}${detail ? ' | ' + detail : ''}`,
  });
}

export function info(id: string, desc: string, detail: string) {
  results.push({ id, desc, status: 'INFO', detail });
}

export function report(title: string) {
  const bugs = results.filter(r => r.status === 'BUG');
  const oks = results.filter(r => r.status === 'RULE-OK');
  const infos = results.filter(r => r.status === 'INFO');
  console.log(`\n===== ${title} =====`);
  console.log(`RULE-OK: ${oks.length}   BUG: ${bugs.length}   INFO: ${infos.length}\n`);
  for (const r of results) {
    if (r.status === 'RULE-OK') console.log(`  [OK]   ${r.id}: ${r.desc}`);
  }
  for (const r of infos) console.log(`  [INFO] ${r.id}: ${r.desc} — ${r.detail}`);
  for (const r of bugs) console.log(`  [BUG]  ${r.id}: ${r.desc}\n         ${r.detail}`);
}
