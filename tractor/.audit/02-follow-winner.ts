/**
 * Battery 02: follow obligations + trick winner + throw validity vs robertying.com rules.
 */
import { C, CC, trump, settings, check, info, report } from './helpers.js';
import { isValidPlay, determineTrickWinner, isValidThrow, getLeadSuit } from '../shared/src/trick.js';
import { decomposePlay } from '../shared/src/tractor.js';
import { Trick, Card } from '../shared/src/types.js';

const S = settings();
const T = trump('3', 'H'); // trump rank 3, trump suit hearts

function trickWith(lead: Card[], ...follows: Card[][]): Trick {
  const plays = [{ playerIdx: 0, cards: lead }];
  follows.forEach((cards, i) => plays.push({ playerIdx: i + 1, cards }));
  return { leadPlayerIdx: 0, plays, points: 0 };
}

function followCheck(id: string, desc: string, lead: string, hand: string, play: string, expectValid: boolean) {
  const trick = trickWith(CC(lead));
  const res = isValidPlay(CC(play), CC(hand), trick, T, S);
  check(id, desc, res.valid, expectValid, res.reason ? `server said: "${res.reason}"` : undefined);
}

// ---------- A. Follow obligations: pair leads ----------
// Rules: must match the format as best you can within the suit; WHICH pair you use is your choice.
followCheck('FO-1a', 'pair led; holding two pairs in suit, playing the LOWER pair is legal',
  '5D:0 5D:1', '4D:0 4D:1 AD:0 AD:1 7D:0 2C:0', '4D:0 4D:1', true);
followCheck('FO-1b', 'pair led; holding two pairs in suit, playing the HIGHER pair is legal',
  '5D:0 5D:1', '4D:0 4D:1 AD:0 AD:1 7D:0 2C:0', 'AD:0 AD:1', true);
followCheck('FO-1c', 'pair led; hand listed high-to-low: playing the LOWER pair is legal',
  '5D:0 5D:1', 'AD:0 AD:1 4D:0 4D:1 7D:0 2C:0', '4D:0 4D:1', true);
followCheck('FO-2', 'pair led; holding a pair, two suit singles is ILLEGAL (must play a pair)',
  '5D:0 5D:1', '4D:0 4D:1 AD:0 7D:0 2C:0', 'AD:0 7D:0', false);
followCheck('FO-3a', 'pair led; no pair in suit: any two suit cards legal',
  '5D:0 5D:1', 'AD:0 KD:0 7D:0 2C:0', 'AD:0 KD:0', true);
followCheck('FO-3b', 'pair led; no pair but 2+ suit cards: mixing in off-suit is ILLEGAL',
  '5D:0 5D:1', 'AD:0 KD:0 7D:0 2C:0', 'AD:0 2C:0', false);
followCheck('FO-4a', 'pair led; only ONE suit card: that card + anything is legal',
  '5D:0 5D:1', '7D:0 2C:0 9S:0', '7D:0 2C:0', true);
followCheck('FO-4b', 'pair led; only ONE suit card: omitting it is ILLEGAL',
  '5D:0 5D:1', '7D:0 2C:0 9S:0', '2C:0 9S:0', false);
followCheck('FO-5', 'pair led; void in suit: any two cards (even mixed suits) legal',
  '5D:0 5D:1', '2C:0 9S:0 4H:0', '2C:0 9S:0', true);

// ---------- B. Follow obligations: tractor leads ----------
followCheck('FO-6a', '2-pair tractor led; holding TWO tractors, playing the low one is legal',
  '5D:0 5D:1 6D:0 6D:1', '8D:0 8D:1 9D:0 9D:1 JD:0 JD:1 QD:0 QD:1 2C:0', '8D:0 8D:1 9D:0 9D:1', true);
followCheck('FO-6b', '2-pair tractor led; holding TWO tractors, playing the high one is legal',
  '5D:0 5D:1 6D:0 6D:1', '8D:0 8D:1 9D:0 9D:1 JD:0 JD:1 QD:0 QD:1 2C:0', 'JD:0 JD:1 QD:0 QD:1', true);
followCheck('FO-7a', 'tractor led; no tractor: two loose pairs must be played (both pairs) — legal combo',
  '5D:0 5D:1 6D:0 6D:1', 'KD:0 KD:1 8D:0 8D:1 2D:0 4D:0 2C:0', 'KD:0 KD:1 8D:0 8D:1', true);
followCheck('FO-7b', 'tractor led; no tractor: keeping a pair back and playing singles is ILLEGAL',
  '5D:0 5D:1 6D:0 6D:1', 'KD:0 KD:1 8D:0 8D:1 2D:0 4D:0 2C:0', 'KD:0 KD:1 2D:0 4D:0', false);
followCheck('FO-8a', 'tractor led; ONE pair only: pair + any two suit singles legal (choice of singles)',
  '5D:0 5D:1 6D:0 6D:1', 'KD:0 KD:1 8D:0 2D:0 4D:0 2C:0', 'KD:0 KD:1 2D:0 4D:0', true);
