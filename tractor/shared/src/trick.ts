import {
  Card, TrumpInfo, GameSettings, Trick, TrickPlay, cardEquals,
} from './types.js';
import {
  getEffectiveSuit, EffectiveSuit, cardOrder,
  getCardsInSuit, groupByFace, sameCardFace,
} from './card.js';
import {
  decomposePlay, TrickComponent, compareComponents, detectTractor, decompBeatsDecomp,
} from './tractor.js';

/**
 * Determine the effective suit of a leading play.
 */
export function getLeadSuit(cards: Card[], trump: TrumpInfo): EffectiveSuit {
  // All cards in a lead should be same effective suit
  return getEffectiveSuit(cards[0], trump);
}

/**
 * Decompose the leading play into its format components.
 */
export function getLeadFormat(
  cards: Card[],
  trump: TrumpInfo,
  settings: GameSettings
): TrickComponent[] {
  return decomposePlay(cards, trump, settings);
}

/**
 * Check if a throw (multi-component lead) is valid.
 * A throw is valid if no single opponent can beat any component using cards in the same suit.
 */
export function isValidThrow(
  cards: Card[],
  leadSuit: EffectiveSuit,
  otherHands: Card[][],
  trump: TrumpInfo,
  settings: GameSettings
): { valid: boolean; failedComponent?: TrickComponent; failedComponents: TrickComponent[]; beatableCards: number } {
  const components = decomposePlay(cards, trump, settings);
  if (components.length <= 1) return { valid: true, failedComponents: [], beatableCards: 0 };

  // Check that all cards are same suit
  if (!cards.every(c => getEffectiveSuit(c, trump) === leadSuit)) {
    return { valid: false, failedComponents: components, beatableCards: cards.length };
  }

  let beatableCards = 0;
  const failedComponents: TrickComponent[] = [];
  for (const component of components) {
    for (const hand of otherHands) {
      const suitCards = getCardsInSuit(hand, leadSuit, trump);
      if (canBeatComponent(component, suitCards, trump, settings)) {
        beatableCards += component.cards.length;
        failedComponents.push(component);
        break; // only count once per component
      }
    }
  }

  return {
    valid: failedComponents.length === 0,
    failedComponent: failedComponents[0],
    failedComponents,
    beatableCards,
  };
}

function canBeatComponent(
  component: TrickComponent,
  availableCards: Card[],
  trump: TrumpInfo,
  settings: GameSettings
): boolean {
  const groups = groupByFace(availableCards);

  if (component.length === 1) {
    // Single group - find a same-size group that beats it
    for (const g of groups) {
      if (g.length >= component.groupSize) {
        const candidate: TrickComponent = {
          cards: g.slice(0, component.groupSize),
          groupSize: component.groupSize,
          length: 1,
        };
        if (compareComponents(candidate, component, trump) > 0) return true;
      }
    }
    return false;
  }

  // Tractor - find a tractor of same format that beats it
  const eligibleGroups = groups.filter(g => g.length >= component.groupSize);
  const trimmed = eligibleGroups.map(g => g.slice(0, component.groupSize));

  // Try all combinations of the right length
  for (const combo of combinations(trimmed, component.length)) {
    const tractor = detectTractor(combo, trump, settings);
    if (tractor && compareComponents(tractor, component, trump) > 0) {
      return true;
    }
  }

  return false;
}

function* combinations<T>(arr: T[], k: number): Generator<T[]> {
  if (k === 0) { yield []; return; }
  for (let i = 0; i <= arr.length - k; i++) {
    for (const rest of combinations(arr.slice(i + 1), k - 1)) {
      yield [arr[i], ...rest];
    }
  }
}

