/**
 * Battery 01: card ordering + tractor detection vs robertying.com rules.
 */
import { C, CC, trump, settings, check, info, report } from './helpers.js';
import { cardOrder, getEffectiveSuit } from '../shared/src/card.js';
import { detectTractor, decomposePlay } from '../shared/src/tractor.js';

const S = settings();

// ---------- A. No-trump ordering (rules: BJ > LJ > trump-rank cards) ----------
{
  const nt = trump('3', null);
  check('NT-ORD-1', 'NT: Big Joker outranks a trump-rank card',
    cardOrder(C('BJ'), nt) > cardOrder(C('3S'), nt), true);
  check('NT-ORD-2', 'NT: Little Joker outranks a trump-rank card',
    cardOrder(C('LJ'), nt) > cardOrder(C('3S'), nt), true);
  check('NT-ORD-3', 'NT: Big Joker outranks Little Joker',
    cardOrder(C('BJ'), nt) > cardOrder(C('LJ'), nt), true);
  check('NT-ORD-4', 'NT: trump-rank cards of different suits are equal',
    cardOrder(C('3S'), nt) === cardOrder(C('3D'), nt), true);
  check('NT-ORD-5', 'NT: trump-rank card outranks an ace of its own suit (3S is trump, AS is plain spade)',
    getEffectiveSuit(C('3S'), nt) === 'trump' && getEffectiveSuit(C('AS'), nt) === 'S', true);
}

// ---------- B. Suit-trump ordering ----------
{
  const t = trump('3', 'H');
  const ord = (s: string) => cardOrder(C(s), t);
  check('TR-ORD-1', 'BJ > LJ > 3H > 3S > AH (trump chain)',
    ord('BJ') > ord('LJ') && ord('LJ') > ord('3H') && ord('3H') > ord('3S') && ord('3S') > ord('AH'), true);
  check('TR-ORD-2', 'off-suit trump-rank cards equal (3S == 3D == 3C)',
    ord('3S') === ord('3D') && ord('3D') === ord('3C'), true);
}

// ---------- C. Tractor detection: trump suit chains ----------
{
  const t = trump('3', 'H');
  const pair = (s: string) => [C(s, 0), C(s, 1)];

  check('TRAC-1', 'KH KH + AH AH is a tractor (trump suit)',
    detectTractor([pair('KH'), pair('AH')], t, S) !== null, true);
  check('TRAC-2', 'AH AH + 3S 3S is a tractor (trump-suit ace adjacent to off-suit trump rank)',
    detectTractor([pair('AH'), pair('3S')], t, S) !== null, true);
  check('TRAC-3', '3S 3S + 3H 3H is a tractor (off-suit rank pair adjacent to trump-suit rank pair)',
    detectTractor([pair('3S'), pair('3H')], t, S) !== null, true);
  check('TRAC-4', '3H 3H + LJ LJ is a tractor',
    detectTractor([pair('3H'), pair('LJ')], t, S) !== null, true);
  check('TRAC-5', 'LJ LJ + BJ BJ is a tractor',
    detectTractor([pair('LJ'), pair('BJ')], t, S) !== null, true);
  check('TRAC-6', '5-pair mega tractor AH AH 3S 3S 3H 3H LJ LJ BJ BJ',
    detectTractor([pair('AH'), pair('3S'), pair('3H'), pair('LJ'), pair('BJ')], t, S) !== null, true);
  check('TRAC-7', '3S 3S + 3D 3D is NOT a tractor (equal-value pairs)',
    detectTractor([pair('3S'), pair('3D')], t, S), null);
  check('TRAC-8', 'AH AH + 3S 3S + 3D 3D is NOT a tractor (two equal off-suit rank pairs)',
    detectTractor([pair('AH'), pair('3S'), pair('3D')], t, S), null);
}

