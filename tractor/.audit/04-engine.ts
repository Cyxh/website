/**
 * Battery 04: server Game class — dealing, teams, bidding, kitty, friends, penalties, round end.
 */
import { C, CC, check, info, report } from './helpers.js';
import { Game } from '../server/src/game.js';
import {
  GamePhase, GameSettings, Player, Rank, Suit, defaultSettings, Card,
} from '../shared/src/types.js';
import { countPoints } from '../shared/src/deck.js';

function mkPlayers(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`, name: `P${i}`, ready: true, rank: Rank.Two, team: undefined,
  }));
}

/** Mirror Room.startGame settings behavior: room defaults are defaultSettings(4). */
function roomDefaultSettings(numPlayers: number): GameSettings {
  const s = defaultSettings(4);
  s.numPlayers = numPlayers;
  if (s.numDecks < 1) s.numDecks = Math.ceil(numPlayers / 2);
  return s;
}

// ---------- A. Deal sizes & teams for each player count ----------
for (const n of [2, 3, 4, 5, 6]) {
  const g = new Game(roomDefaultSettings(n), mkPlayers(n));
  g.startRound();
  while (g.state.phase === GamePhase.Drawing) {
    if (!g.drawCard()) break;
  }
  const sizes = g.state.players.map(p => g.state.hands[p.id].length);
  const equal = sizes.every(s => s === sizes[0]);
  check(`DEAL-${n}p`, `${n}-player room-default deal gives equal hands (2 decks, kitty 8 -> ${108 - 8} cards)`,
    equal, true, `hand sizes: [${sizes.join(', ')}] kitty=${g.state.kitty.length}`);
}
for (const n of [3, 5, 6]) {
  const s = defaultSettings(n); // "sensible host" path: decks = ceil(n/2), kitty still 8
  const g = new Game(s, mkPlayers(n));
  g.startRound();
  while (g.state.phase === GamePhase.Drawing) {
    if (!g.drawCard()) break;
  }
  const sizes = g.state.players.map(p => g.state.hands[p.id].length);
  const equal = sizes.every(sz => sz === sizes[0]);
  check(`DEAL-auto-${n}p`, `${n}-player with auto decks (${s.numDecks}) & kitty 8 gives equal hands`,
    equal, true, `total=${s.numDecks * 54} hand sizes: [${sizes.join(', ')}]`);
}

// Teams in tractor mode
{
  const g4 = new Game(roomDefaultSettings(4), mkPlayers(4));
  g4.startRound();
  g4.state.currentLeaderIdx = 1; g4.updateTeams();
  check('TEAM-4p', '4p tractor: leader + opposite seat defend (2v2)',
    g4.state.players.map(p => p.team), ['attacking', 'defending', 'attacking', 'defending']);

  {
    const g = new Game(roomDefaultSettings(6), mkPlayers(6));
    g.startRound();
    g.state.currentLeaderIdx = 0; g.updateTeams();
    const defenders = g.state.players.filter(p => p.team === 'defending').length;
    check('TEAM-6p', '6p tractor (fixed teams): 3 defenders on alternating seats',
      defenders, 3, `got ${defenders} defenders vs ${6 - defenders} attackers`);
  }
  {
    const g = new Game(roomDefaultSettings(5), mkPlayers(5));
    g.startRound();
    g.state.currentLeaderIdx = 0; g.updateTeams();
    const defenders = g.state.players.filter(p => p.team === 'defending').length;
    info('TEAM-5p', 'odd player counts have no fixed-team split: leader defends alone (use Finding Friends instead)',
      `5p tractor mode: ${defenders} defender vs ${5 - defenders} attackers`);
  }
}

// ---------- B. Bidding ----------
function freshBidGame(): Game {
  const g = new Game(roomDefaultSettings(4), mkPlayers(4));
  g.startRound();
  // inject bid-ready hands (phase stays Drawing while drawPile is non-empty)
  g.state.hands['p0'] = CC('2S:0 2S:1 5C:0');
  g.state.hands['p1'] = CC('2D:0 2D:1 2H:0 2H:1');
  g.state.hands['p2'] = CC('LJ:0 LJ:1 BJ:0 BJ:1');
  g.state.hands['p3'] = CC('2C:0 9S:0');
  return g;
}

{
  const g = freshBidGame();
  const r1 = g.placeBid('p0', CC('2S:0'));
  check('BID-1', 'first bid with a single trump-rank card succeeds; bidder takes round-1 leadership',
    [r1.success, g.state.trumpInfo.trumpSuit, g.state.currentLeaderIdx], [true, Suit.Spades, 0]);

  const r2 = g.placeBid('p3', CC('2C:0'));
  check('BID-2', 'same-length different-suit single CANNOT overturn (robertying: more cards required)',
    r2.success, false, `server allowed 2C over 2S: trumpSuit now ${g.state.trumpInfo.trumpSuit}`);
}
{
  const g = freshBidGame();
  g.placeBid('p0', CC('2S:0'));
  const r = g.placeBid('p1', CC('2D:0 2D:1'));
  check('BID-3', 'pair overturns a single (more cards)', [r.success, g.state.trumpInfo.trumpSuit], [true, Suit.Diamonds]);
  info('BID-3b', 'round-1 landlord after overturn (house rule: FIRST bidder keeps kitty)',
    `leaderIdx=${g.state.currentLeaderIdx} (stays 0 by design)`);

  const r2 = g.placeBid('p0', CC('2S:1'));
  check('BID-4', 'shorter bid cannot overturn a pair', r2.success, false);

  const r3 = g.placeBid('p0', CC('2S:0 2S:1'));
  check('BID-5', 'same-length pair of a different suit CANNOT overturn (robertying)',
    r3.success, false, `server allowed 2S2S over 2D2D`);

  const r4 = g.placeBid('p1', CC('2H:0 2H:1'));
  check('BID-6', 'same player re-bidding same length to switch suits is NOT allowed (robertying)',
    r4.success, false, `server allowed p1 to switch own pair from diamonds to hearts`);

  const r5 = g.placeBid('p2', CC('LJ:0 LJ:1'));
  check('BID-7', 'joker pair overturns a rank pair; declares no-trump',
    [r5.success, g.state.trumpInfo.trumpSuit], [true, null]);

  const r6 = g.placeBid('p2', CC('BJ:0 BJ:1'));
  check('BID-8', 'big joker pair overturns little joker pair', r6.success, true);

  const r7 = g.placeBid('p2', CC('LJ:0 LJ:1'));
  check('BID-9', 'little joker pair cannot overturn big joker pair', r7.success, false);
}
{
  const g = freshBidGame();
  const r = g.placeBid('p2', CC('LJ:0'));
  check('BID-10', 'single joker cannot bid', r.success, false);
  const r2 = g.placeBid('p0', CC('2H:0'));
  check('BID-11', 'bidding cards not in hand is rejected', r2.success, false);
  const r3 = g.placeBid('p3', CC('9S:0'));
  check('BID-12', 'non-trump-rank suited card cannot bid', r3.success, false);
}
{
  // Round 2+, byWinningBid: overturner takes leadership
  const g = freshBidGame();
  g.state.roundNumber = 2;
  g.placeBid('p0', CC('2S:0'));
  const leaderAfterFirst = g.state.currentLeaderIdx;
  g.placeBid('p1', CC('2D:0 2D:1'));
  check('BID-13', 'round 2+ byWinningBid: stronger bid takes leadership',
    [leaderAfterFirst, g.state.currentLeaderIdx], [0, 1]);
}

// ---------- C. No-bid fallback ----------
{
  const g = new Game(roomDefaultSettings(4), mkPlayers(4));
  g.startRound();
  g.state.drawPile = [C('9S')]; // force quick end of drawing
  g.drawCard();
  check('NOBID-1', 'drawing ends with no bids -> NoBidKittySelection phase',
    g.state.phase, GamePhase.NoBidKittySelection);
  for (const p of g.state.players) g.voteRandomKitty(p.id);
  check('NOBID-2', 'all vote -> a leader is chosen and phase moves to KittyPickup',
    [g.state.phase, g.state.currentLeaderIdx >= 0], [GamePhase.KittyPickup, true]);
  info('NOBID-3', 'no-bid round trump suit (rules: flip kitty card for suit; here: always no-trump + random-card leader pick)',
    `trumpSuit=${JSON.stringify(g.state.trumpInfo.trumpSuit)} selectionCard=${JSON.stringify(g.state.noBidSelectionCard)}`);
}

// ---------- D. Kitty pickup & exchange ----------
{
  const g = new Game(roomDefaultSettings(4), mkPlayers(4));
  g.startRound();
  g.state.hands['p0'] = CC('2S:0 5C:0 6C:0 7C:0 8C:0 9C:0 TC:0 JC:0 QC:0');
  g.placeBid('p0', CC('2S:0'));
  g.state.drawPile = [C('9S')];
  g.drawCard(); // p? draws last card; phase -> KittyPickup (bid exists)
  check('KIT-1', 'drawing ends with a bid -> KittyPickup', g.state.phase, GamePhase.KittyPickup);

  const rNotLeader = g.pickupKitty('p1');
  check('KIT-2', 'only the leader can pick up the kitty', rNotLeader.success, false);

  const handBefore = g.state.hands['p0'].length;
  const kittySize = g.state.kitty.length;
  g.pickupKitty('p0');
  check('KIT-3', 'pickup moves all kitty cards into leader hand and enters KittyExchange',
    [g.state.phase, g.state.hands['p0'].length], [GamePhase.KittyExchange, handBefore + kittySize]);

  const rShort = g.exchangeKitty('p0', g.state.hands['p0'].slice(0, kittySize - 1));
  check('KIT-4', 'exchange with wrong card count rejected', rShort.success, false);

  const rBad = g.exchangeKitty('p0', [...g.state.hands['p0'].slice(0, kittySize - 1), C('AS', 1)]);
  check('KIT-5', 'exchange containing a card not in hand rejected', rBad.success, false);

  const discard = g.state.hands['p0'].slice(0, kittySize);
  const rOk = g.exchangeKitty('p0', discard);
  check('KIT-6', 'valid exchange succeeds; kitty replaced; phase -> ReadyToPlay',
    [rOk.success, g.state.phase, g.state.kitty.length], [true, GamePhase.ReadyToPlay, kittySize]);
}

// ---------- E. Throw penalty engine behavior ----------
{
  const g = new Game(roomDefaultSettings(4), mkPlayers(4));
  g.startRound();
  g.state.phase = GamePhase.Playing;
  g.state.currentLeaderIdx = 0;
  g.state.currentTurnIdx = 0;
  g.state.trumpInfo = { trumpRank: Rank.Three, trumpSuit: Suit.Hearts };
  g.state.defendingTeam = new Set(['p0', 'p2']);
  for (const p of g.state.players) p.team = g.state.defendingTeam.has(p.id) ? 'defending' : 'attacking';
  g.state.currentTrick = { leadPlayerIdx: 0, plays: [], points: 0 };
  g.state.hands['p0'] = CC('KD:0 KD:1 QD:0 2C:0');
  g.state.hands['p1'] = CC('AD:0 9S:0 8S:0 7S:0');
  g.state.hands['p2'] = CC('2S:0 4S:0 5S:0 6S:0');
  g.state.hands['p3'] = CC('2H:0 4C:0 5C:0 6C:0');

  const r1 = g.playCards('p0', CC('KD:0 KD:1 QD:0'));
  check('THROW-1', 'defender leads invalid throw (QD beatable by AD): play rejected',
    r1.success, false, r1.reason);
  check('THROW-2', 'throwPenalty=none (default): no points move on a failed throw',
    g.state.attackingPoints, 0, `attackingPoints=${g.state.attackingPoints} after 1 failed attempt`);
  const r2 = g.playCards('p0', CC('KD:0 KD:1 QD:0'));
  check('THROW-3', 'retrying the invalid throw is rejected without charging points',
    [r2.success, g.state.attackingPoints], [false, 0]);
  const r3 = g.playCards('p0', CC('KD:0'));
  check('THROW-4', 'after a failed throw, leading anything but the beatable component is rejected',
    r3.success, false, r3.reason);
  const r4 = g.playCards('p0', CC('QD:0'));
  check('THROW-5', 'leading the forced beatable component (QD) is accepted',
    r4.success, true, r4.reason);
}
{
  // Same scenario with the 10-point penalty setting enabled
  const s = roomDefaultSettings(4);
  s.throwPenalty = 'tenPoints';
  const g = new Game(s, mkPlayers(4));
  g.startRound();
  g.state.phase = GamePhase.Playing;
  g.state.currentLeaderIdx = 0;
  g.state.currentTurnIdx = 0;
  g.state.trumpInfo = { trumpRank: Rank.Three, trumpSuit: Suit.Hearts };
  g.state.defendingTeam = new Set(['p0', 'p2']);
  for (const p of g.state.players) p.team = g.state.defendingTeam.has(p.id) ? 'defending' : 'attacking';
  g.state.currentTrick = { leadPlayerIdx: 0, plays: [], points: 0 };
  g.state.hands['p0'] = CC('KD:0 KD:1 QD:0 2C:0');
  g.state.hands['p1'] = CC('AD:0 9S:0 8S:0 7S:0');
  g.state.hands['p2'] = CC('2S:0 4S:0 5S:0 6S:0');
  g.state.hands['p3'] = CC('2H:0 4C:0 5C:0 6C:0');

  g.playCards('p0', CC('KD:0 KD:1 QD:0'));
  check('THROW-6', 'throwPenalty=tenPoints: failed throw charges a flat 10 to the opposing side',
    g.state.attackingPoints, 10);
  g.playCards('p0', CC('KD:0 KD:1 QD:0'));
  check('THROW-7', 'retry does not double-charge (forced-lead rejection happens first)',
    g.state.attackingPoints, 10);
}

// ---------- F. Finding Friends: reveal + points transfer ----------
{
  const s = roomDefaultSettings(4);
  s.gameMode = 'findingFriends';
  const g = new Game(s, mkPlayers(4));
  g.startRound();
  g.state.phase = GamePhase.Playing;
  g.state.trumpInfo = { trumpRank: Rank.Three, trumpSuit: Suit.Hearts };
  g.state.currentLeaderIdx = 0;
  g.state.currentTurnIdx = 0;
  g.state.defendingTeam = new Set(['p0']);
  for (const p of g.state.players) p.team = g.state.defendingTeam.has(p.id) ? 'defending' : 'attacking';
  g.state.friendDeclarations = [{ card: { suit: Suit.Diamonds, rank: Rank.Eight }, ordinal: 1, found: false }];
  g.state.currentTrick = { leadPlayerIdx: 0, plays: [], points: 0 };
  g.state.hands['p0'] = CC('4S:0 5S:0 6S:0');
  g.state.hands['p1'] = CC('9S:0 TS:0 2C:0');   // TS = ten of spades (10 points)
  g.state.hands['p2'] = CC('AS:0 8D:0 KS:0');   // friend card holder
  g.state.hands['p3'] = CC('7S:0 8S:0 5C:0');

  // Trick 1: p2 wins with AS; trick contains 10 (p1) => 10 points to attackers (p2 not yet revealed)
  g.playCards('p0', CC('4S:0'));
  g.playCards('p1', CC('TS:0'));
  g.playCards('p2', CC('AS:0'));
  g.playCards('p3', CC('7S:0'));
  check('FF-1', 'pre-reveal: friend-card holder wins a 10-point trick; points counted for ATTACKERS',
    [g.state.tricks.length, g.state.attackingPoints], [1, 10]);

  // Trick 2: p2 leads the friend card 8D -> reveal, joins defenders
  const r = g.playCards('p2', CC('8D:0'));
  check('FF-2', 'playing the declared friend card reveals the friend and moves them to defending',
    [r.success, g.state.friendDeclarations[0].found, g.state.players[2].team], [true, true, 'defending']);
  check('FF-3', 'rules: the revealed friend BRINGS THEIR POINTS with them (10 pts should move to defenders)',
    g.state.attackingPoints, 0, `attackingPoints still ${g.state.attackingPoints} after reveal`);
}

// ---------- G. Round end: rotation, ranks, kitty award, game end ----------
function endgameSetup(defending: string[], ranks: Partial<Record<string, Rank>> = {}): Game {
  const g = new Game(roomDefaultSettings(4), mkPlayers(4));
  g.startRound();
  g.state.phase = GamePhase.Playing;
  g.state.trumpInfo = { trumpRank: Rank.Three, trumpSuit: Suit.Hearts };
  g.state.currentLeaderIdx = 0;
  g.state.currentTurnIdx = 0;
  g.state.defendingTeam = new Set(defending);
  for (const p of g.state.players) {
    p.team = g.state.defendingTeam.has(p.id) ? 'defending' : 'attacking';
    const r = ranks[p.id]; if (r) p.rank = r;
  }
  g.state.kitty = CC('TD:0 TD:1 5D:0'); // 25 points hidden
  g.state.currentTrick = { leadPlayerIdx: 0, plays: [], points: 0 };
  g.state.hands['p0'] = CC('4S:0');
  g.state.hands['p1'] = CC('9S:0');
  g.state.hands['p2'] = CC('KS:0');
  g.state.hands['p3'] = CC('AS:0');
  return g;
}

{
  // Attacker p3 wins the last (only) trick with AS -> kitty 25 * 2 (single) = 50 attacking points
  const g = endgameSetup(['p0', 'p2']);
  g.playCards('p0', CC('4S:0'));
  g.playCards('p1', CC('9S:0'));
  g.playCards('p2', CC('KS:0'));
  g.playCards('p3', CC('AS:0'));
  check('END-1', 'attackers snatch last trick: 10(trick) + 25 kitty x2 = 60 attacking; def+1 (2 decks)',
    [g.state.phase, g.state.attackingPoints], [GamePhase.Scoring, 60]);
  check('END-2', 'defenders held (60 < 80): defender ranks advance +1',
    g.state.players.map(p => p.rank), [Rank.Three, Rank.Two, Rank.Three, Rank.Two]);
  check('END-3', 'defense held: leadership passes to the OTHER defender (partner)',
    g.state.currentLeaderIdx, 2);
}
{
  // Defenders win last trick; attackers 0 -> def +3
  const g = endgameSetup(['p3', 'p1']);
  g.playCards('p0', CC('4S:0'));
  g.playCards('p1', CC('9S:0'));
  g.playCards('p2', CC('KS:0'));
  g.playCards('p3', CC('AS:0'));
  check('END-4', 'defenders sweep: attackers 0 pts -> def+3, kitty not scored',
    [g.state.attackingPoints, g.state.players[3].rank, g.state.players[1].rank],
    [0, Rank.Five, Rank.Five]);
}
{
  // Attackers reach A while ATTACKING -> game must CONTINUE (rules: win by defending at A)
  const g = endgameSetup(['p0', 'p2'], { p1: Rank.Queen, p3: Rank.Queen });
  g.state.attackingPoints = 200; // pretend they swept everything
  g.playCards('p0', CC('4S:0'));
  g.playCards('p1', CC('9S:0'));
  g.playCards('p2', CC('KS:0'));
  g.playCards('p3', CC('AS:0'));
  check('END-5', 'attackers advancing to A does NOT end the game (must defend at A to win)',
    [g.state.phase, g.state.players[1].rank], [GamePhase.Scoring, Rank.Ace]);
}
{
  // Defenders AT rank A successfully defend -> game over, they win
  const g = endgameSetup(['p0', 'p2'], { p0: Rank.Ace, p2: Rank.Ace });
  g.playCards('p0', CC('4S:0'));
  g.playCards('p1', CC('9S:0'));
  g.playCards('p2', CC('KS:0'));
  g.playCards('p3', CC('AS:0'));
  check('END-8', 'defenders at rank A hold the attackers under 80: game over, defenders win',
    g.state.phase, GamePhase.GameOver, `attacking=${g.state.attackingPoints}`);
}
{
  // Attackers win -> leadership passes to attacker after old leader
  const g = endgameSetup(['p0', 'p2']);
  g.state.attackingPoints = 120;
  g.playCards('p0', CC('4S:0'));
  g.playCards('p1', CC('9S:0'));
  g.playCards('p2', CC('KS:0'));
  g.playCards('p3', CC('AS:0'));
  check('END-6', 'attackers win: next leader is the first attacker after the old leader',
    g.state.currentLeaderIdx, 1);
  check('END-7', 'attackers win: attacker ranks advance (120+50 kitty=170 -> +2)',
    [g.state.players[1].rank, g.state.players[3].rank], [Rank.Four, Rank.Four]);
}

// ---------- H. minimumCard vs round-1 trump rank ----------
{
  const s = roomDefaultSettings(4);
  s.minimumCard = Rank.Three; // no 2s in deck, but everyone is rank 2
  const g = new Game(s, mkPlayers(4));
  g.startRound();
  g.state.hands['p0'] = CC('3S:0 4S:0');
  const r = g.placeBid('p0', CC('3S:0'));
  info('MIN-1', 'minimumCard=3 with starting rank 2: trump rank cards do not exist in the deck; only joker pairs can ever bid',
    `bidding 3S rejected=${!r.success} (trump rank is 2, no 2s dealt)`);
}

report('Battery 04: engine');
