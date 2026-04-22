// src/firebase/ballCrushSimple.ts
import { ref, get, set, push, update, runTransaction } from 'firebase/database';
import { db } from './init';

type WalletTransactionType = 'bonus' | 'deposit' | 'withdrawal' | 'win' | 'loss' | 'game_fee' | 'refund';

// =========== INTERFACES ===========

export interface BallCrushUserData {
  username: string;
  displayName: string;
  avatar: string;
  rank: string;
  level: number;
  createdAt: string;
  totalWinnings: number;
  winningsCount: number;
  lastWinDate?: string;
  highScore: number;
  totalGames: number;
  totalWins: number;
  totalLosses: number;
  winStreak: number;
  bestWinStreak: number;
  totalScore: number;
  averageScore: number;
  experience: number;
  achievements: string[];
  balance: number;
  totalDeposited: number;
  totalWithdrawn: number;
  totalWon: number;
  totalLost: number;
  totalBonus: number;
  lastLogin: string;
  isActive: boolean;
}

export interface BallCrushLeaderboardEntry {
  username: string;
  displayName: string;
  highScore: number;
  rank: string;
  level: number;
  totalWins: number;
  winRate: number;
}

export interface BallCrushScoreEntry {
  id?: string;
  date: string;
  score: number;
  won: boolean;
  timestamp: number;
  game?: string;
}

// =========== DEFAULT USER DATA ===========

function getDefaultBallCrushUserData(username: string): BallCrushUserData {
  return {
    username,
    displayName: username,
    avatar: 'default',
    rank: 'Bronze',
    level: 1,
    createdAt: new Date().toISOString(),
    totalWinnings: 0,
    winningsCount: 0,
    highScore: 0,
    totalGames: 0,
    totalWins: 0,
    totalLosses: 0,
    winStreak: 0,
    bestWinStreak: 0,
    totalScore: 0,
    averageScore: 0,
    experience: 0,
    achievements: [],
    balance: 10.00,
    totalDeposited: 0,
    totalWithdrawn: 0,
    totalWon: 0,
    totalLost: 0,
    totalBonus: 10.00,
    lastLogin: new Date().toISOString(),
    isActive: true,
  };
}

// =========== WALLET SHAPE NORMALISER ===========
//
// Firebase can give us three different shapes at wallets/{uid}:
//   A) Object  { balance: 5, totalDeposited: 0, ... }  ← normal
//   B) Number  5                                        ← legacy / bad write
//   C) null                                             ← new user
//
// runTransaction receives raw DB data so we MUST handle all three.

function normaliseWallet(raw: any): Record<string, any> & { balance: number } {
  if (typeof raw === 'number') {
    return {
      balance: raw,
      totalDeposited: 0,
      totalWithdrawn: 0,
      totalWon: 0,
      totalLost: 0,
      totalBonus: raw,
      totalGameFees: 0,
      totalRefunds: 0,
      currency: 'USD',
      isActive: true,
    };
  }

  if (!raw || typeof raw !== 'object') {
    return {
      balance: 0,
      totalDeposited: 0,
      totalWithdrawn: 0,
      totalWon: 0,
      totalLost: 0,
      totalBonus: 0,
      totalGameFees: 0,
      totalRefunds: 0,
      currency: 'USD',
      isActive: true,
    };
  }

  return {
    ...raw,
    balance:        typeof raw.balance === 'number' ? raw.balance : 0,
    totalDeposited: raw.totalDeposited ?? 0,
    totalWithdrawn: raw.totalWithdrawn ?? 0,
    totalWon:       raw.totalWon       ?? 0,
    totalLost:      raw.totalLost      ?? 0,
    totalBonus:     raw.totalBonus     ?? 0,
    totalGameFees:  raw.totalGameFees  ?? 0,
    totalRefunds:   raw.totalRefunds   ?? 0,
    currency:       raw.currency       ?? 'USD',
    isActive:       raw.isActive       ?? true,
  };
}

// =========== GET BALANCE ===========
//
// Single source of truth: wallets/{uid}.
// Falls back to users/{uid}/wallet only if the primary path doesn't exist.

