/**
 * Ball Crush Multiplayer Server
 * - Socket.IO for real-time communication
 * - Server is authoritative for ball physics only
 * - Room IDs come from Firebase lobby IDs
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3001;

// ─── Constants ────────────────────────────────────────────────────────────────
const GAME_WIDTH      = 360;
const GAME_HEIGHT     = 640;
const BALL_RADIUS     = 12;
const PADDLE_W        = 70;
const PADDLE_H        = 20;
const INITIAL_SPEED   = 200;
const MAX_SPEED       = 400;
const SPEED_STEP_BALL = 3;
const SPEED_STEP_PLR  = 5;
const SPEED_INTERVAL  = 30;
const SPEED_FACTOR    = 1.5;
const TICK_RATE       = 60;
const TICK_MS         = 1000 / TICK_RATE;
const INITIAL_HEALTH  = 5;
const MIN_PADDLE_X    = 35;   // Left boundary (paddle width 70, half is 35)
const MAX_PADDLE_X    = 325;  // Right boundary (360 - 35)

// ─── Room management ──────────────────────────────────────────────────────────
const rooms = new Map();

function createBallState() {
  const angle = [45, 135, 225, 315][Math.floor(Math.random() * 4)];
  const rad = (angle * Math.PI) / 180;
  return {
    x: GAME_WIDTH / 2,
    y: GAME_HEIGHT / 2,
    dx: Math.cos(rad),
    dy: Math.sin(rad),
    speed: INITIAL_SPEED
  };
}

function createRoom(roomId) {
  return {
    id: roomId,
    players: [],
    ball: createBallState(),
    paddles: {
      bottom: GAME_WIDTH / 2,
      top:    GAME_WIDTH / 2
    },
    health: {
      bottom: INITIAL_HEALTH,
      top:    INITIAL_HEALTH
    },
    active: false,
    tickInterval: null,
    lastSpeedBump: Date.now(),
    speedMultiplier: 1.0
  };
}

// ─── Ball physics tick ────────────────────────────────────────────────────────
function tickRoom(room) {
  if (!room.active) return;

  const dt = TICK_MS / 1000;
  const b  = room.ball;

  // Global speed bump every SPEED_INTERVAL seconds
  const now = Date.now();
  if ((now - room.lastSpeedBump) / 1000 >= SPEED_INTERVAL) {
    room.speedMultiplier *= SPEED_FACTOR;
    b.speed = Math.min(INITIAL_SPEED * room.speedMultiplier, MAX_SPEED);
    room.lastSpeedBump = now;
    io.to(room.id).emit('speedBump', { multiplier: room.speedMultiplier });
  }

  let nx = b.x + b.dx * b.speed * dt;
  let ny = b.y + b.dy * b.speed * dt;

  // Wall bounce (left/right)
  if (nx - BALL_RADIUS <= 0 || nx + BALL_RADIUS >= GAME_WIDTH) {
    b.dx *= -1;
    nx = Math.max(BALL_RADIUS, Math.min(GAME_WIDTH - BALL_RADIUS, nx));
  }

  const bottomY = 550;
  const topY    = 50;

  // Bottom paddle collision
  if (b.dy > 0 && ny + BALL_RADIUS >= bottomY - PADDLE_H / 2 && ny - BALL_RADIUS <= bottomY + PADDLE_H / 2) {
    const px = room.paddles.bottom;
    if (nx > px - PADDLE_W / 2 && nx < px + PADDLE_W / 2) {
      const hitPos = (nx - px) / (PADDLE_W / 2);
      b.dx = clamp(hitPos * 1.2 + randF(-0.3, 0.3), -0.9, 0.9);
      b.dy = -Math.abs(b.dy || -0.7);
      normalise(b);
      b.speed = Math.min(b.speed + SPEED_STEP_PLR, MAX_SPEED);
      ny = bottomY - PADDLE_H / 2 - BALL_RADIUS;
      io.to(room.id).emit('paddleHit', { role: 'bottom', score: scoreOf(room, 'bottom') });
    }
  }

  // Top paddle collision
  if (b.dy < 0 && ny - BALL_RADIUS <= topY + PADDLE_H / 2 && ny + BALL_RADIUS >= topY - PADDLE_H / 2) {
    const px = room.paddles.top;
    if (nx > px - PADDLE_W / 2 && nx < px + PADDLE_W / 2) {
      const hitPos = (nx - px) / (PADDLE_W / 2);
      b.dx = clamp(hitPos * 1.2 + randF(-0.3, 0.3), -0.9, 0.9);
      b.dy = Math.abs(b.dy || 0.7);
      normalise(b);
      b.speed = Math.min(b.speed + SPEED_STEP_BALL, MAX_SPEED);
      ny = topY + PADDLE_H / 2 + BALL_RADIUS;
      io.to(room.id).emit('paddleHit', { role: 'top', score: scoreOf(room, 'top') });
    }
  }

  // Ball escapes top → bottom player scores
  if (ny - BALL_RADIUS <= 0) {
    room.health.top = Math.max(0, room.health.top - 1);
    io.to(room.id).emit('point', { scorer: 'bottom', health: room.health });
    if (room.health.top <= 0) { endGame(room, 'bottom'); return; }
    resetBall(room, 'bottom');
    return;
  }

  // Ball escapes bottom → top player scores
  if (ny + BALL_RADIUS >= GAME_HEIGHT) {
    room.health.bottom = Math.max(0, room.health.bottom - 1);
    io.to(room.id).emit('point', { scorer: 'top', health: room.health });
    if (room.health.bottom <= 0) { endGame(room, 'top'); return; }
    resetBall(room, 'top');
    return;
  }

  b.x = nx;
  b.y = ny;

  io.to(room.id).emit('gameState', {
    ball:    { x: b.x, y: b.y },
    paddles: room.paddles,
    health:  room.health
  });
}

function resetBall(room, serveToward) {
  room.ball = createBallState();
  if (serveToward === 'bottom') {
    room.ball.dy = Math.abs(room.ball.dy);
  } else {
    room.ball.dy = -Math.abs(room.ball.dy);
  }
  io.to(room.id).emit('ballReset', { ball: room.ball });
}

function endGame(room, winnerRole) {
  room.active = false;
  clearInterval(room.tickInterval);
  const winnerPlayer = room.players.find(p => p.role === winnerRole);
  io.to(room.id).emit('gameOver', {
    winnerRole,
    winnerUsername: winnerPlayer?.username || 'Unknown'
  });
  setTimeout(() => rooms.delete(room.id), 30000);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function normalise(b) {
  const len = Math.sqrt(b.dx * b.dx + b.dy * b.dy);
  if (len > 0) { b.dx /= len; b.dy /= len; }
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function randF(min, max) {
  return Math.random() * (max - min) + min;
}

function scoreOf(room, role) {
  const other = role === 'bottom' ? 'top' : 'bottom';
  return INITIAL_HEALTH - room.health[other];
}

// ─── Socket.IO events ─────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`🔌 Connected: ${socket.id}`);

  // Both players join using the Firebase lobbyId as the roomId
  socket.on('joinRoom', ({ roomId, username, uid, role }) => {
    let room = rooms.get(roomId);

    // Create room if first player to connect
    if (!room) {
      room = createRoom(roomId);
      rooms.set(roomId, room);
      console.log(`🏠 Room created: ${roomId}`);
    }

    // Prevent duplicate joins
    if (room.players.find(p => p.id === socket.id)) {
      console.log(`⚠️ Player already in room`);
      return;
    }

    room.players.push({ id: socket.id, username, uid, role });
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.role   = role;

    socket.emit('roomJoined', { roomId, role });
    console.log(`👤 ${username} joined room ${roomId} as ${role} (${room.players.length}/2)`);

    // Start game when both players are connected
    if (room.players.length === 2) {
      const playerNames = {
        bottom: room.players.find(p => p.role === 'bottom')?.username,
        top:    room.players.find(p => p.role === 'top')?.username
      };
      io.to(roomId).emit('gameStart', { players: playerNames, health: room.health });

      room.active = true;
      room.tickInterval = setInterval(() => tickRoom(room), TICK_MS);
      console.log(`🎮 Game started in room ${roomId}`);
    }
  });

  // Client sends its paddle X position every frame
  socket.on('paddleMove', ({ x }) => {
    const room = rooms.get(socket.data.roomId);
    if (!room || !room.active) return;
    // Clamp to correct boundaries
    const clampedX = Math.max(MIN_PADDLE_X, Math.min(MAX_PADDLE_X, x));
    room.paddles[socket.data.role] = clampedX;
  });

  // Disconnect — forfeit if game was active
  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return;

    console.log(`❌ Disconnected: ${socket.id} from room ${room.id}`);

    if (room.active) {
      const remaining = room.players.find(p => p.id !== socket.id);
      if (remaining) {
        endGame(room, remaining.role);
      }
    }

    rooms.delete(room.id);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`🚀 Ball Crush server running on port ${PORT}`);
  console.log(`   Game boundaries: ${MIN_PADDLE_X} - ${MAX_PADDLE_X}`);
  console.log(`   Initial speed: ${INITIAL_SPEED}, Max speed: ${MAX_SPEED}`);
});