followCheck('FO-8b', 'tractor led; ONE pair only: pair + different two suit singles also legal',
  '5D:0 5D:1 6D:0 6D:1', 'KD:0 KD:1 8D:0 2D:0 4D:0 2C:0', 'KD:0 KD:1 8D:0 2D:0', true);
followCheck('FO-8c', 'tractor led; ONE pair only: omitting the pair is ILLEGAL',
  '5D:0 5D:1 6D:0 6D:1', 'KD:0 KD:1 8D:0 2D:0 4D:0 2C:0', '8D:0 2D:0 4D:0 2C:0', false);

// 3-pair tractor led, hand has 4 loose pairs incl. one consecutive run of 2 (88+99).
// Rules: "two consecutive pairs plus another pair" outranks "three pairs" — so any 3 pairs
// INCLUDING the 88/99 run is legal; 3 pairs excluding part of the run is not required reading here,
// but at minimum {88,99,KK} must be LEGAL.
followCheck('FO-9a', '3-pair tractor led; playing {88,99,KK} (includes the consecutive run) is legal',
  '4D:0 4D:1 5D:0 5D:1 6D:0 6D:1', '8D:0 8D:1 9D:0 9D:1 JD:0 JD:1 KD:0 KD:1 2C:0',
  '8D:0 8D:1 9D:0 9D:1 KD:0 KD:1', true);
followCheck('FO-9b', '3-pair tractor led; playing {88,99,JJ} (includes the run) is legal',
  '4D:0 4D:1 5D:0 5D:1 6D:0 6D:1', '8D:0 8D:1 9D:0 9D:1 JD:0 JD:1 KD:0 KD:1 2C:0',
  '8D:0 8D:1 9D:0 9D:1 JD:0 JD:1', true);
followCheck('FO-9c', '3-pair tractor led; {88,JJ,KK} skips the available 88-99 run: ILLEGAL (partial tractor required)',
  '4D:0 4D:1 5D:0 5D:1 6D:0 6D:1', '8D:0 8D:1 9D:0 9D:1 JD:0 JD:1 KD:0 KD:1 2C:0',
  '8D:0 8D:1 JD:0 JD:1 KD:0 KD:1', false);

// Triple led: rules progression says a pair must be included if you hold one ("doubles plus another card").
followCheck('FO-10a', 'triple led; holding a pair in suit: pair + single is the required shape (legal)',
  '5D:0 5D:1 5D:2', '8D:0 8D:1 KD:0 QD:0 2C:0', '8D:0 8D:1 KD:0', true);
followCheck('FO-10b', 'triple led; holding a pair in suit: three loose singles is ILLEGAL (pair must be used)',
  '5D:0 5D:1 5D:2', '8D:0 8D:1 KD:0 QD:0 2C:0', '8D:0 KD:0 QD:0', false);

// Trump-suit follows
followCheck('FO-11a', 'trump single led (off-suit rank card): holding trump, must play trump',
  '3S:0', '5H:0 2C:0 9S:0', '5H:0', true);
followCheck('FO-11b', 'trump single led: discarding off-suit while holding trump is ILLEGAL',
  '3S:0', '5H:0 2C:0 9S:0', '2C:0', false);
followCheck('FO-11c', 'trump pair led: jokers/rank cards count as trump for following',
  '4H:0 4H:1', 'BJ:0 LJ:0 3S:0 2C:0', 'BJ:0 LJ:0', true);

// ---------- C. Trick winner ----------
function winnerCheck(id: string, desc: string, t: ReturnType<typeof trump>, expectWinnerPlayerIdx: number, lead: string, ...follows: string[]) {
  const trick = trickWith(CC(lead), ...follows.map(f => CC(f)));
  const wIdx = determineTrickWinner(trick, t, S);
  check(id, desc, trick.plays[wIdx].playerIdx, expectWinnerPlayerIdx);
}

const NT = trump('3', null);
winnerCheck('TW-1', 'NT: Big Joker beats a led trump-rank single', NT, 1, '3S:0', 'BJ:0', '9S:0', '8C:0');
winnerCheck('TW-2', 'NT: Little Joker beats a trump-rank card following a plain lead', NT, 2, '4S:0', '3D:0', 'LJ:0', '8C:0');
winnerCheck('TW-3', 'plain suit: small trump beats off-suit ace lead', T, 1, 'AD:0', '2H:0', 'KD:0', '9D:0');
winnerCheck('TW-4', 'identical singles: first player to play wins the tie', T, 0, 'AD:0', 'AD:1', '9D:0', '8D:0');
winnerCheck('TW-5', 'pair led: two loose trump singles cannot beat it; a trump pair can', T, 3,
  '5D:0 5D:1', '2H:0 4H:0', 'KD:0 KD:1', '7H:0 7H:1');