export async function getBallCrushBalance(uid: string): Promise<number> {
  try {
    const primary = await get(ref(db, `wallets/${uid}`));
    if (primary.exists()) {
      const balance = normaliseWallet(primary.val()).balance;
      console.log(`💰 Balance for ${uid}: $${balance}`);
      return balance;
    }

    // Fallback for accounts that only have the secondary path
    const secondary = await get(ref(db, `users/${uid}/wallet`));
    if (secondary.exists()) {
      const balance = normaliseWallet(secondary.val()).balance;
      console.log(`💰 Balance (fallback) for ${uid}: $${balance}`);
      return balance;
    }

    return 0;
  } catch (error) {
    console.error('Error getting balance:', error);
    return 0;
  }
}

// =========== UPDATE WALLET BALANCE (fully atomic) ===========
//
// Strategy:
//   1. PRIMARY path is wallets/{uid} — always the source of truth.
//   2. SECONDARY path users/{uid}/wallet is kept in sync with a targeted
//      update() after the primary transaction commits — only the balance
//      field is touched, so no stat fields are destroyed.
//   3. If the primary path doesn't exist we fall back to the secondary.
//      This handles legacy accounts created before the wallets/ path existed.
//
// ALL balance changes go through here: game_fee, refund, win, etc.

export async function updateBallCrushWalletBalance(
  uid: string,
  amount: number,
  type: WalletTransactionType,
  description: string
): Promise<boolean> {
  if (!uid) {
    console.error('❌ updateBallCrushWalletBalance: uid is required');
    return false;
  }

  const deductionTypes: WalletTransactionType[] = ['game_fee', 'loss', 'withdrawal'];
  const isDeduction  = deductionTypes.includes(type);
  const magnitude    = Math.abs(amount);
  const signedAmount = isDeduction ? -magnitude : magnitude;

  console.log(`💰 Wallet txn — uid=${uid} type=${type} signedAmount=${signedAmount}`);

  // Determine which path actually holds the wallet
  const primarySnap = await get(ref(db, `wallets/${uid}`));
  const walletPath  = primarySnap.exists()
    ? `wallets/${uid}`
    : `users/${uid}/wallet`;

  // Pre-flight balance check (avoids unnecessary transaction round-trips)
  if (isDeduction) {
    const checkSnap = primarySnap.exists()
      ? primarySnap
      : await get(ref(db, walletPath));

    if (!checkSnap.exists()) {
      console.log(`❌ Wallet not found at ${walletPath}`);
      return false;
    }

    const currentBalance = normaliseWallet(checkSnap.val()).balance;
    if (currentBalance < magnitude) {
      console.log(`❌ Insufficient funds: have $${currentBalance}, need $${magnitude}`);
      return false;
    }
  }

  const walletRef = ref(db, walletPath);
  let insufficientFunds = false;
  let finalBalance = 0;

  try {
    const result = await runTransaction(walletRef, (rawData) => {
      insufficientFunds = false;

      const wallet = normaliseWallet(rawData);

      // rawData===null means the node was deleted between our read and the txn.
      // Return the normalised shell so Firebase creates it rather than aborting.
      if (rawData === null) return wallet;

      if (isDeduction && wallet.balance < magnitude) {
        insufficientFunds = true;
        return undefined; // abort
      }

      const newBalance = wallet.balance + signedAmount;
      if (newBalance < 0) {
        insufficientFunds = true;
        return undefined; // abort
      }

      // Update running totals
      switch (type) {
        case 'win':        wallet.totalWon       = (wallet.totalWon       ?? 0) + magnitude; break;
        case 'loss':       wallet.totalLost      = (wallet.totalLost      ?? 0) + magnitude; break;
        case 'deposit':    wallet.totalDeposited = (wallet.totalDeposited ?? 0) + magnitude; break;
        case 'withdrawal': wallet.totalWithdrawn = (wallet.totalWithdrawn ?? 0) + magnitude; break;
        case 'bonus':      wallet.totalBonus     = (wallet.totalBonus     ?? 0) + magnitude; break;
        case 'game_fee':   wallet.totalGameFees  = (wallet.totalGameFees  ?? 0) + magnitude; break;
        case 'refund':     wallet.totalRefunds   = (wallet.totalRefunds   ?? 0) + magnitude; break;
      }

      wallet.balance     = newBalance;
      wallet.lastUpdated = new Date().toISOString();
      finalBalance       = newBalance;

      return wallet;
    });

    if (insufficientFunds) {
      console.log(`❌ Txn aborted: insufficient funds`);
      return false;
    }

    if (!result.committed) {
      console.error(`❌ Wallet transaction failed to commit`);
      return false;
    }

    console.log(`✅ Wallet committed — new balance: $${finalBalance.toFixed(2)}`);

    // ── Sync secondary path ──────────────────────────────────────────────────
    // Only update the balance + lastUpdated fields — never overwrite stat
    // fields on the secondary copy (they may be more up-to-date than our view).
    const secondaryPath = walletPath === `wallets/${uid}`
      ? `users/${uid}/wallet`
      : `wallets/${uid}`;

    update(ref(db, secondaryPath), {
      balance:     finalBalance,
      lastUpdated: new Date().toISOString(),
    }).catch((err) => console.warn(`⚠️ Secondary sync failed (${secondaryPath}):`, err));

    // ── Log transaction ──────────────────────────────────────────────────────
    set(push(ref(db, `transactions/${uid}`)), {
      type,
      amount:       signedAmount,
      balanceAfter: finalBalance,
      description,
      timestamp:    new Date().toISOString(),
    }).catch((err) => console.warn('⚠️ Transaction log write failed:', err));

    return true;

  } catch (error) {
    console.error(`❌ Wallet transaction threw:`, error);
    return false;
  }
}