/**
 * Format-coverage scoring for follow validation.
 *
 * A follow must match the lead format "as well as the hand allows"
 * (robertying rules progression: full tractors first, then partial tractors,
 * then tuples/pairs, then free cards). WHICH tuples/tractors the player uses
 * is their choice — only the amount of structure is obligated.
 *
 * Score is lexicographic [S1, S2]:
 *   S1 = total cards placed into tuple slots (pairs/triples of the lead format,
 *        including the pairs inside tractor slots)
 *   S2 = total cards placed into tractor slots as genuine tractors
 */
export function bestFormatScore(
  cards: Card[],
  leadFormat: TrickComponent[],
  trump: TrumpInfo,
  settings: GameSettings
): [number, number] {
  const tractorSlots = leadFormat
    .filter(c => c.length >= 2)
    .sort((a, b) => (b.groupSize * b.length) - (a.groupSize * a.length));
  const groupSlots: number[] = [];
  for (const comp of leadFormat) {
    if (comp.length >= 2) {
      for (let i = 0; i < comp.length; i++) groupSlots.push(comp.groupSize);
    } else if (comp.groupSize >= 2) {
      groupSlots.push(comp.groupSize);
    }
  }
  if (groupSlots.length === 0) return [0, 0];

  let best: [number, number] = [-1, -1];
  const consider = (cand: [number, number]) => {
    if (cand[0] > best[0] || (cand[0] === best[0] && cand[1] > best[1])) best = cand;
  };

  const rec = (remaining: Card[], slotIdx: number, usedSlotSizes: number[], s2: number) => {
    if (slotIdx >= tractorSlots.length) {
      // subtract consumed slots from the group-slot pool (multiset by size)
      const free = [...groupSlots];
      for (const size of usedSlotSizes) {
        const i = free.indexOf(size);
        if (i >= 0) free.splice(i, 1);
      }
      const s1 = usedSlotSizes.reduce((a, b) => a + b, 0) + tupleScore(remaining, free);
      consider([s1, s2]);
      return;
    }
    const slot = tractorSlots[slotIdx];
    // option: leave this tractor slot structurally unfilled
    rec(remaining, slotIdx + 1, usedSlotSizes, s2);
    // options: fill with a genuine tractor of the slot's width, length 2..slot.length
    const groups = groupByFace(remaining)
      .filter(g => g.length >= slot.groupSize)
      .map(g => g.slice(0, slot.groupSize));
    const minLen = Math.max(2, settings.tractorMinLength);
    for (let len = slot.length; len >= minLen; len--) {
      for (const combo of combinations(groups, len)) {
        const tr = detectTractor(combo, trump, settings);
        if (!tr || tr.groupSize !== slot.groupSize || tr.length !== len) continue;
        const rem = removeCardSet(remaining, tr.cards);
        rec(rem, slotIdx + 1, [...usedSlotSizes, ...Array(len).fill(slot.groupSize)], s2 + tr.cards.length);
      }
    }
  };
  rec(cards, 0, [], 0);
  return best;
}

/**
 * Greedy tuple placement: how many cards can fill the given tuple slots,
 * where a slot of size g accepts (up to g) cards from one identical-card group
 * (at least 2 — a lone single fills nothing). Large groups may spill across slots.
 */
function tupleScore(cards: Card[], slots: number[]): number {
  const sizes = groupByFace(cards).map(g => g.length);
  const slotsSorted = [...slots].sort((a, b) => b - a);
  let total = 0;
  for (const slot of slotsSorted) {
    let bi = -1;
    for (let i = 0; i < sizes.length; i++) {
      if (sizes[i] >= 2 && (bi === -1 || sizes[i] > sizes[bi])) bi = i;
    }
    if (bi === -1) break;
    const take = Math.min(slot, sizes[bi]);
    total += take;
    sizes[bi] -= take;
  }
  return total;
}

/**
 * Validate that a player's play is legal given the current trick state.
 */