winnerCheck('TW-12', 'tractor led: higher suit tractor beats it; loose pairs cannot', T, 1,
  '5D:0 5D:1 6D:0 6D:1', '8D:0 8D:1 9D:0 9D:1', 'KD:0 KD:1 2D:0 2D:1', '7C:0 7C:1 8C:0 8C:1');
winnerCheck('TW-13', 'tractor led: trump tractor (2H2H4H4H, rank 3 skipped) beats suit tractor', T, 3,
  '5D:0 5D:1 6D:0 6D:1', '8D:0 8D:1 9D:0 9D:1', '7C:0 7C:1 8C:0 8C:1', '2H:0 2H:1 4H:0 4H:1');
winnerCheck('TW-8', 'throw (pair+single) led: trump pair+single beats it', T, 1,
  'AD:0 AD:1 KD:0', '5H:0 5H:1 6H:0', '9D:0 9D:1 8D:0', '2C:0 5C:0 6C:0');
winnerCheck('TW-9', 'trump pair led (3H3H): Little Joker pair beats it; off-suit rank pair does not', T, 1,
  '3H:0 3H:1', 'LJ:0 LJ:1', '3S:0 3S:1', '5H:0 5H:1');
winnerCheck('TW-10', 'off-suit rank pair led (3S3S): equal pair 3D3D does not beat it (first wins)', T, 0,
  '3S:0 3S:1', '3D:0 3D:1', '5H:0 5H:1', '2C:0 5C:0');

// Multi-component throw beaten by trump: rules say EVERY component must be individually defeated.
// P1 ruffs the two-pair throw with {KH KH, QH QH}. P2 ruffs with {AH AH, 2H 2H}.
// Pairwise: A>K but 2<Q -> P2 must NOT take the trick from P1.
winnerCheck('TW-6', 'two-pair throw: later trump {AA,22} does NOT beat earlier trump {KK,QQ} (2<Q)', T, 1,
  'KD:0 KD:1 JD:0 JD:1', 'KH:0 KH:1 QH:0 QH:1', 'AH:0 AH:1 2H:0 2H:1', '2C:0 5C:0 6C:0 7C:0');
winnerCheck('TW-6b', 'two-pair throw: trump {AA,KK} DOES beat earlier trump {QQ,22} (A>Q, K>2)', T, 2,
  'KD:0 KD:1 JD:0 JD:1', 'QH:0 QH:1 2H:0 2H:1', 'AH:0 AH:1 KH:0 KH:1', '2C:0 5C:0 6C:0 7C:0');

// Mixed-suit dumps can never win
winnerCheck('TW-14', 'mixed-suit dump cannot win even with high cards', T, 0,
  '9D:0', 'AS:0', '8D:0', '7D:0');

// ---------- D. Throw validity ----------
{
  // AD AD KD vs another hand holding a lone AD (deck idx 2 unrealistic but fine for logic)
  const lead = CC('AD:0 AD:1 KD:0');
  const others = [CC('QD:0 QD:1 2C:0'), CC('9S:0 8S:0')];
  const r1 = isValidThrow(lead, getLeadSuit(lead, T), others, T, S);
  check('TH-1', 'throw AA+K: valid when nobody can beat either component', r1.valid, true);

  const others2 = [CC('AD:2 2C:0'), CC('9S:0 8S:0')];
  const r2 = isValidThrow(lead, getLeadSuit(lead, T), others2, T, S);
  check('TH-2a', 'throw AA+K: invalid when someone holds a higher single (A beats K)', r2.valid, false);
  info('TH-2b', 'invalid throw: failed component / penalty exposed by validator',
    `failedComponent=${r2.failedComponent ? r2.failedComponent.cards.length + ' card(s)' : 'none'} beatableCards=${r2.beatableCards}`);

  // trump cannot invalidate a throw (only same-suit beats count)
  const others3 = [CC('BJ:0 LJ:0 3H:0'), CC('9S:0 8S:0')];
  const r3 = isValidThrow(lead, getLeadSuit(lead, T), others3, T, S);
  check('TH-3', 'throw validity ignores trump in other hands (ruffing does not invalidate)', r3.valid, true);

  // single-component leads are never treated as throws
  const pairLead = CC('KD:0 KD:1');
  const r4 = isValidPlay(pairLead, CC('KD:0 KD:1 2C:0'), { leadPlayerIdx: 0, plays: [], points: 0 }, T, S, [CC('AD:0 AD:1')]);
  check('TH-4', 'leading a bare pair is always legal even if a higher pair exists elsewhere', r4.valid, true);

  // isValidPlay applies penalty info for invalid throws
  const r5 = isValidPlay(lead, [...lead, C('2C')], { leadPlayerIdx: 0, plays: [], points: 0 }, T, S, others2);
  check('TH-5', 'invalid throw: no point penalty under default settings; forced component is the beatable KD',
    [r5.valid, r5.throwPenalty ?? 0, r5.forcedCards?.length ?? 0], [false, 0, 1],
    `reason="${r5.reason}" forcedCards=${JSON.stringify(r5.forcedCards)}`);
}

report('Battery 02: follow obligations & trick winner');