// =========== LEGACY DEDUCT ===========
// Kept for callers not yet migrated. New code should call
// updateBallCrushWalletBalance directly with type='game_fee'.

export async function deductBallCrushWalletBalance(
  uid: string,
  amount: number,
  description: string
): Promise<boolean> {
  return updateBallCrushWalletBalance(uid, amount, 'game_fee', description);
}

// =========== GET USER DATA ===========

export async function getBallCrushUserData(uid: string): Promise<BallCrushUserData | null> {
  try {
    console.log(`📡 Fetching Ball Crush data for UID: ${uid}`);

    const userSnapshot = await get(ref(db, `users/${uid}`));

    if (!userSnapshot.exists()) {
      console.log('❌ User data not found for UID:', uid);
      return getDefaultBallCrushUserData('Player');
    }

    const userData = userSnapshot.val();
    const balance  = await getBallCrushBalance(uid);

    const gameStats = userData.games?.['ball-crush'] || {
      highScore: 0, totalGames: 0, totalWins: 0, totalLosses: 0,
      winStreak: 0, bestWinStreak: 0, totalScore: 0, averageScore: 0,
      experience: 0, achievements: [],
    };

    const winnings = userData.winnings || { total: 0, count: 0 };

    return {
      username:      userData.public?.username    || 'Player',
      displayName:   userData.public?.displayName || 'Player',
      avatar:        userData.public?.avatar      || 'default',
      rank:          userData.public?.globalRank  || 'Bronze',
      level:         userData.public?.globalLevel || 1,
      createdAt:     userData.metadata?.createdAt || new Date().toISOString(),
      totalWinnings: winnings.total || 0,
      winningsCount: winnings.count || 0,
      lastWinDate:   winnings.lastWin,
      highScore:     gameStats.highScore     || 0,
      totalGames:    gameStats.totalGames    || 0,
      totalWins:     gameStats.totalWins     || 0,
      totalLosses:   gameStats.totalLosses   || 0,
      winStreak:     gameStats.winStreak     || 0,
      bestWinStreak: gameStats.bestWinStreak || 0,
      totalScore:    gameStats.totalScore    || 0,
      averageScore:  gameStats.averageScore  || 0,
      experience:    gameStats.experience    || 0,
      achievements:  gameStats.achievements  || [],
      balance,
      totalDeposited: userData.wallet?.totalDeposited || 0,
      totalWithdrawn: userData.wallet?.totalWithdrawn || 0,
      totalWon:       userData.wallet?.totalWon       || 0,
      totalLost:      userData.wallet?.totalLost      || 0,
      totalBonus:     userData.wallet?.totalBonus     || 0,
      lastLogin:      userData.private?.lastLogin     || new Date().toISOString(),
      isActive:       userData.public?.isOnline       || false,
    };

  } catch (error) {
    console.error('❌ Error fetching Ball Crush user data:', error);
    return getDefaultBallCrushUserData('Player');
  }
}