// ---------- D. Tractor detection: non-trump suit with rank skip ----------
{
  const t = trump('3', 'H');
  const pair = (s: string) => [C(s, 0), C(s, 1)];
  check('TRAC-9', '2S 2S + 4S 4S is a tractor when 3 is trump rank (3 removed from sequence)',
    detectTractor([pair('2S'), pair('4S')], t, S) !== null, true);
  check('TRAC-10', '2S 2S + 4S 4S is NOT a tractor when 5 is trump rank',
    detectTractor([pair('2S'), pair('4S')], trump('5', 'H'), S), null);
  const tA = trump('A', 'H');
  check('TRAC-11', 'KS KS + QS QS tractor normal adjacency',
    detectTractor([pair('KS'), pair('QS')], tA, S) !== null, true);
  const tK = trump('K', 'H');
  check('TRAC-12', 'QS QS + AS AS is a tractor when K is trump rank',
    detectTractor([pair('QS'), pair('AS')], tK, S) !== null, true);
  check('TRAC-13', 'triple tractor 5H 5H 5H + 6H 6H 6H (trump suit, width 3)',
    detectTractor([[C('5H',0),C('5H',1),C('5H',2)], [C('6H',0),C('6H',1),C('6H',2)]], t, S) !== null, true);
  check('TRAC-14', 'pair + triple mixed widths is NOT a tractor',
    detectTractor([[C('5H',0),C('5H',1)], [C('6H',0),C('6H',1),C('6H',2)]], t, S), null);
}

// ---------- E. Tractor detection: no-trump chains ----------
// Rules (robertying): NT trump order is BJ > LJ > rank cards.
// So: rank-pair + LJLJ = tractor, LJLJ + BJBJ = tractor, BJBJ + rank-pair = NOT.
{
  const nt = trump('3', null);
  const pair = (s: string) => [C(s, 0), C(s, 1)];
  check('NT-TRAC-1', 'NT: 3S 3S + LJ LJ is a tractor (rank pair adjacent to Little Joker pair)',
    detectTractor([pair('3S'), pair('LJ')], nt, S) !== null, true);
  check('NT-TRAC-2', 'NT: LJ LJ + BJ BJ is a tractor',
    detectTractor([pair('LJ'), pair('BJ')], nt, S) !== null, true);
  check('NT-TRAC-3', 'NT: BJ BJ + 3S 3S is NOT a tractor (BJ is the top; rank cards are not adjacent to BJ)',
    detectTractor([pair('BJ'), pair('3S')], nt, S), null);
  check('NT-TRAC-4', 'NT: 3S 3S + 3D 3D is NOT a tractor (equal rank pairs)',
    detectTractor([pair('3S'), pair('3D')], nt, S), null);
}

// ---------- F. Settings: tractor minimums ----------
{
  const t = trump('3', 'H');
  const pair = (s: string) => [C(s, 0), C(s, 1)];
  const s3 = settings({ tractorMinLength: 3 });
  check('TRAC-MIN-1', 'tractorMinLength=3 rejects a 2-pair tractor',
    detectTractor([pair('5D'), pair('6D')], t, s3), null);
  check('TRAC-MIN-2', 'tractorMinLength=3 accepts a 3-pair tractor',
    detectTractor([pair('5D'), pair('6D'), pair('7D')], t, s3) !== null, true);
}

// ---------- G. decomposePlay ----------
{
  const t = trump('3', 'H');
  const d = (cards: string) => decomposePlay(CC(cards), t, S).map(c => `${c.groupSize}x${c.length}`).sort().join(',');
  check('DEC-1', 'AA KK QQ decomposes to one 3-pair tractor', d('AD:0 AD:1 KD:0 KD:1 QD:0 QD:1'), '2x3');
  check('DEC-2', 'AAA KKK decomposes to one triple tractor (6-card component preferred)',
    d('AD:0 AD:1 AD:2 KD:0 KD:1 KD:2'), '3x2');
  check('DEC-3', 'AA KK + 77 decomposes to tractor + pair', d('AD:0 AD:1 KD:0 KD:1 7D:0 7D:1'), '2x1,2x2');
  check('DEC-4', 'AS AS KS decomposes to pair + single (throw shape)', d('AS:0 AS:1 KS:0'), '1x1,2x1');
  check('DEC-5', 'single card', d('AS:0'), '1x1');
  const mega = d('AD:0 AD:1 AD:2 KD:0 KD:1 QD:0 QD:1');
  info('DEC-6', 'AAA KK QQ decomposition (ambiguity: rules prefer longest component)', `got ${mega} (AAKKQQ tractor + A = 1x1,2x3 expected)`);
}

report('Battery 01: cards & tractors');
