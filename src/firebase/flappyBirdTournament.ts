// src/firebase/flappyBirdTournament.ts
import { ref, get, set, push, update, query, orderByChild, limitToLast } from 'firebase/database';
import { db } from './init';

export interface TournamentPeriod {
    id: string;  // Format: YYYY-MM-DD-HH (e.g., 2026-03-18-00, 2026-03-18-04, etc.)
    startTime: number;  // Timestamp
    endTime: number;    // Timestamp
    players: {
        [uid: string]: {
            username: string;
            displayName: string;
            highestScore: number;
            gamesPlayed: number;
            lastPlayed: number;
        }
    };
    totalPool: number;  // Total $ collected from entry fees
    winner?: {
        uid: string;
        username: string;
        displayName: string;
        score: number;
        prize: number;
    };
    status: 'active' | 'completed' | 'paid';
}

export interface TournamentEntry {
    uid: string;
    username: string;
    displayName: string;
    score: number;
    timestamp: number;
}

// Helper to get current tournament period ID
export function getCurrentTournamentPeriod(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = Math.floor(now.getHours() / 4) * 4; // 0, 4, 8, 12, 16, 20
    const periodHour = String(hour).padStart(2, '0');

    return `${year}-${month}-${day}-${periodHour}`;
}

// Get tournament period boundaries
export function getTournamentPeriodBounds(periodId: string): { start: number; end: number } {
    const [year, month, day, hour] = periodId.split('-').map(Number);

    const start = new Date(year, month - 1, day, hour, 0, 0, 0).getTime();
    const end = new Date(year, month - 1, day, hour + 4, 0, 0, 0).getTime();

    return { start, end };
}

// Initialize or get current tournament period
export async function getOrCreateTournamentPeriod(): Promise<TournamentPeriod> {
    try {
        const periodId = getCurrentTournamentPeriod();
        const periodRef = ref(db, `tournaments/flappy-bird/${periodId}`);
        const snapshot = await get(periodRef);

        const { start, end } = getTournamentPeriodBounds(periodId);

        if (snapshot.exists()) {
            return snapshot.val() as TournamentPeriod;
        }

        // Create new tournament period
        const newPeriod: TournamentPeriod = {
            id: periodId,
            startTime: start,
            endTime: end,
            players: {},
            totalPool: 0,
            status: 'active'
        };

        await set(periodRef, newPeriod);
        console.log(`🎮 New tournament period created: ${periodId}`);

        return newPeriod;

    } catch (error) {
        console.error('❌ Error creating tournament period:', error);
        throw error;
    }
}

// Record a game in the tournament
export async function recordTournamentGame(
    uid: string,
    username: string,
    displayName: string,
    score: number
): Promise<void> {
    try {
        const periodId = getCurrentTournamentPeriod();
        const periodRef = ref(db, `tournaments/flappy-bird/${periodId}`);
        const snapshot = await get(periodRef);

        let period: TournamentPeriod;

        if (snapshot.exists()) {
            period = snapshot.val() as TournamentPeriod;
        } else {
            period = await getOrCreateTournamentPeriod();
        }

        // Update player stats
        const existingPlayer = period.players[uid];

        period.players[uid] = {
            username: username,
            displayName: displayName,
            highestScore: Math.max(score, existingPlayer?.highestScore || 0),
            gamesPlayed: (existingPlayer?.gamesPlayed || 0) + 1,
            lastPlayed: Date.now()
        };

        // Add $1 to pool (game fee)
        period.totalPool = (period.totalPool || 0) + 1;

        // Update in database
        await update(periodRef, {
            players: period.players,
            totalPool: period.totalPool
        });

        console.log(`📊 Tournament updated for ${username}: +$1 to pool, total pool: $${period.totalPool}`);

        // Check if period just ended
        if (Date.now() >= period.endTime && period.status === 'active') {
            await completeTournamentPeriod(periodId);
        }

    } catch (error) {
        console.error('❌ Error recording tournament game:', error);
    }
}

// Complete a tournament period and determine winner
export async function completeTournamentPeriod(periodId: string): Promise<void> {
    try {
        const periodRef = ref(db, `tournaments/flappy-bird/${periodId}`);
        const snapshot = await get(periodRef);

        if (!snapshot.exists()) {
            console.log('Tournament period not found:', periodId);
            return;
        }

        const period = snapshot.val() as TournamentPeriod;

        if (period.status !== 'active') {
            return; // Already completed
        }

        // Find winner (player with highest score)
        let winnerUid: string | null = null;
        let winnerUsername: string = '';
        let winnerDisplayName: string = '';
        let highestScore = 0;

        Object.entries(period.players).forEach(([uid, player]) => {
            if (player.highestScore > highestScore) {
                highestScore = player.highestScore;
                winnerUid = uid;
                winnerUsername = player.username;
                winnerDisplayName = player.displayName;
            }
        });

        if (!winnerUid) {
            // No players this period
            period.status = 'completed';
            await update(periodRef, { status: 'completed' });
            console.log('🏁 Tournament period ended with no players');
            return;
        }

        // Calculate prize (40% of pool)
        const prize = (Math.round(period.totalPool * 0.4 * 100) / 100) + 1; // Round to 2 decimals

        period.winner = {
            uid: winnerUid,
            username: winnerUsername,
            displayName: winnerDisplayName,
            score: highestScore,
            prize: prize
        };

        period.status = 'completed';

        await update(periodRef, {
            winner: period.winner,
            status: 'completed'
        });

        console.log(`🏆 Tournament ${periodId} completed! Winner: ${winnerDisplayName} wins $${prize}`);

        // Award prize to winner
        await awardTournamentPrize(winnerUid, prize, periodId);

    } catch (error) {
        console.error('❌ Error completing tournament period:', error);
    }
}