// =========== PROFILE STATS ===========

export async function updateBallCrushProfileStats(
  uid: string,
  score: number,
  won: boolean,
  duration: number
): Promise<void> {
  try {
    console.log(`📊 Updating profile stats for UID: ${uid}`);

    const [userSnapshot, profileSnapshot] = await Promise.all([
      get(ref(db, `users/${uid}`)),
      get(ref(db, `user_profiles/${uid}`)),
    ]);

    let currentStats: any = {};

    if (userSnapshot.exists()) {
      currentStats = userSnapshot.val().games?.ballCrush || {};
    }

    if (profileSnapshot.exists()) {
      const p = profileSnapshot.val();
      currentStats = {
        ...currentStats,
        highScore:     p.highScore     || 0,
        totalGames:    p.totalGames    || 0,
        totalWins:     p.totalWins     || 0,
        totalLosses:   p.totalLosses   || 0,
        winStreak:     p.winStreak     || 0,
        bestWinStreak: p.bestWinStreak || 0,
        displayName:   p.displayName,
        avatar:        p.avatar,
      };
    }

    const newTotalGames    = (currentStats.totalGames  || 0) + 1;
    const newTotalScore    = (currentStats.totalScore  || 0) + score;
    const newAverageScore  = Math.floor(newTotalScore / newTotalGames);
    const newHighScore     = Math.max(currentStats.highScore || 0, score);
    let newTotalWins       = currentStats.totalWins     || 0;
    let newTotalLosses     = currentStats.totalLosses   || 0;
    let newWinStreak       = currentStats.winStreak     || 0;
    let newBestWinStreak   = currentStats.bestWinStreak || 0;

    if (won) {
      newTotalWins++;
      newWinStreak++;
      newBestWinStreak = Math.max(newBestWinStreak, newWinStreak);
    } else {
      newTotalLosses++;
      newWinStreak = 0;
    }

    const winRate = newTotalGames > 0
      ? Math.round((newTotalWins / newTotalGames) * 100)
      : 0;

    let newRank = 'Bronze';
    if      (newHighScore >= 1000 || newTotalWins >= 50) newRank = 'Diamond';
    else if (newHighScore >= 500  || newTotalWins >= 25) newRank = 'Platinum';
    else if (newHighScore >= 250  || newTotalWins >= 10) newRank = 'Gold';
    else if (newHighScore >= 100  || newTotalWins >= 5)  newRank = 'Silver';

    const newLevel = Math.floor(1 + newTotalGames / 10);

    const updates = {
      highScore: newHighScore, totalGames: newTotalGames,
      totalWins: newTotalWins, totalLosses: newTotalLosses,
      winStreak: newWinStreak, bestWinStreak: newBestWinStreak,
      totalScore: newTotalScore, averageScore: newAverageScore,
      rank: newRank, level: newLevel, winRate,
      lastPlayed: new Date().toISOString(),
    };

    await update(ref(db, `users/${uid}/games/ball-crush`), updates);

    const publicData = userSnapshot.exists() ? userSnapshot.val().public : {};
    await set(ref(db, `user_profiles/${uid}`), {
      uid,
      username:      publicData.username    || 'unknown',
      displayName:   publicData.displayName || 'Player',
      avatar:        publicData.avatar      || 'default',
      highScore:     newHighScore,
      totalGames:    newTotalGames,
      totalWins:     newTotalWins,
      totalLosses:   newTotalLosses,
      winStreak:     newWinStreak,
      bestWinStreak: newBestWinStreak,
      rank:          newRank,
      level:         newLevel,
      winRate,
      lastUpdated: new Date().toISOString(),
    });

    console.log(`✅ Profile stats updated:`, updates);

  } catch (error) {
    console.error('❌ Error updating profile stats:', error);
  }
}

