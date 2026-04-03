/**
 * Ball Crush Multiplayer Server — DEBUG BUILD
 * Extra logging added to trace perspective transform and paddle collisions.
 * Remove DEBUG logs once issue is confirmed fixed.
 */

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');

const app        = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3001;

// ─── Constants ────────────────────────────────────────────────────────────────
const GAME_WIDTH      = 360;
const GAME_HEIGHT     = 640;
const BALL_RADIUS     = 12;
const PADDLE_W        = 70;
const PADDLE_H        = 20;
const BOTTOM_PADDLE_Y = 550;
const TOP_PADDLE_Y    = 50;
const INITIAL_SPEED   = 200;
const MAX_SPEED       = 400;
const SPEED_STEP_HIT  = 5;
const SPEED_INTERVAL  = 30;
const SPEED_FACTOR    = 1.5;
const TICK_RATE       = 60;
const TICK_MS         = 1000 / TICK_RATE;
const INITIAL_HEALTH  = 5;
const MIN_PADDLE_X    = 35;
const MAX_PADDLE_X    = 325;

// ─── Debug helpers ────────────────────────────────────────────────────────────
let debugTickCount = 0;
const DEBUG_EVERY_N_TICKS = 120; // Log every 2 seconds at 60fps

function debugLog(roomId, msg, data = null) {
  if (data !== null) {
    console.log(`[DEBUG][${roomId}] ${msg}`, JSON.stringify(data));
  } else {
    console.log(`[DEBUG][${roomId}] ${msg}`);
  }
}

// ─── Rooms ────────────────────────────────────────────────────────────────────
const rooms = new Map();

function randomBallState() {
  // Always serve downward first so bottom player reacts first
  const angle = Math.random() > 0.5 ? 45 : 135;
  const rad   = (angle * Math.PI) / 180;
  return {
    x:     GAME_WIDTH  / 2,
    y:     GAME_HEIGHT / 2,
    dx:    Math.cos(rad),
    dy:    Math.abs(Math.sin(rad)), // positive = moving downward
    speed: INITIAL_SPEED
  };
}

function createRoom(roomId) {
  return {
    id:              roomId,
    players:         [],
    ball:            randomBallState(),
    paddles:         { bottom: GAME_WIDTH / 2, top: GAME_WIDTH / 2 },
    health:          { bottom: INITIAL_HEALTH, top: INITIAL_HEALTH },
    active:          false,
    tickInterval:    null,
    lastSpeedBump:   Date.now(),
    speedMultiplier: 1.0,
    tickCount:       0
  };
}

// ─── Perspective transform ────────────────────────────────────────────────────
// The 'bottom' player: raw coords, their paddle is at BOTTOM_PADDLE_Y
// The 'top' player:    Y is flipped, so their paddle ALSO appears at BOTTOM_PADDLE_Y
//                      on their screen even though it's TOP_PADDLE_Y on the server.
//
// Rule:  screenY_for_top = GAME_HEIGHT - serverY
//
// So:   server ball Y=550 (near bottom paddle)
//       bottom player sees Y=550  → ball near MY paddle ✓
//       top    player sees Y=90   → ball near OPPONENT paddle ✓
//
//       server ball Y=50  (near top paddle)
//       bottom player sees Y=50   → ball near OPPONENT paddle ✓
//       top    player sees Y=590  → ball near MY paddle ✓
//
function perspectiveFor(role, ball, paddles) {
  if (role === 'bottom') {
    return {
      ball:    { x: ball.x, y: ball.y },
      paddles: {
        my:       paddles.bottom,
        opponent: paddles.top
      }
    };
  } else {
    // top player — flip Y and swap paddle roles
    const flippedY = GAME_HEIGHT - ball.y;
    return {
      ball:    { x: ball.x, y: flippedY },
      paddles: {
        my:       paddles.top,
        opponent: paddles.bottom
      }
    };
  }
}

