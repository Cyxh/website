/**
 * Battery 05: full-game self-play simulations against the real Game engine.
 * Bots play legal-ish moves (singles + pairs) and retry on rejection, counting
 * rejections of rule-legal pair follows (the "forced specific pair" bug).
 */
import { check, info, report } from './helpers.js';
import { Game } from '../server/src/game.js';
import {
  GamePhase, GameSettings, Player, Rank, Suit, defaultSettings, Card,
} from '../shared/src/types.js';
import { countPoints } from '../shared/src/deck.js';
import { getEffectiveSuit, groupByFace, getCardsInSuit } from '../shared/src/card.js';

function mkPlayers(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`, name: `P${i}`, ready: true, rank: Rank.Two, team: undefined,
  }));
}

function roomDefaultSettings(numPlayers: number): GameSettings {
  const s = defaultSettings(4);
  s.numPlayers = numPlayers;
  return s;
}

interface SimResult {
  label: string;
  rounds: number;
  gameOver: boolean;
  deadlock: boolean;
  deadlockDetail?: string;
  unequalHands: boolean;
  pointConservationOk: boolean;
  attackingConsistencyOk: boolean;
  legalPairFollowRejections: number;
  errors: string[];
}

function* subsetsOfSize<T>(arr: T[], k: number): Generator<T[]> {
  if (k === 0) { yield []; return; }
  for (let i = 0; i <= arr.length - k; i++) {
    for (const rest of subsetsOfSize(arr.slice(i + 1), k - 1)) yield [arr[i], ...rest];
  }
}

function runFullGame(label: string, settings: GameSettings, numPlayers: number, opts: {
  maxRounds?: number; noBids?: boolean; leadPairs?: boolean; declareFriends?: boolean;
} = {}): SimResult {
  const res: SimResult = {
    label, rounds: 0, gameOver: false, deadlock: false, unequalHands: false,
    pointConservationOk: true, attackingConsistencyOk: true,
    legalPairFollowRejections: 0, errors: [],
  };
  const g = new Game(settings, mkPlayers(numPlayers));
  g.startRound();

  const maxRounds = opts.maxRounds ?? 30;
  let guard = 0;

  const idOf = (idx: number) => g.state.players[idx].id;

  while (res.rounds < maxRounds && guard++ < 200000) {
    const st = g.state;
    switch (st.phase) {
      case GamePhase.Drawing: {
        const r = g.drawCard();
        if (!r) { res.errors.push('drawCard returned null during Drawing'); return res; }
        if (!opts.noBids && st.bids.length === 0) {
          const pid = idOf(r.playerIdx);
          const card = r.card;
          if (card.kind === 'suited' && card.rank === st.trumpInfo.trumpRank) {
            g.placeBid(pid, [card]);
          }
        }
        if (st.phase === GamePhase.Drawing && st.drawPile.length === 0) {
          res.errors.push('drawing stalled'); return res;
        }
        // check hand equality right when drawing finishes
        if ((st.phase as GamePhase) !== GamePhase.Drawing) {
          const sizes = st.players.map(p => st.hands[p.id].length);
          if (!sizes.every(s => s === sizes[0])) {
            res.unequalHands = true;
            info(`${label}-hands`, 'unequal hands after drawing', `[${sizes.join(',')}]`);
          }
        }
        break;
      }
      case GamePhase.NoBidKittySelection: {
        for (const p of st.players) {
          if (!st.noBidVotes.has(p.id)) { g.voteRandomKitty(p.id); break; }
        }
        break;
      }
      case GamePhase.KittyPickup: {
        const leader = st.players[st.currentLeaderIdx];
        const r = g.pickupKitty(leader.id);
        if (!r.success) { res.errors.push(`pickupKitty failed: ${r.reason}`); return res; }
        break;
      }
      case GamePhase.KittyExchange: {
        const leader = st.players[st.currentLeaderIdx];
        const hand = st.hands[leader.id];
        const discard = hand.slice(hand.length - st.kitty.length);
        const r = g.exchangeKitty(leader.id, discard);
        if (!r.success) { res.errors.push(`exchangeKitty failed: ${r.reason}`); return res; }
        break;
      }
      case GamePhase.FriendDeclaration: {
        const leader = st.players[st.currentLeaderIdx];
        const rank = st.trumpInfo.trumpRank === Rank.Ace ? Rank.King : Rank.Ace;
        const suit = st.trumpInfo.trumpSuit === Suit.Spades ? Suit.Hearts : Suit.Spades;
        const r = g.declareFriends(leader.id, [
          ...Array.from({ length: (st.settings.numFriends ?? Math.floor(numPlayers / 2) - 1) }, (_, i) => ({
            card: { suit, rank }, ordinal: i + 1, found: false,
          })),
        ]);
        if (!r.success) { res.errors.push(`declareFriends failed: ${r.reason}`); return res; }
        break;
      }
      case GamePhase.ReadyToPlay: {
        for (const p of st.players) {
          if (!st.readyPlayers.has(p.id)) { g.confirmReady(p.id); break; }
        }
        break;
      }
      case GamePhase.Playing: {
        const trick = st.currentTrick!;
        const turnIdx = st.currentTurnIdx;
        const pid = idOf(turnIdx);
        const hand = st.hands[pid];

        if (hand.length === 0) {
          res.deadlock = true;
          res.deadlockDetail = `player ${pid} must play but has 0 cards; others: ${st.players.map(p => st.hands[p.id].length).join(',')}; tricks played: ${st.tricks.length}`;
          return res;
        }

        if (trick.plays.length === 0) {
          // Leading: sometimes lead a pair to exercise format obligations
          let played = false;
          if (opts.leadPairs) {
            const groups = groupByFace(hand).filter(gr => gr.length >= 2);
            if (groups.length > 0 && st.tricks.length % 2 === 0) {
              const r = g.playCards(pid, groups[0].slice(0, 2));
              if (r.success) played = true;
            }
          }
          if (!played) {
            const r = g.playCards(pid, [hand[0]]);
            if (!r.success) { res.errors.push(`lead single rejected: ${r.reason}`); return res; }
          }
        } else {
          const leadCards = trick.plays[0].cards;
          const need = leadCards.length;
          if (need === 1) {
            // try each card until accepted
            let ok = false;
            for (const c of hand) {
              const r = g.playCards(pid, [c]);
              if (r.success) { ok = true; break; }
            }
            if (!ok) { res.errors.push(`no single follow accepted for ${pid}`); return res; }
          } else {
            // following a pair: prefer suit pairs (all of them tried), then suit subsets, then any subset
            const leadSuit = getEffectiveSuit(leadCards[0], st.trumpInfo);
            const suitCards = getCardsInSuit(hand, leadSuit, st.trumpInfo);
            const pairGroups = groupByFace(suitCards).filter(gr => gr.length >= 2);
            let ok = false;
            let pairRejections = 0;
            for (const gr of pairGroups) {
              const r = g.playCards(pid, gr.slice(0, 2));
              if (r.success) { ok = true; break; }
              pairRejections++;
            }
            if (!ok && pairGroups.length > 0) {
              // all suit pairs got rejected -> every one of those beyond format policy is suspicious;
              // at most one pair could legitimately be "the wrong one" under any sane rule
              res.legalPairFollowRejections += pairRejections;
            }
            if (!ok) {
              for (const subset of subsetsOfSize(suitCards, Math.min(need, suitCards.length))) {
                const fill = hand.filter(c => !subset.includes(c)).slice(0, need - subset.length);
                const r = g.playCards(pid, [...subset, ...fill]);
                if (r.success) { ok = true; break; }
              }
            }
            if (!ok) {
              for (const subset of subsetsOfSize(hand, need)) {
                const r = g.playCards(pid, subset);
                if (r.success) { ok = true; break; }
              }
            }
            if (!ok) { res.errors.push(`no ${need}-card follow accepted for ${pid} (hand ${hand.length})`); return res; }
          }
        }
        break;
      }
      case GamePhase.Scoring: {
        res.rounds++;
        // invariants
        const trickPts = st.tricks.reduce((s, t) => s + t.points, 0);
        const kittyPts = countPoints(st.kitty);
        if (trickPts + kittyPts !== st.settings.numDecks * 100) {
          res.pointConservationOk = false;
          res.errors.push(`points: tricks ${trickPts} + kitty ${kittyPts} != ${st.settings.numDecks * 100}`);
        }
        if (res.rounds >= maxRounds) return res;
        g.startRound();
        break;
      }
      case GamePhase.GameOver: {
        res.gameOver = true;
        return res;
      }
      default:
        res.errors.push(`unexpected phase ${st.phase}`);
        return res;
    }
  }
  if (guard >= 200000) res.errors.push('guard tripped (possible livelock)');
  return res;
}

// ---------- Simulations ----------
{
  const r = runFullGame('SIM-4p', roomDefaultSettings(4), 4, { leadPairs: true, maxRounds: 40 });
  check('SIM-4p-clean', '4p default game: no deadlock, no errors, points conserved every round',
    [r.deadlock, r.errors.length, r.pointConservationOk], [false, 0, true],
    `rounds=${r.rounds} gameOver=${r.gameOver} errors=${r.errors.join('; ')}`);
  check('SIM-4p-end', '4p default game reaches GameOver within 40 rounds',
    r.gameOver, true, `rounds played: ${r.rounds}`);
  check('SIM-4p-pairs', 'no rule-legal pair follows rejected across the whole game',
    r.legalPairFollowRejections, 0, `${r.legalPairFollowRejections} suit-pair follow attempts rejected (forced-specific-pair bug)`);
}
{
  const r = runFullGame('SIM-3p', roomDefaultSettings(3), 3, { maxRounds: 3 });
  check('SIM-3p-deadlock', '3p default game must NOT deadlock (it does: unequal 34/33/33 deal)',
    r.deadlock, false, r.deadlockDetail || r.errors.join('; '));
}
{
  const r = runFullGame('SIM-6p', roomDefaultSettings(6), 6, { maxRounds: 3 });
  check('SIM-6p-deadlock', '6p default game must NOT deadlock (unequal 100/6 deal)',
    r.deadlock, false, r.deadlockDetail || r.errors.join('; '));
}
{
  const r = runFullGame('SIM-2p', roomDefaultSettings(2), 2, { leadPairs: true, maxRounds: 25 });
  check('SIM-2p-clean', '2p game (1v1, 50-card hands): no deadlock, no errors',
    [r.deadlock, r.errors.length], [false, 0], `rounds=${r.rounds} gameOver=${r.gameOver} errors=${r.errors.join('; ')}`);
}
{
  const r = runFullGame('SIM-NT', roomDefaultSettings(4), 4, { noBids: true, maxRounds: 4, leadPairs: true });
  check('SIM-NT-clean', 'no-bid (always NT) rounds complete without errors',
    [r.deadlock, r.errors.length], [false, 0], `rounds=${r.rounds} errors=${r.errors.join('; ')}`);
}
{
  const s = roomDefaultSettings(4);
  s.gameMode = 'findingFriends';
  const r = runFullGame('SIM-FF', s, 4, { leadPairs: true, maxRounds: 25 });
  check('SIM-FF-clean', '4p Finding Friends game: no deadlock, no errors',
    [r.deadlock, r.errors.length], [false, 0], `rounds=${r.rounds} gameOver=${r.gameOver} errors=${r.errors.join('; ')}`);
}
{
  const s = roomDefaultSettings(5);
  s.gameMode = 'findingFriends';
  const r = runFullGame('SIM-FF5', s, 5, { maxRounds: 25 });
  check('SIM-FF5-clean', '5p Finding Friends (2 decks, kitty 8 -> 20-card hands): no deadlock, no errors',
    [r.deadlock, r.errors.length], [false, 0], `rounds=${r.rounds} gameOver=${r.gameOver} errors=${r.errors.join('; ')}`);
}

report('Battery 05: full-game simulations');
