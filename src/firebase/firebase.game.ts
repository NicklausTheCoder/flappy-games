import { ref, get, set, update, push, onValue, off } from 'firebase/database';
import { db } from '../firebase/init';

// Types
export interface PlayerProfile {
    uid: string;
    username: string;
    displayName: string;
    highScore: number;
    totalGames: number;
    totalWins: number;
    avatar?: string;
    lastLogin: string;
}

export interface GameSession {
    sessionId: string;
    playerId: string;
    username: string;
    score: number;
    startTime: string;
    endTime?: string;
    status: 'active' | 'completed' | 'abandoned';
}

export interface LeaderboardEntry {
    playerId: string;
    username: string;
    displayName: string;
    highScore: number;
    totalGames: number;
    rank?: number;
}

class FirebaseGameService {
    private playerRef: any;
    private sessionRef: any;
    private leaderboardRef: any;

    // ========== PLAYER DATA ==========
    async getPlayerProfile(userId: string): Promise<PlayerProfile | null> {
        try {
            const snapshot = await get(ref(db, `user_profiles/${userId}`));
            if (snapshot.exists()) {
                return snapshot.val() as PlayerProfile;
            }
            return null;
        } catch (error) {
            console.error('Error getting player profile:', error);
            return null;
        }
    }

    async updatePlayerHighScore(userId: string, username: string, score: number): Promise<boolean> {
        try {
            // Get current high score
            const profileRef = ref(db, `user_profiles/${userId}`);
            const snapshot = await get(profileRef);

            if (snapshot.exists()) {
                const currentData = snapshot.val();
                const currentHighScore = currentData.highScore || 0;

                // Only update if new score is higher
                if (score > currentHighScore) {
                    await update(profileRef, {
                        highScore: score,
                        lastUpdated: new Date().toISOString()
                    });

                    // Also update leaderboard
                    await this.updateLeaderboard(userId, username, score);

                    console.log(`🏆 New high score for ${username}: ${score}`);
                    return true;
                }
            } else {
                // Create profile if it doesn't exist
                await set(profileRef, {
                    uid: userId,
                    username: username,
                    displayName: username,
                    highScore: score,
                    totalGames: 0,
                    totalWins: 0,
                    lastLogin: new Date().toISOString()
                });

                // Add to leaderboard
                await this.updateLeaderboard(userId, username, score);
            }

            return false;
        } catch (error) {
            console.error('Error updating high score:', error);
            return false;
        }
    }