export function isValidPlay(
  cards: Card[],
  hand: Card[],
  trick: Trick,
  trump: TrumpInfo,
  settings: GameSettings,
  otherHands?: Card[][]
): { valid: boolean; reason?: string; throwPenalty?: number; forcedCards?: Card[] } {
  if (cards.length === 0) return { valid: false, reason: 'Must play at least one card' };

  // Check cards are in hand
  const handCopy = [...hand];
  for (const card of cards) {
    const idx = handCopy.findIndex(h =>
      h.kind === card.kind &&
      (h.kind === 'joker' && card.kind === 'joker' ? h.jokerType === card.jokerType && h.deckIndex === card.deckIndex :
       h.kind === 'suited' && card.kind === 'suited' ? h.suit === card.suit && h.rank === card.rank && h.deckIndex === card.deckIndex : false)
    );
    if (idx < 0) return { valid: false, reason: 'Card not in hand' };
    handCopy.splice(idx, 1);
  }

  // If leading
  if (trick.plays.length === 0) {
    // Single card always valid
    if (cards.length === 1) return { valid: true };

    // Must all be same suit
    const suit = getEffectiveSuit(cards[0], trump);
    if (!cards.every(c => getEffectiveSuit(c, trump) === suit)) {
      return { valid: false, reason: 'All cards in a lead must be the same suit' };
    }

    // Multi-card: check if it's a valid throw
    const components = decomposePlay(cards, trump, settings);
    if (components.length > 1 && otherHands) {
      const throwCheck = isValidThrow(cards, suit, otherHands, trump, settings);
      if (!throwCheck.valid) {
        // Invalid throw: the thrower is forced to lead their weakest beatable component.
        // Point penalty only if the room's throwPenalty setting asks for one.
        const penalty = settings.throwPenalty === 'tenPoints' ? 10 : 0;
        const weakest = throwCheck.failedComponents.reduce((min, comp) => {
          const strength = (c: TrickComponent) => Math.max(...c.cards.map(card => cardOrder(card, trump)));
          return strength(comp) < strength(min) ? comp : min;
        }, throwCheck.failedComponents[0]);
        return {
          valid: false,
          reason: penalty > 0
            ? `Invalid throw: ${throwCheck.beatableCards} beatable card(s) — ${penalty} point penalty, you must lead the beatable component`
            : `Invalid throw: ${throwCheck.beatableCards} beatable card(s) — you must lead the beatable component`,
          throwPenalty: penalty > 0 ? penalty : undefined,
          forcedCards: weakest?.cards,
        };
      }
    }

    return { valid: true };
  }

  // Following - must match card count
  const leadPlay = trick.plays[0];
  if (cards.length !== leadPlay.cards.length) {
    return { valid: false, reason: `Must play exactly ${leadPlay.cards.length} card(s)` };
  }

  // Check suit obligations
  const leadSuit = getLeadSuit(leadPlay.cards, trump);
  const leadFormat = getLeadFormat(leadPlay.cards, trump, settings);
  const suitCards = getCardsInSuit(hand, leadSuit, trump);

  if (suitCards.length === 0) {
    // Void - can play anything
    return { valid: true };
  }

  // Must play cards from the led suit as much as possible
  const playedInSuit = cards.filter(c => getEffectiveSuit(c, trump) === leadSuit);

  if (suitCards.length >= cards.length) {
    // Has enough cards in suit - must play all from that suit
    if (playedInSuit.length < cards.length) {
      return { valid: false, reason: 'Must play cards from the led suit' };
    }

    // Must match the lead format as well as the hand allows (tractors, then
    // pairs/tuples). Which specific tuples are used is the player's choice.
    const [maxS1, maxS2] = bestFormatScore(suitCards, leadFormat, trump, settings);
    if (maxS1 > 0 || maxS2 > 0) {
      const [gotS1, gotS2] = bestFormatScore(cards, leadFormat, trump, settings);
      if (gotS1 < maxS1) {
        return { valid: false, reason: 'Must match the lead format with your available cards (e.g. play pairs before singles)' };
      }
      if (gotS2 < maxS2) {
        return { valid: false, reason: 'Must play your matching tractor(s) to follow this lead' };
      }
    }
  } else {
    // Not enough - must play all suit cards
    if (playedInSuit.length < suitCards.length) {
      return { valid: false, reason: 'Must play all cards from the led suit first' };
    }
  }

  return { valid: true };
}

