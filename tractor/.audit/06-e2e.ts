/**
 * Battery 06: end-to-end smoke test — real server over WebSocket, 4 bot clients,
 * one full no-bid (NT) round through Scoring and into round 2.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import WebSocket from 'ws';
import { check, info, report } from './helpers.js';
import { isValidPlay } from '../shared/src/trick.js';
import { GamePhase, Card, PlayerView } from '../shared/src/types.js';

const PORT = 8099;
const ROOT = path.resolve(import.meta.dirname, '..');

interface Bot {
  name: string;
  ws: WebSocket;
  playerId: string | null;
  view: PlayerView | null;
  errors: string[];
  sentVote: boolean;
  sentPickup: boolean;
  sentExchange: boolean;
  sentReady: boolean;
  lastActed: string;
  sentNextRound: boolean;
}

const phasesSeen = new Set<string>();
let roundResultPayload: any = null;

function connectBot(name: string, roomId: string | null): Promise<Bot> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    const bot: Bot = {
      name, ws, playerId: null, view: null, errors: [],
      sentVote: false, sentPickup: false, sentExchange: false, sentReady: false,
      lastActed: '', sentNextRound: false,
    };
    ws.on('open', () => {
      if (roomId) ws.send(JSON.stringify({ type: 'join_room', payload: { roomId, playerName: name } }));
      else ws.send(JSON.stringify({ type: 'create_room', payload: { playerName: name } }));
    });
    ws.on('message', (data: Buffer) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'room_joined') { bot.playerId = msg.payload.playerId; resolve(bot); }
      if (msg.type === 'game_state') { bot.view = msg.payload; if (bot.view) phasesSeen.add(bot.view.phase); }
      if (msg.type === 'round_result') roundResultPayload = msg.payload;
      if (msg.type === 'error') bot.errors.push(msg.payload.message);
    });
    ws.on('error', (e) => reject(e));
    setTimeout(() => reject(new Error(`${name} connect timeout`)), 8000);
  });
}

function send(bot: Bot, type: string, payload: any = {}) {
  bot.ws.send(JSON.stringify({ type, payload }));
}

async function waitFor(desc: string, pred: () => boolean, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) return true;
    await new Promise(r => setTimeout(r, 60));
  }
  console.log(`  ! timeout waiting for: ${desc}`);
  return false;
}

async function main() {
  const server = spawn(process.execPath, [
    path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
    path.join(ROOT, 'server', 'src', 'index.ts'),
  ], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
  const serverLogs: string[] = [];
  server.stdout.on('data', d => serverLogs.push(d.toString()));
  server.stderr.on('data', d => serverLogs.push('[ERR] ' + d.toString()));

  try {
    await new Promise(r => setTimeout(r, 2500)); // let server boot

    const host = await connectBot('Bot1', null);
    // roomId arrives via room_created; grab it from a fresh listener state
    let roomId: string | null = null;
    host.ws.on('message', () => {});
    // re-request: easier — room_created was sent before room_joined; re-listen via /api/rooms
    const rooms = await fetch(`http://127.0.0.1:${PORT}/api/rooms`).then(r => r.json()) as any[];
    roomId = rooms[0]?.id;
    check('E2E-1', 'server boots; room created and listed via REST', !!roomId, true, `rooms=${JSON.stringify(rooms)}`);
    if (!roomId) throw new Error('no room');

    const bots = [host,
      await connectBot('Bot2', roomId),
      await connectBot('Bot3', roomId),
      await connectBot('Bot4', roomId)];

    send(host, 'start_game');
    const drawingStarted = await waitFor('drawing phase', () => bots.every(b => b.view?.phase === GamePhase.Drawing), 8000);
    check('E2E-2', 'host starts game; all clients enter Drawing', drawingStarted, true);

    // let auto-draw finish (100 cards x 250ms = ~25s), nobody bids -> NoBidKittySelection
    const noBid = await waitFor('no-bid kitty selection', () => bots.every(b => b.view?.phase === GamePhase.NoBidKittySelection), 45000);
    check('E2E-3', 'drawing completes with no bids -> NoBidKittySelection on all clients', noBid, true);

    const handSizes = new Set(bots.map(b => b.view?.hand.length));
    check('E2E-4', 'all four hands equal (25 cards) after drawing', [...handSizes], [25],
      `sizes=${bots.map(b => b.view?.hand.length).join(',')}`);

    // everyone votes
    for (const b of bots) if (!b.sentVote) { b.sentVote = true; send(b, 'vote_random_kitty'); }
    const pickupPhase = await waitFor('kitty pickup', () => bots.every(b => b.view?.phase === GamePhase.KittyPickup), 8000);
    check('E2E-5', 'all vote -> KittyPickup with a chosen leader', pickupPhase, true,
      `leaderIdx=${host.view?.currentLeaderIdx} card=${JSON.stringify(host.view?.noBidSelectionCard)}`);

    const leaderBot = () => bots.find(b => b.view && b.view.myIndex === b.view.currentLeaderIdx)!;

    {
      const lb = leaderBot();
      send(lb, 'pickup_kitty');
      const exch = await waitFor('kitty exchange', () => lb.view?.phase === GamePhase.KittyExchange, 8000);
      check('E2E-6', 'leader picks up kitty -> KittyExchange; leader hand now 33', exch && lb.view?.hand.length === 33, true,
        `leader hand=${lb.view?.hand.length}`);
      const discard = lb.view!.hand.slice(-8);
      send(lb, 'exchange_kitty', { kitty: discard });
      const ready = await waitFor('ready phase', () => bots.every(b => b.view?.phase === GamePhase.ReadyToPlay), 8000);
      check('E2E-7', 'leader exchanges 8 back -> ReadyToPlay', ready, true);
    }

    for (const b of bots) if (!b.sentReady) { b.sentReady = true; send(b, 'confirm_ready'); }
    const playing = await waitFor('playing', () => bots.every(b => b.view?.phase === GamePhase.Playing), 8000);
    check('E2E-8', 'all confirm ready -> Playing', playing, true);

    // play the whole round with singles
    const done = await waitFor('round completes (25 tricks)', () => {
      for (const b of bots) {
        const v = b.view;
        if (!v || v.phase !== GamePhase.Playing) continue;
        if (v.currentTurnIdx !== v.myIndex) continue;
        const trick = v.currentTrick;
        if (!trick) continue;
        const key = `${v.tricks.length}:${trick.plays.length}`;
        if (b.lastActed === key) continue;
        const hand = v.hand;
        if (hand.length === 0) continue;
        let cards: Card[] | null = null;
        if (trick.plays.length === 0) cards = [hand[0]];
        else {
          for (const c of hand) {
            const r = isValidPlay([c], hand, trick, v.trumpInfo, v.settings);
            if (r.valid) { cards = [c]; break; }
          }
        }
        if (cards) { b.lastActed = key; send(b, 'play_cards', { cards }); }
      }
      return bots.some(b => b.view?.phase === GamePhase.Scoring);
    }, 90000);
    check('E2E-9', 'full round plays out to Scoring over WebSocket', done, true,
      `tricks=${host.view?.tricks.length}`);
    info('E2E-10', 'round_result protocol message (defined in types, not sent by server; client renders Scoring from game_state)',
      roundResultPayload ? `received: attacking=${roundResultPayload.attackingPoints}` : 'not broadcast (known gap, report-only)');

    {
      const lb = bots[0];
      send(lb, 'next_round');
      const r2 = await waitFor('round 2 drawing', () => bots.some(b => b.view?.phase === GamePhase.Drawing), 8000);
      check('E2E-11', 'next_round starts round 2 (Drawing again)', r2, true);
    }

    const unexpectedErrors = bots.flatMap(b => b.errors.map(e => `${b.name}: ${e}`));
    check('E2E-12', 'no unexpected server error messages during the run', unexpectedErrors.length, 0,
      unexpectedErrors.slice(0, 8).join(' | '));
    info('E2E-13', 'phases seen across the run', [...phasesSeen].join(' -> '));
  } catch (e: any) {
    check('E2E-FATAL', 'e2e run completed without exceptions', String(e?.message || e), 'no exception');
    console.log('server logs tail:', serverLogs.slice(-10).join(''));
  } finally {
    server.kill();
  }

  report('Battery 06: e2e over WebSocket');
  process.exit(0);
}

main();