// ─── Emit game state to each player individually ──────────────────────────────
function emitGameState(room, verbose) {
  for (const player of room.players) {
    const socket = io.sockets.sockets.get(player.socketId);
    if (!socket) continue;

    const p = perspectiveFor(player.role, room.ball, room.paddles);

    // DEBUG: Every 2 seconds show what each player is receiving
    if (verbose) {
      debugLog(room.id,
        `→ Sending to ${player.role} (${player.username}):` +
        ` ball.y=${p.ball.y.toFixed(1)}` +
        ` (raw server ball.y=${room.ball.y.toFixed(1)})` +
        ` myPaddle=${p.paddles.my.toFixed(1)}` +
        ` oppPaddle=${p.paddles.opponent.toFixed(1)}`
      );
    }

    socket.emit('gameState', {
      ball:    p.ball,
      paddles: p.paddles,
      health:  {
        my:       player.role === 'bottom' ? room.health.bottom : room.health.top,
        opponent: player.role === 'bottom' ? room.health.top    : room.health.bottom
      }
    });
  }
}

// ─── Emit ball reset in each player's perspective ─────────────────────────────
function emitBallReset(room) {
  for (const player of room.players) {
    const socket = io.sockets.sockets.get(player.socketId);
    if (!socket) continue;

    const p = perspectiveFor(player.role, room.ball, room.paddles);

    debugLog(room.id,
      `ballReset → ${player.role} (${player.username}):` +
      ` ball.y=${p.ball.y.toFixed(1)} (raw=${room.ball.y.toFixed(1)})`
    );

    socket.emit('ballReset', { ball: p.ball });
  }
}