/**
 * Get the shared effective suit of a play's cards, or null if cards have mixed effective suits.
 * A play can only win a trick if all its cards share a single effective suit.
 */
export function playEffectiveSuit(cards: Card[], trump: TrumpInfo): EffectiveSuit | null {
  if (cards.length === 0) return null;
  const suit = getEffectiveSuit(cards[0], trump);
  for (let i = 1; i < cards.length; i++) {
    if (getEffectiveSuit(cards[i], trump) !== suit) return null;
  }
  return suit;
}

function cardFaceKey(c: Card): string {
  if (c.kind === 'joker') return `J:${c.jokerType}`;
  return `S:${c.suit}:${c.rank}`;
}

function removeCardSet(cards: Card[], toRemove: Card[]): Card[] {
  const result = [...cards];
  for (const rm of toRemove) {
    const idx = result.findIndex(c => cardEquals(c, rm));
    if (idx >= 0) result.splice(idx, 1);
  }
  return result;
}

/**
 * Enumerate every way to decompose `cards` into components that structurally
 * match `leadFormat` (same multiset of (groupSize, length) types).
 *
 * Yields canonical component arrays. A longer tractor in the hand may be
 * "sliced" to fill a shorter tractor slot plus additional pair slots.
 */
export function* enumerateMatchingDecompositions(
  cards: Card[],
  leadFormat: TrickComponent[],
  trump: TrumpInfo,
  settings: GameSettings
): Generator<TrickComponent[]> {
  const slots = [...leadFormat].sort((a, b) =>
    (b.groupSize * b.length) - (a.groupSize * a.length) ||
    b.groupSize - a.groupSize ||
    b.length - a.length
  );
  yield* decomposeForSlots(cards, slots, 0, [], trump, settings);
}

function* decomposeForSlots(
  remaining: Card[],
  slots: TrickComponent[],
  slotIdx: number,
  chosen: TrickComponent[],
  trump: TrumpInfo,
  settings: GameSettings
): Generator<TrickComponent[]> {
  if (slotIdx >= slots.length) {
    if (remaining.length === 0) yield [...chosen];
    return;
  }

  const slot = slots[slotIdx];

  if (slot.length >= 2) {
    // Tractor slot
    const groups = groupByFace(remaining);
    const eligible = groups.filter(g => g.length >= slot.groupSize);
    const trimmed = eligible.map(g => g.slice(0, slot.groupSize));
    for (const combo of combinations(trimmed, slot.length)) {
      const tractor = detectTractor(combo, trump, settings);
      if (!tractor) continue;
      if (tractor.length !== slot.length || tractor.groupSize !== slot.groupSize) continue;
      chosen.push(tractor);
      const newRemaining = removeCardSet(remaining, tractor.cards);
      yield* decomposeForSlots(newRemaining, slots, slotIdx + 1, chosen, trump, settings);
      chosen.pop();
    }
  } else if (slot.groupSize >= 2) {
    // Multi-group (pair, triple, etc.) — not part of a tractor
    const groups = groupByFace(remaining);
    const seen = new Set<string>();
    for (const g of groups) {
      if (g.length < slot.groupSize) continue;
      const key = cardFaceKey(g[0]);
      if (seen.has(key)) continue;
      seen.add(key);
      const picked = g.slice(0, slot.groupSize);
      chosen.push({ cards: [...picked], groupSize: slot.groupSize, length: 1 });
      const newRemaining = removeCardSet(remaining, picked);
      yield* decomposeForSlots(newRemaining, slots, slotIdx + 1, chosen, trump, settings);
      chosen.pop();
    }
  } else {
    // Single slot
    const seen = new Set<string>();
    for (const card of remaining) {
      const key = cardFaceKey(card);
      if (seen.has(key)) continue;
      seen.add(key);
      chosen.push({ cards: [card], groupSize: 1, length: 1 });
      const newRemaining = removeCardSet(remaining, [card]);
      yield* decomposeForSlots(newRemaining, slots, slotIdx + 1, chosen, trump, settings);
      chosen.pop();
    }
  }
}

