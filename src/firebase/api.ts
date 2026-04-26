// src/firebase/api.ts
//
// Single fetch wrapper for the game server REST API.
// This is the ONLY networking layer in the client.
// Zero Firebase SDK usage — no ref(), no get(), no db.
// Every read and write goes through the game server.

const BASE = (import.meta.env.VITE_SOCKET_URL ?? 'https://game-server-xvdu.onrender.com').replace(/\/$/, '');

type Method = 'GET' | 'POST';

async function request<T = any>(method: Method, path: string, body?: object): Promise<T> {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  const res  = await fetch(`${BASE}${path}`, opts);
  const json = await res.json();
  if (!json.success && json.error) console.warn(`[API] ${method} ${path} →`, json.error);
  return json;
}

export const api = {

  // ── User / Profile ────────────────────────────────────────────────────────────
  /** Full user object — wallet, public, games. Server strips private fields. */
  getUser:    (uid: string) => request('GET', `/api/user/${uid}`),
  /** Lobby data for a match */
  getLobby:   (lobbyId: string) => request('GET', `/api/lobby/${lobbyId}`),

  // ── Wallet ────────────────────────────────────────────────────────────────────
  getBalance: (uid: string) =>
    request<{ success: boolean; balance: number }>('GET', `/api/wallet/${uid}/balance`),
  getWallet:  (uid: string) => request('GET', `/api/wallet/${uid}`),
  /**
   * Atomic wallet transaction — runs as a Firebase transaction on the server.
   * type: 'win' | 'loss' | 'game_fee' | 'refund' | 'deposit' | 'withdrawal' | 'bonus'
   * Returns the new balance on success.
   */
  transact: (uid: string, amount: number, type: string, description: string) =>
    request<{ success: boolean; balance: number; error?: string }>(
      'POST', `/api/wallet/${uid}/transact`, { amount, type, description }
    ),

  // ── Stats ─────────────────────────────────────────────────────────────────────
  getStats: (uid: string, gameId: string) =>
    request('GET', `/api/stats/${uid}/${gameId}`),
  /** One call — updates stats + user_profiles + leaderboard + score log */
  updateStats: (uid: string, gameId: string, payload: {
    score: number; won: boolean; duration?: number; flaps?: number; distance?: number;
  }) => request('POST', `/api/stats/${uid}/${gameId}/update`, payload),
  /** Checkers variant — adds piecesCaptured / kingsMade / moves */
  updateCheckersStats: (uid: string, payload: {
    won: boolean; piecesCaptured: number; kingsMade: number; moves: number;
  }) => request('POST', `/api/checkers/stats/${uid}`, payload),

  // ── Leaderboards ──────────────────────────────────────────────────────────────
  getLeaderboard:    (gameId: string, limit = 10) =>
    request('GET', `/api/leaderboard/${gameId}?limit=${limit}`),
  getAllLeaderboard:  (limit = 100) =>
    request('GET', `/api/leaderboard-all?limit=${limit}`),
  getRank:           (uid: string, gameId: string) =>
    request<{ success: boolean; rank: number; total: number }>('GET', `/api/rank/${uid}/${gameId}`),
  getRankByUsername: (username: string, gameId: string) =>
    request<{ success: boolean; rank: number; total: number }>(
      'GET', `/api/rank-by-username/${encodeURIComponent(username)}/${gameId}`
    ),

  // ── Score history ─────────────────────────────────────────────────────────────
  getScores: (uid: string, gameId: string, limit = 10) =>
    request('GET', `/api/scores/${uid}/${gameId}?limit=${limit}`),

  // ── Winnings (prize tracking, non-spendable) ──────────────────────────────────
  addWinnings: (uid: string, amount: number, description: string, game = 'checkers') =>
    request('POST', `/api/winnings/${uid}`, { amount, description, game }),
  getWinnings: (uid: string, game = 'checkers') =>
    request<{ success: boolean; total: number }>('GET', `/api/winnings/${uid}/${game}`),

  // ── Online / game status (was checkersMultiplayer.setPlayerOnline etc.) ────────
  setOnline:     (uid: string, online: boolean) =>
    request('POST', `/api/online/${uid}`, { online }),
  setGameStatus: (uid: string, inGame: boolean, lobbyId?: string) =>
    request('POST', `/api/online/${uid}/game`, { inGame, lobbyId }),

  // ── Tournament ────────────────────────────────────────────────────────────────
  getTournamentStatus: (gameId: string) =>
    request('GET', `/api/tournament/${gameId}/current`),
  recordTournamentGame: (gameId: string, uid: string, username: string, displayName: string, score: number) =>
    request('POST', `/api/tournament/${gameId}/record`, { uid, username, displayName, score }),
  getTournamentHistory: (gameId: string, limit = 10) =>
    request('GET', `/api/tournament/${gameId}/history?limit=${limit}`),

  // ── Session lock (duplicate login detection) ──────────────────────────────────
  /**
   * Atomically claim a session slot on the server.
   * Returns { success, blocked } — blocked=true means another device is already logged in.
   */
  claimSession: (uid: string, sessionId: string, userAgent: string) =>
    request<{ success: boolean; blocked: boolean; error?: string }>(
      'POST', `/api/session/${uid}/claim`, { sessionId, userAgent }
    ),
  releaseSession: (uid: string, sessionId: string) =>
    request('POST', `/api/session/${uid}/release`, { sessionId }),

  // ── Game logs ─────────────────────────────────────────────────────────────────
  flushLogs: (lobbyId: string, uid: string, logs: { message: string; additionalData?: any; timestamp: number }[]) =>
    request('POST', `/api/logs/${lobbyId}/${uid}`, { logs }),
  cleanupLogs: (lobbyId: string, uid: string, keep = 1000) =>
    request('GET', `/api/logs/${lobbyId}/${uid}/cleanup?keep=${keep}`),
};

// Re-export with logs methods added