// ─── Physics tick ─────────────────────────────────────────────────────────────
function tickRoom(room) {
  if (!room.active) return;

  room.tickCount++;
  const verbose = room.tickCount % DEBUG_EVERY_N_TICKS === 0;

  const dt  = TICK_MS / 1000;
  const b   = room.ball;
  const now = Date.now();

  // Speed bump
  if ((now - room.lastSpeedBump) / 1000 >= SPEED_INTERVAL) {
    room.speedMultiplier *= SPEED_FACTOR;
    b.speed = Math.min(INITIAL_SPEED * room.speedMultiplier, MAX_SPEED);
    room.lastSpeedBump = now;
    io.to(room.id).emit('speedBump', { multiplier: room.speedMultiplier });
    debugLog(room.id, `Speed bump → x${room.speedMultiplier.toFixed(2)}, speed=${b.speed}`);
  }

  let nx = b.x + b.dx * b.speed * dt;
  let ny = b.y + b.dy * b.speed * dt;

  // Wall bounce
  if (nx - BALL_RADIUS <= 0) {
    b.dx = Math.abs(b.dx);
    nx   = BALL_RADIUS;
  } else if (nx + BALL_RADIUS >= GAME_WIDTH) {
    b.dx = -Math.abs(b.dx);
    nx   = GAME_WIDTH - BALL_RADIUS;
  }

  // ── Bottom paddle (ball moving downward, dy > 0) ───────────────────
  if (
    b.dy > 0 &&
    ny + BALL_RADIUS >= BOTTOM_PADDLE_Y - PADDLE_H / 2 &&
    ny - BALL_RADIUS <= BOTTOM_PADDLE_Y + PADDLE_H / 2
  ) {
    const px      = room.paddles.bottom;
    const leftEdge  = px - PADDLE_W / 2;
    const rightEdge = px + PADDLE_W / 2;

    debugLog(room.id,
      `⚡ Bottom paddle zone: ball.x=${nx.toFixed(1)} paddle=[${leftEdge.toFixed(1)},${rightEdge.toFixed(1)}]` +
      ` hit=${nx > leftEdge && nx < rightEdge}`
    );

    if (nx > leftEdge && nx < rightEdge) {
      const hitPos = clamp((nx - px) / (PADDLE_W / 2), -1, 1);
      b.dx  = clamp(hitPos * 1.2 + randF(-0.2, 0.2), -0.95, 0.95);
      b.dy  = -Math.abs(b.dy);
      normalise(b);
      b.speed = Math.min(b.speed + SPEED_STEP_HIT, MAX_SPEED);
      ny = BOTTOM_PADDLE_Y - PADDLE_H / 2 - BALL_RADIUS;

      const score = INITIAL_HEALTH - room.health.top;
      io.to(room.id).emit('paddleHit', { role: 'bottom', score });
      debugLog(room.id, `✅ Bottom paddle HIT at x=${nx.toFixed(1)}, new dy=${b.dy.toFixed(3)}`);
    }
  }

  // ── Top paddle (ball moving upward, dy < 0) ────────────────────────
  if (
    b.dy < 0 &&
    ny - BALL_RADIUS <= TOP_PADDLE_Y + PADDLE_H / 2 &&
    ny + BALL_RADIUS >= TOP_PADDLE_Y - PADDLE_H / 2
  ) {
    const px      = room.paddles.top;
    const leftEdge  = px - PADDLE_W / 2;
    const rightEdge = px + PADDLE_W / 2;

    debugLog(room.id,
      `⚡ Top paddle zone: ball.x=${nx.toFixed(1)} paddle=[${leftEdge.toFixed(1)},${rightEdge.toFixed(1)}]` +
      ` hit=${nx > leftEdge && nx < rightEdge}`
    );

    if (nx > leftEdge && nx < rightEdge) {
      const hitPos = clamp((nx - px) / (PADDLE_W / 2), -1, 1);
      b.dx  = clamp(hitPos * 1.2 + randF(-0.2, 0.2), -0.95, 0.95);
      b.dy  = Math.abs(b.dy);
      normalise(b);
      b.speed = Math.min(b.speed + SPEED_STEP_HIT, MAX_SPEED);
      ny = TOP_PADDLE_Y + PADDLE_H / 2 + BALL_RADIUS;

      const score = INITIAL_HEALTH - room.health.bottom;
      io.to(room.id).emit('paddleHit', { role: 'top', score });
      debugLog(room.id, `✅ Top paddle HIT at x=${nx.toFixed(1)}, new dy=${b.dy.toFixed(3)}`);
    }
  }

  // ── Ball escapes top → bottom player scores ────────────────────────
  if (ny - BALL_RADIUS <= 0) {
    room.health.top = Math.max(0, room.health.top - 1);
    debugLog(room.id,
      `🔴 Ball escaped TOP. bottom scores. health: bottom=${room.health.bottom} top=${room.health.top}` +
      ` top paddle was at x=${room.paddles.top.toFixed(1)}, ball.x=${nx.toFixed(1)}`
    );
    io.to(room.id).emit('point', { scorer: 'bottom', health: room.health });
    if (room.health.top <= 0) { endGame(room, 'bottom'); return; }
    room.ball = randomBallState();
    room.ball.dy = Math.abs(room.ball.dy);
    emitBallReset(room);
    return;
  }

  // ── Ball escapes bottom → top player scores ────────────────────────
  if (ny + BALL_RADIUS >= GAME_HEIGHT) {
    room.health.bottom = Math.max(0, room.health.bottom - 1);
    debugLog(room.id,
      `🔴 Ball escaped BOTTOM. top scores. health: bottom=${room.health.bottom} top=${room.health.top}` +
      ` bottom paddle was at x=${room.paddles.bottom.toFixed(1)}, ball.x=${nx.toFixed(1)}`
    );
    io.to(room.id).emit('point', { scorer: 'top', health: room.health });
    if (room.health.bottom <= 0) { endGame(room, 'top'); return; }
    room.ball = randomBallState();
    room.ball.dy = Math.abs(room.ball.dy);
    emitBallReset(room);
    return;
  }

  b.x = nx;
  b.y = ny;

  emitGameState(room, verbose);
}

