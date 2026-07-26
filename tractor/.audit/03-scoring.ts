/**
 * Battery 03: scoring, thresholds, kitty multiplier, rank advancement vs rules.
 */
import { C, CC, trump, settings, check, info, report } from './helpers.js';
import { getKittyMultiplier, calculateRoundResult, advanceRank, hasWonGame } from '../shared/src/scoring.js';
import { getScoreThresholds } from '../shared/src/constants.js';
import { Rank, Trick } from '../shared/src/types.js';

const T = trump('3', 'H');

function lastTrick(winnerCards: string, winnerIdx = 1): Trick {
  return {
    leadPlayerIdx: 0,
    plays: [
      { playerIdx: 0, cards: CC('2C:0 5C:0 6C:0 7C:0').slice(0, CC(winnerCards).length) },
      { playerIdx: winnerIdx, cards: CC(winnerCards) },
    ],
    winner: winnerIdx,
    points: 0,
  };
}

// ---------- A. Score thresholds (2 decks: 0/5/40/80/120/160/200) ----------
{
  const th = getScoreThresholds(2);
  check('SC-TH-1', '2-deck thresholds are 0,5,40,80,120,160,200',
    th.map(t => t.threshold), [0, 5, 40, 80, 120, 160, 200]);

  const S = settings({ numDecks: 2 });
  const cases: [number, number, number][] = [
    // [attacking pts, expected defendingAdvance, expected attackingAdvance]
    [0, 3, 0], [5, 2, 0], [35, 2, 0], [40, 1, 0], [75, 1, 0],
    [80, 0, 0], [115, 0, 0], [120, 0, 1], [155, 0, 1], [160, 0, 2], [200, 0, 3], [235, 0, 3],
  ];
  for (const [pts, defAdv, attAdv] of cases) {
    const r = calculateRoundResult(pts, [], lastTrick('9D:0'), false, T, S);
    check(`SC-TH-2@${pts}`, `attackers with ${pts} pts -> def+${defAdv}/att+${attAdv}`,
      [r.defendingAdvance, r.attackingAdvance], [defAdv, attAdv]);
  }
}

// ---------- B. Kitty multiplier ----------
{
  const power = settings({ kittyPenalty: 'power' });
  const times = settings({ kittyPenalty: 'times' });
  check('KM-1', 'power: last trick won with a single -> 2x', getKittyMultiplier(lastTrick('9D:0'), T, power), 2);
  check('KM-2', 'power: pair -> 4x', getKittyMultiplier(lastTrick('9D:0 9D:1'), T, power), 4);
  check('KM-3', 'power: triple -> 8x', getKittyMultiplier(lastTrick('9D:0 9D:1 9D:2'), T, power), 8);
  check('KM-4', 'power: 2-pair tractor -> 16x', getKittyMultiplier(lastTrick('8D:0 8D:1 9D:0 9D:1'), T, power), 16);
  check('KM-5', 'times (robertying table): single -> 2x', getKittyMultiplier(lastTrick('9D:0'), T, times), 2);
  check('KM-6', 'times: pair -> 4x', getKittyMultiplier(lastTrick('9D:0 9D:1'), T, times), 4);
  check('KM-7', 'times: triple -> 6x', getKittyMultiplier(lastTrick('9D:0 9D:1 9D:2'), T, times), 6);
  check('KM-8', 'times: 2-pair tractor -> 8x', getKittyMultiplier(lastTrick('8D:0 8D:1 9D:0 9D:1'), T, times), 8);
  check('KM-9', 'throw pair+single: multiplier keys off LARGEST component (pair) -> power 4x',
    getKittyMultiplier(lastTrick('AD:0 AD:1 KD:0'), T, power), 4);
}

// ---------- C. Round result with kitty ----------
{
  const S = settings({ numDecks: 2, kittyPenalty: 'power' });
  // attackers 60, kitty holds K K 5 = 25 pts, last trick won by attackers with a pair -> 60 + 25*4 = 160 -> att+2
  const r = calculateRoundResult(60, CC('KD:0 KD:1 5D:0'), lastTrick('9D:0 9D:1'), true, T, S);
  check('SC-K-1', 'attackers 60 + kitty 25x4 = 160 -> attackers advance 2',
    [r.attackingPoints, r.attackingAdvance], [160, 2]);

  const r2 = calculateRoundResult(60, CC('KD:0 KD:1 5D:0'), lastTrick('9D:0 9D:1'), false, T, S);
  check('SC-K-2', 'defenders take last trick: kitty not scored, attackers stay 60 -> def+1',
    [r2.attackingPoints, r2.defendingAdvance], [60, 1]);

  // display bug probe: defendingPoints can go negative with big multipliers
  const r3 = calculateRoundResult(180, CC('KD:0 KD:1 5D:0'), lastTrick('8D:0 8D:1 9D:0 9D:1'), true, T, S);
  info('SC-K-3', 'defendingPoints reported as total-attacking (can go negative)',
    `attacking=${r3.attackingPoints} defendingPoints=${r3.defendingPoints} (raw card points of defenders would be >= 0)`);
}

// ---------- D. Rank advancement / game end ----------
{
  check('ADV-1', 'Q +3 caps at A', advanceRank(Rank.Queen, 3, 'A'), Rank.Ace);
  check('ADV-2', 'K +1 -> A', advanceRank(Rank.King, 1, 'A'), Rank.Ace);
  check('ADV-3', 'A +1 stays A', advanceRank(Rank.Ace, 1, 'A'), Rank.Ace);
  check('ADV-4', '2 +3 -> 5', advanceRank(Rank.Two, 3, 'A'), Rank.Five);
  info('ADV-5', 'hasWonGame(A) is true on REACHING A — rules require successfully DEFENDING at A',
    `hasWonGame(Ace)=${hasWonGame(Rank.Ace, 'A')} (game ends the moment a team advances to A, even as attackers)`);
  info('ADV-6', 'maxRank=NT setting behaves identically to A (No-Trump level not implemented)',
    `hasWonGame(Ace,'NT')=${hasWonGame(Rank.Ace, 'NT')}`);
}

report('Battery 03: scoring');