async function awardTournamentPrize(uid: string, amount: number, periodId: string): Promise<void> {
    try {

        const winningsBalanceRef = ref(db, `winningsBalance/${uid}`);
        const snapshot = await get(winningsBalanceRef);
        const currentWinnings = snapshot.exists() ? snapshot.val().balance || 0 : 0;


        const newBalance = currentWinnings + amount;

        await update(winningsBalanceRef, {
            balance: newBalance,
            lastUpdated: new Date().toISOString()
        });
     
      
        // ✅ Uniform winnings path
        await set(ref(db, `winnings/${uid}/${periodId}`), {
            amount: amount,
            game: 'flappy-bird',
            periodId: periodId,
            awardedAt: new Date().toISOString()
        });

        console.log(`💰 Awarded $${amount} to ${uid} for flappy bird tournament win`);

    } catch (error) {
        console.error('❌ Error awarding tournament prize:', error);
    }
}

// Get current tournament status
export async function getCurrentTournamentStatus(): Promise<{
    periodId: string;
    timeRemaining: number;
    totalPool: number;
    players: number;
    topPlayers: Array<{ username: string; displayName: string; score: number }>;
}> {
    try {
        const periodId = getCurrentTournamentPeriod();
        const periodRef = ref(db, `tournaments/flappy-bird/${periodId}`);
        const snapshot = await get(periodRef);

        const { end } = getTournamentPeriodBounds(periodId);
        const timeRemaining = Math.max(0, end - Date.now());

        if (!snapshot.exists()) {
            return {
                periodId,
                timeRemaining,
                totalPool: 0,
                players: 0,
                topPlayers: []
            };
        }

        const period = snapshot.val() as TournamentPeriod;

        // Get top 3 players
        const topPlayers = Object.entries(period.players || {})
            .map(([uid, player]) => ({
                username: player.username,
                displayName: player.displayName,
                score: player.highestScore
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);

        return {
            periodId,
            timeRemaining,
            totalPool: period.totalPool || 0,
            players: Object.keys(period.players || {}).length,
            topPlayers
        };

    } catch (error) {
        console.error('❌ Error getting tournament status:', error);
        return {
            periodId: getCurrentTournamentPeriod(),
            timeRemaining: 0,
            totalPool: 0,
            players: 0,
            topPlayers: []
        };
    }
}
// Add this to flappyBirdTournament.ts
export async function checkAndCompleteExpiredPeriods(): Promise<void> {
    try {
        const tournamentsRef = ref(db, 'tournaments/flappy-bird');
        const snapshot = await get(tournamentsRef);

        if (!snapshot.exists()) return;

        const now = Date.now();
        const completionPromises: Promise<void>[] = [];

        snapshot.forEach((child) => {
            const period = child.val() as TournamentPeriod;

            // If period is active and end time has passed, complete it
            if (period.status === 'active' && now >= period.endTime) {
                console.log(`⏰ Period ${period.id} has expired, completing...`);
                completionPromises.push(completeTournamentPeriod(period.id));
            }
        });

        // Wait for all completions to finish
        await Promise.all(completionPromises);

    } catch (error) {
        console.error('Error checking expired periods:', error);
    }
}
// Get tournament history
// In flappyBirdTournament.ts - replace getTournamentHistory
export async function getTournamentHistory(limit: number = 10): Promise<TournamentPeriod[]> {
    try {
        const tournamentsRef = ref(db, 'tournaments/flappy-bird');
        const snapshot = await get(tournamentsRef); // Remove the query temporarily

        if (!snapshot.exists()) {
            return [];
        }

        const tournaments: TournamentPeriod[] = [];

        snapshot.forEach((child) => {
            tournaments.push(child.val() as TournamentPeriod);
        });

        // Sort manually by endTime (most recent first)
        const sorted = tournaments.sort((a, b) => b.endTime - a.endTime);

        return sorted.slice(0, limit);

    } catch (error) {
        console.error('❌ Error getting tournament history:', error);
        return [];
    }
}