function endGame(room, winnerRole) {
  room.active = false;
  clearInterval(room.tickInterval);
  const winner = room.players.find(p => p.role === winnerRole);
  debugLog(room.id, `🏁 Game over. Winner: ${winnerRole} (${winner?.username})`);
  io.to(room.id).emit('gameOver', {
    winnerRole,
    winnerUsername: winner?.username || 'Unknown'
  });
  setTimeout(() => rooms.delete(room.id), 30000);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function normalise(b) {
  const len = Math.sqrt(b.dx * b.dx + b.dy * b.dy);
  if (len > 0) { b.dx /= len; b.dy /= len; }
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function randF(min, max)     { return Math.random() * (max - min) + min; }

// ─── Socket events ────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`🔌 Connected: ${socket.id}`);

  socket.on('joinRoom', ({ roomId, username, uid, role }) => {
    let room = rooms.get(roomId);

    if (!room) {
      room = createRoom(roomId);
      rooms.set(roomId, room);
      console.log(`🏠 Room created: ${roomId}`);
    }

    if (room.players.find(p => p.socketId === socket.id)) {
      console.log(`⚠️ Duplicate join ignored: ${socket.id}`);
      return;
    }

    room.players.push({ socketId: socket.id, username, uid, role });
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.role   = role;

    socket.emit('roomJoined', { roomId, role });
    console.log(`👤 ${username} joined ${roomId} as ${role} (${room.players.length}/2)`);

    // Log current paddle positions at join time
    debugLog(roomId, `Paddles at join: bottom=${room.paddles.bottom} top=${room.paddles.top}`);

    if (room.players.length === 2) {
      const names = {
        bottom: room.players.find(p => p.role === 'bottom')?.username || '?',
        top:    room.players.find(p => p.role === 'top')?.username    || '?'
      };

      debugLog(roomId, `Game starting: bottom=${names.bottom}, top=${names.top}`);
      debugLog(roomId, `Initial ball state: x=${room.ball.x} y=${room.ball.y} dx=${room.ball.dx.toFixed(3)} dy=${room.ball.dy.toFixed(3)}`);

      // Send each player their opponent's name
      for (const player of room.players) {
        const s = io.sockets.sockets.get(player.socketId);
        if (!s) continue;
        s.emit('gameStart', {
          opponentName: player.role === 'bottom' ? names.top : names.bottom,
          myRole:       player.role
        });
      }

      room.active = true;
      room.tickInterval = setInterval(() => tickRoom(room), TICK_MS);
      console.log(`🎮 Game started: ${roomId}`);
    }
  });

  // Client sends its own paddle X from ITS bottom-of-screen perspective
  socket.on('paddleMove', ({ x }) => {
    const room = rooms.get(socket.data.roomId);
    if (!room || !room.active) return;

    const role    = socket.data.role;
    const clamped = clamp(x, MIN_PADDLE_X, MAX_PADDLE_X);

    // DEBUG: Log paddle updates occasionally
    if (room.tickCount % (DEBUG_EVERY_N_TICKS * 2) === 0) {
      debugLog(room.id, `paddleMove from ${role}: x=${x.toFixed(1)} → clamped=${clamped.toFixed(1)}`);
    }

    room.paddles[role] = clamped;
  });

  socket.on('disconnect', () => {
    const room = rooms.get(socket.data?.roomId);
    if (!room) return;
    console.log(`❌ Disconnected: ${socket.id}`);
    if (room.active) {
      const remaining = room.players.find(p => p.socketId !== socket.id);
      if (remaining) endGame(room, remaining.role);
    }
    rooms.delete(room.id);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`🚀 Ball Crush server (DEBUG) on port ${PORT}`);
  console.log(`   BOTTOM_PADDLE_Y=${BOTTOM_PADDLE_Y}  TOP_PADDLE_Y=${TOP_PADDLE_Y}`);
  console.log(`   GAME_HEIGHT=${GAME_HEIGHT}  Perspective flip: topY = ${GAME_HEIGHT} - serverY`);
});