    async incrementGameCount(userId: string, won: boolean = false): Promise<void> {
        try {
            const profileRef = ref(db, `user_profiles/${userId}`);
            const snapshot = await get(profileRef);

            if (snapshot.exists()) {
                const current = snapshot.val();
                await update(profileRef, {
                    totalGames: (current.totalGames || 0) + 1,
                    totalWins: (current.totalWins || 0) + (won ? 1 : 0),
                    lastPlayed: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error('Error incrementing game count:', error);
        }
    }

    // ========== GAME SESSIONS ==========
    async startGameSession(userId: string, username: string): Promise<string> {
        try {
            const sessionId = `session_${Date.now()}_${userId}`;
            const sessionData: GameSession = {
                sessionId,
                playerId: userId,
                username,
                score: 0,
                startTime: new Date().toISOString(),
                status: 'active'
            };

            await set(ref(db, `game_sessions/${userId}/${sessionId}`), sessionData);
            console.log('🎮 Game session started:', sessionId);
            return sessionId;
        } catch (error) {
            console.error('Error starting game session:', error);
            return '';
        }
    }

    async updateGameSession(userId: string, sessionId: string, score: number): Promise<void> {
        try {
            await update(ref(db, `game_sessions/${userId}/${sessionId}`), {
                score: score,
                lastUpdated: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error updating game session:', error);
        }
    }

    async endGameSession(userId: string, sessionId: string, finalScore: number): Promise<void> {
        try {
            await update(ref(db, `game_sessions/${userId}/${sessionId}`), {
                score: finalScore,
                endTime: new Date().toISOString(),
                status: 'completed'
            });
            console.log('🏁 Game session ended. Final score:', finalScore);
        } catch (error) {
            console.error('Error ending game session:', error);
        }
    }

    // ========== LEADERBOARD ==========
    async updateLeaderboard(userId: string, username: string, score: number): Promise<void> {
        try {
            const leaderboardRef = ref(db, `leaderboard/${userId}`);
            const snapshot = await get(leaderboardRef);

            if (snapshot.exists()) {
                const current = snapshot.val();
                if (score > (current.highScore || 0)) {
                    await set(leaderboardRef, {
                        playerId: userId,
                        username: username,
                        displayName: username,
                        highScore: score,
                        totalGames: (current.totalGames || 0) + 1,
                        updatedAt: new Date().toISOString()
                    });
                }
            } else {
                await set(leaderboardRef, {
                    playerId: userId,
                    username: username,
                    displayName: username,
                    highScore: score,
                    totalGames: 1,
                    createdAt: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error('Error updating leaderboard:', error);
        }
    }
    // Add to FirebaseGameService class
    async testConnection(): Promise<boolean> {
        try {
            console.log('🔥 Testing Firebase connection...');

            // Check if we have a database reference
            if (!db) {
                console.error('❌ Database not initialized');
                return false;
            }

            // Try to write a simple test value
            const testRef = ref(db, '.info/connected');

            return new Promise((resolve) => {
                // Listen for connection state
                const unsubscribe = onValue(testRef, (snapshot) => {
                    const connected = snapshot.val() === true;
                    console.log('🔥 Firebase connection state:', connected ? 'CONNECTED' : 'DISCONNECTED');

                    if (connected) {
                        // Also try a simple write test
                        const connectionTestRef = ref(db, 'connection_test');
                        set(connectionTestRef, {
                            timestamp: Date.now(),
                            status: 'test'
                        }).then(() => {
                            console.log('✅ Firebase write test successful');
                            unsubscribe();
                            resolve(true);
                        }).catch((error) => {
                            console.error('❌ Firebase write test failed:', error);
                            unsubscribe();
                            resolve(false);
                        });
                    } else {
                        unsubscribe();
                        resolve(false);
                    }
                });

                // Timeout after 5 seconds
                setTimeout(() => {
                    unsubscribe();
                    console.log('⏱️ Firebase connection timeout');
                    resolve(false);
                }, 5000);
            });
        } catch (error) {
            console.error('❌ Firebase connection test error:', error);
            return false;
        }
    }

    // Add to FirebaseGameService class
async getUserBalance(username: string): Promise<number> {
  try {
    // Try to get from Firebase
    const snapshot = await get(ref(db, `wallets/${username}/balance`));
    
    if (snapshot.exists()) {
      return snapshot.val();
    } else {
      // Create default wallet for new user
      const defaultBalance = 100.00;
      await set(ref(db, `wallets/${username}`), {
        balance: defaultBalance,
        currency: 'USD',
        lastUpdated: new Date().toISOString()
      });
      return defaultBalance;
    }
  } catch (error) {
    console.error('Error getting balance:', error);
    return 100.00; // Default fallback
  }
}
    async getLeaderboard(limit: number = 10): Promise<LeaderboardEntry[]> {
        try {
            const snapshot = await get(ref(db, 'leaderboard'));
            if (snapshot.exists()) {
                const data = snapshot.val();
                const entries: LeaderboardEntry[] = Object.values(data);

                // Sort by high score descending and add rank
                return entries
                    .sort((a, b) => b.highScore - a.highScore)
                    .slice(0, limit)
                    .map((entry, index) => ({
                        ...entry,
                        rank: index + 1
                    }));
            }
            return [];
        } catch (error) {
            console.error('Error getting leaderboard:', error);
            return [];
        }
    }

    // ========== REAL-TIME LISTENERS ==========
    subscribeToLeaderboard(callback: (entries: LeaderboardEntry[]) => void): () => void {
        const leaderboardRef = ref(db, 'leaderboard');

        const unsubscribe = onValue(leaderboardRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const entries: LeaderboardEntry[] = Object.values(data);
                const sorted = entries
                    .sort((a, b) => b.highScore - a.highScore)
                    .map((entry, index) => ({
                        ...entry,
                        rank: index + 1
                    }));
                callback(sorted);
            } else {
                callback([]);
            }
        });

        return unsubscribe;
    }

    subscribeToPlayerScore(userId: string, callback: (score: number) => void): () => void {
        const playerRef = ref(db, `user_profiles/${userId}/highScore`);

        const unsubscribe = onValue(playerRef, (snapshot) => {
            if (snapshot.exists()) {
                callback(snapshot.val());
            }
        });

        return unsubscribe;
    }

    // ========== ACHIEVEMENTS ==========
    async checkAchievements(userId: string, score: number): Promise<string[]> {
        const unlocked: string[] = [];

        try {
            const profileRef = ref(db, `user_profiles/${userId}`);
            const snapshot = await get(profileRef);

            if (snapshot.exists()) {
                const profile = snapshot.val();
                const totalGames = profile.totalGames || 0;
                const highScore = profile.highScore || 0;

                // Check achievements
                if (score >= 10 && !profile.achievement_first10) {
                    unlocked.push('First 10 points!');
                    await update(profileRef, { achievement_first10: true });
                }

                if (score >= 50 && !profile.achievement_score50) {
                    unlocked.push('Score 50!');
                    await update(profileRef, { achievement_score50: true });
                }

                if (score >= 100 && !profile.achievement_score100) {
                    unlocked.push('Century!');
                    await update(profileRef, { achievement_score100: true });
                }

                if (totalGames >= 10 && !profile.achievement_veteran) {
                    unlocked.push('Veteran - Played 10 games');
                    await update(profileRef, { achievement_veteran: true });
                }

                if (score > (profile.previousBest || 0) && !profile.achievement_improved) {
                    unlocked.push('Personal Best!');
                    await update(profileRef, { achievement_improved: true });
                }
            }
        } catch (error) {
            console.error('Error checking achievements:', error);
        }

        return unlocked;
    }
}

// Export singleton instance
export const firebaseGame = new FirebaseGameService();