export async function getBallCrushProfileStats(uid: string): Promise<any> {
  try {
    const profileSnap = await get(ref(db, `user_profiles/${uid}`));
    if (profileSnap.exists()) return profileSnap.val();

    const gamesSnap = await get(ref(db, `users/${uid}/games/ball-crush`));
    return gamesSnap.exists() ? gamesSnap.val() : null;
  } catch (error) {
    console.error('Error getting profile stats:', error);
    return null;
  }
}

export async function getBallCrushLeaderboard(
  limit: number = 10
): Promise<BallCrushLeaderboardEntry[]> {
  try {
    const snapshot = await get(ref(db, 'user_profiles'));
    if (!snapshot.exists()) return [];

    const leaderboard: BallCrushLeaderboardEntry[] = [];
    snapshot.forEach((child) => {
      const d = child.val();
      leaderboard.push({
        username:    d.username    || 'unknown',
        displayName: d.displayName || 'Unknown',
        highScore:   d.highScore   || 0,
        rank:        d.rank        || 'Bronze',
        level:       d.level       || 1,
        totalWins:   d.totalWins   || 0,
        winRate:     d.winRate     || 0,
      });
    });

    return leaderboard
      .sort((a, b) => b.highScore - a.highScore)
      .slice(0, limit);

  } catch (error) {
    console.error('Error getting leaderboard:', error);
    return [];
  }
}

export async function getBallCrushWinnings(uid: string): Promise<number> {
  try {
    const snap = await get(ref(db, `users/${uid}/winnings/total`));
    if (snap.exists()) return snap.val();

    const alt = await get(ref(db, `winnings/${uid}/total`));
    return alt.exists() ? alt.val() : 0;
  } catch (error) {
    console.error('Error getting winnings:', error);
    return 0;
  }
}

export async function getBallCrushWinCount(uid: string): Promise<number> {
  try {
    const snap = await get(ref(db, `users/${uid}/winnings/count`));
    return snap.exists() ? snap.val() : 0;
  } catch (error) {
    console.error('Error getting win count:', error);
    return 0;
  }
}

// =========== SAVE GAME SCORE ===========

export async function saveBallCrushScore(
  username: string,
  score: number,
  won: boolean
): Promise<boolean> {
  try {
    console.log(`💾 Saving Ball Crush score for ${username}: ${score}`);

    const lookupSnap = await get(ref(db, `lookups/byUsername/${username.toLowerCase()}`));
    if (!lookupSnap.exists()) {
      console.error('❌ User not found in lookup');
      return false;
    }

    const uid       = lookupSnap.val();
    const timestamp = Date.now();

    await set(push(ref(db, `users/${uid}/scores`)), {
      score,
      won,
      timestamp,
      date: new Date(timestamp).toISOString(),
      game: 'ball-crush',
    });

    console.log('✅ Ball Crush score saved');
    return true;

  } catch (error) {
    console.error('❌ Error saving Ball Crush score:', error);
    return false;
  }
}

// =========== UPDATE BALL CRUSH STATS ===========