/**
 * Check if the cards admit at least one decomposition matching the lead format.
 */
export function canMatchLeadFormat(
  cards: Card[],
  leadFormat: TrickComponent[],
  trump: TrumpInfo,
  settings: GameSettings
): boolean {
  for (const _ of enumerateMatchingDecompositions(cards, leadFormat, trump, settings)) {
    return true;
  }
  return false;
}

/**
 * Check if the challenger play beats the winner play, assuming both share the same
 * trump status (both trump, or both the lead's non-trump suit).
 *
 * Challenger wins iff there exists a structurally-matching decomposition of the
 * challenger that beats every structurally-matching decomposition of the winner.
 */
export function playBeatsPlay(
  challenger: Card[],
  winner: Card[],
  leadFormat: TrickComponent[],
  trump: TrumpInfo,
  settings: GameSettings
): boolean {
  const winnerDecomps = [...enumerateMatchingDecompositions(winner, leadFormat, trump, settings)];
  if (winnerDecomps.length === 0) return true;

  for (const cDecomp of enumerateMatchingDecompositions(challenger, leadFormat, trump, settings)) {
    let beatsEvery = true;
    for (const wDecomp of winnerDecomps) {
      if (!decompBeatsDecomp(cDecomp, wDecomp, trump)) {
        beatsEvery = false;
        break;
      }
    }
    if (beatsEvery) return true;
  }
  return false;
}

/**
 * Determine the winner of a completed trick.
 * Returns the index into trick.plays of the winning play.
 *
 * Rules:
 *   - A play can only win if all its cards share one effective suit.
 *   - Its cards must admit a decomposition structurally matching the lead.
 *   - Non-trump off-suit plays never win; trump plays beat non-trump plays
 *     whenever they structurally match the lead.
 *   - Within the same trump status, the challenger must strictly beat the
 *     current winner in every component type (highest-per-type comparison).
 */
export function determineTrickWinner(
  trick: Trick,
  trump: TrumpInfo,
  settings: GameSettings
): number {
  if (trick.plays.length === 0) return 0;

  const leadPlay = trick.plays[0];
  const leadSuit = getLeadSuit(leadPlay.cards, trump);
  const leadFormat = decomposePlay(leadPlay.cards, trump, settings);

  let winnerIdx = 0;

  for (let i = 1; i < trick.plays.length; i++) {
    const play = trick.plays[i];
    const playSuit = playEffectiveSuit(play.cards, trump);
    if (playSuit === null) continue;

    if (leadSuit === 'trump') {
      if (playSuit !== 'trump') continue;
    } else if (playSuit !== leadSuit && playSuit !== 'trump') {
      continue;
    }

    if (!canMatchLeadFormat(play.cards, leadFormat, trump, settings)) continue;

    const winner = trick.plays[winnerIdx];
    const winnerSuit = playEffectiveSuit(winner.cards, trump);
    const winnerIsTrump = winnerSuit === 'trump';
    const playIsTrump = playSuit === 'trump';

    if (playIsTrump && !winnerIsTrump) {
      winnerIdx = i;
    } else if (!playIsTrump && winnerIsTrump) {
      continue;
    } else if (playBeatsPlay(play.cards, winner.cards, leadFormat, trump, settings)) {
      winnerIdx = i;
    }
  }

  return winnerIdx;
}