export async function updateBallCrushStats(
  username: string,
  score: number,
  won: boolean
): Promise<void> {
  try {
    console.log(`📊 Updating Ball Crush stats for ${username}: score=${score}, won=${won}`);

    const lookupSnap = await get(ref(db, `lookups/byUsername/${username.toLowerCase()}`));
    if (!lookupSnap.exists()) {
      console.error('❌ User not found');
      return;
    }

    const uid      = lookupSnap.val();
    const statsRef = ref(db, `users/${uid}/games/ball-crush`);
    const statsSnap = await get(statsRef);

    const currentStats = statsSnap.exists() ? statsSnap.val() : {
      highScore: 0, totalGames: 0, totalWins: 0, totalLosses: 0,
      winStreak: 0, bestWinStreak: 0, experience: 0, level: 1,
      rank: 'Rookie', achievements: [], averageScore: 0, totalScore: 0,
      gamesWon: 0, gamesLost: 0,
    };

    const newTotalGames    = (currentStats.totalGames  || 0) + 1;
    const newTotalScore    = (currentStats.totalScore  || 0) + score;
    const newAverageScore  = Math.floor(newTotalScore / newTotalGames);
    const newHighScore     = Math.max(currentStats.highScore || 0, score);
    const newWinStreak     = won ? (currentStats.winStreak || 0) + 1 : 0;
    const newBestWinStreak = Math.max(currentStats.bestWinStreak || 0, newWinStreak);
    const newExperience    = (currentStats.experience || 0) + (won ? 100 : 10);
    const newLevel         = Math.floor(1 + newExperience / 100);

    let newRank = 'Rookie';
    if      (newLevel >= 50) newRank = 'Diamond';
    else if (newLevel >= 40) newRank = 'Platinum';
    else if (newLevel >= 30) newRank = 'Gold';
    else if (newLevel >= 20) newRank = 'Silver';
    else if (newLevel >= 10) newRank = 'Bronze';

    const updates: any = {
      highScore: newHighScore, totalGames: newTotalGames,
      totalScore: newTotalScore, averageScore: newAverageScore,
      winStreak: newWinStreak, bestWinStreak: newBestWinStreak,
      experience: newExperience, level: newLevel, rank: newRank,
      lastPlayed: new Date().toISOString(),
    };

    if (won) {
      updates.totalWins = (currentStats.totalWins || 0) + 1;
      updates.gamesWon  = (currentStats.gamesWon  || 0) + 1;
    } else {
      updates.totalLosses = (currentStats.totalLosses || 0) + 1;
      updates.gamesLost   = (currentStats.gamesLost   || 0) + 1;
    }

    await set(ref(db, `users/${uid}/games/ball-crush`), updates);

    const playTimeSnap = await get(ref(db, `users/${uid}/metadata/totalPlayTime`));
    await update(ref(db, `users/${uid}/metadata`), {
      lastGamePlayed: 'ball-crush',
      totalPlayTime:  (playTimeSnap.val() || 0) + 1,
      updatedAt:      new Date().toISOString(),
    });

    console.log('✅ Ball Crush stats updated successfully');

  } catch (error) {
    console.error('❌ Error updating Ball Crush stats:', error);
  }
}

// =========== GET PLAYER RANK ===========

export async function getBallCrushPlayerRank(username: string): Promise<number> {
  try {
    const leaderboard = await getBallCrushLeaderboard(100);
    const index = leaderboard.findIndex((e) => e.username === username);
    return index === -1 ? 999 : index + 1;
  } catch (error) {
    console.error('❌ Error getting Ball Crush player rank:', error);
    return 999;
  }
}

// =========== GET USER SCORES ===========

export async function getBallCrushUserScores(
  username: string,
  limit: number = 10
): Promise<BallCrushScoreEntry[]> {
  try {
    console.log(`📊 Fetching Ball Crush scores for: ${username}`);

    const lookupSnap = await get(ref(db, `lookups/byUsername/${username.toLowerCase()}`));
    if (!lookupSnap.exists()) {
      console.log('❌ User not found in lookup');
      return [];
    }

    const uid        = lookupSnap.val();
    const scoresSnap = await get(ref(db, `users/${uid}/scores`));

    if (!scoresSnap.exists()) {
      console.log('📝 No Ball Crush scores found');
      return [];
    }

    const scores: BallCrushScoreEntry[] = Object.entries(scoresSnap.val())
      .map(([id, data]: [string, any]) => ({
        id,
        date:      new Date(data.timestamp).toLocaleDateString(),
        score:     data.score,
        won:       data.won,
        timestamp: data.timestamp,
        game:      data.game,
      }))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);

    console.log(`✅ Found ${scores.length} scores for ${username}`);
    return scores;

  } catch (error) {
    console.error('❌ Error fetching Ball Crush scores:', error);
    return [];
  }
}