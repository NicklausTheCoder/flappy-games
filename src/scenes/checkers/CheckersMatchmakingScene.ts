// src/scenes/checkers/CheckersMatchmakingScene.ts
import Phaser from 'phaser';
import { checkersMultiplayer } from '../../firebase/checkersMultiplayer';
import { ref, get, onValue, remove, update } from 'firebase/database';
import { db } from '../../firebase/init';
import { updateCheckersWalletBalance } from '../../firebase/checkersService';

export class CheckersMatchmakingScene extends Phaser.Scene {
    private username: string = '';
    private uid: string = '';
    private displayName: string = '';
    private avatar: string = '';

    private searchTime: number = 0;
    private searchTimer!: Phaser.Time.TimerEvent;
    private matchCheckInterval: number = 0;
    private cancelled: boolean = false;
    private matchFound: boolean = false;
    private maxSearchTime: number = 60000; // 60 seconds max
    private searchStartTime: number = 0;

    // UI Elements
    private matchListener: (() => void) | null = null;
    private searchText!: Phaser.GameObjects.Text;
    private statusText!: Phaser.GameObjects.Text;
    private cancelBtn!: Phaser.GameObjects.Text;
    private piece1!: Phaser.GameObjects.Text;
    private piece2!: Phaser.GameObjects.Text;
    private queueCountText!: Phaser.GameObjects.Text;

    constructor() {
        super({ key: 'CheckersMatchmakingScene' });
    }

    init(data: { username: string; uid: string; displayName?: string; avatar?: string; userData?: any }) {
        console.log('♟️ CheckersMatchmakingScene init STARTED with data:', data);

        // Handle both possible data structures (like Ball Crush)
        if (data.userData) {
            this.username = data.username || data.userData.username || '';
            this.uid = data.uid || data.userData.uid || '';
            this.displayName = this.username;
            this.avatar = data.userData.avatar || 'default';
        } else {
            this.username = data.username || '';
            this.uid = data.uid || '';
            this.displayName = this.username;
            this.avatar = data.avatar || 'default';
        }

        console.log('✅ CheckersMatchmakingScene init SUCCESS:', {
            username: this.username,
            uid: this.uid,
            displayName: this.displayName
        });
    }

    async create() {
        this.searchStartTime = Date.now();
        this.cameras.main.setBackgroundColor('#1a1a2e');
        this.addBackgroundPieces();

        // Refresh button
        const refreshBtn = this.add.text(180, 550, '↻ REFRESH', {
            fontSize: '16px',
            color: '#ffffff',
            backgroundColor: '#2196F3',
            padding: { x: 15, y: 8 }
        })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });

        refreshBtn.on('pointerdown', async () => {
            if (!this.matchFound && !this.cancelled) {
                this.statusText.setText('Refreshing...');
                await this.checkForMatch();
            }
        });

        // Title
        this.add.text(180, 100, '♟️ FINDING OPPONENT', {
            fontSize: '24px',
            color: '#ffd700',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);

        // Player info
        this.add.text(180, 140, `Player: ${this.displayName}`, {
            fontSize: '14px',
            color: '#ffffff'
        }).setOrigin(0.5);

        // Queue count
        this.queueCountText = this.add.text(180, 170, 'Players in queue: ...', {
            fontSize: '12px',
            color: '#888888'
        }).setOrigin(0.5);

        // Create animated pieces
        this.createAnimatedPieces();

        // Search text
        this.searchText = this.add.text(180, 380, 'Searching', {
            fontSize: '20px',
            color: '#ffffff'
        }).setOrigin(0.5);

        // Status text
        this.statusText = this.add.text(180, 420, 'Looking for players...', {
            fontSize: '14px',
            color: '#aaaaaa'
        }).setOrigin(0.5);

        // Cancel button
        this.cancelBtn = this.add.text(180, 500, '❌ CANCEL', {
            fontSize: '20px',
            color: '#ffffff',
            backgroundColor: '#f44336',
            padding: { x: 20, y: 10 }
        })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });

        this.cancelBtn.on('pointerdown', () => {
            this.cancelSearch();
        });

        // Animate dots on search text
        let dots = 0;
        this.searchTimer = this.time.addEvent({
            delay: 500,
            callback: () => {
                if (!this.matchFound && !this.cancelled) {
                    dots = (dots + 1) % 4;
                    this.searchText.setText('Searching' + '.'.repeat(dots));
                    this.searchTime += 0.5;

                    this.tweens.add({
                        targets: this.searchText,
                        scale: 1.05,
                        duration: 200,
                        yoyo: true,
                        ease: 'Sine.easeInOut'
                    });
                }
            },
            loop: true
        });

        // Join matchmaking queue
        await this.joinQueue();

        // Keep-alive
        // In CheckersMatchmakingScene.ts, increase the keep-alive frequency:

        this.time.addEvent({
            delay: 5000, // Every 5 seconds instead of 15
            callback: () => {
                if (!this.cancelled && !this.matchFound) {
                    checkersMultiplayer.setPlayerOnline(this.uid, true);
                    checkersMultiplayer.setPlayerQueueStatus(this.uid, true);
                    // Also update lastSeen
                    update(ref(db, `online/${this.uid}`), {
                        lastSeen: Date.now()
                    });
                }
            },
            loop: true
        });

        // Listen for direct match notification (KEY FIX - like Ball Crush)
        const matchRef = ref(db, `matches/${this.uid}`);
        this.matchListener = onValue(matchRef, (snapshot) => {
            if (snapshot.exists()) {
                const match = snapshot.val();
                console.log('🎯 DIRECT MATCH NOTIFICATION RECEIVED!', match);

                // Remove the notification so we don't get it again
                remove(ref(db, `matches/${this.uid}`));

                // Stop checking
                if (this.matchCheckInterval) {
                    clearInterval(this.matchCheckInterval);
                    this.matchCheckInterval = 0;
                }

                // Stop search timer
                if (this.searchTimer) {
                    this.searchTimer.destroy();
                }

                // Go to lobby immediately
                this.goToLobby(match.lobbyId);
            }
        });

        this.time.delayedCall(1000, async () => {
            if (!this.matchFound && !this.cancelled) {
                await this.checkForMatch();
            }
        });

        // Start checking for match
        this.startMatchChecking();
    }

    private createAnimatedPieces() {
        // Create red piece
        this.piece1 = this.add.text(140, 260, '🔴', {
            fontSize: '48px'
        });

        // Create black piece
        this.piece2 = this.add.text(200, 300, '⚫', {
            fontSize: '48px'
        });

        // Animate pieces circling each other
        this.tweens.add({
            targets: this.piece1,
            x: 200,
            y: 260,
            duration: 1500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        this.tweens.add({
            targets: this.piece2,
            x: 140,
            y: 300,
            duration: 1500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // Rotation animation
        this.tweens.add({
            targets: [this.piece1, this.piece2],
            angle: 360,
            duration: 3000,
            repeat: -1,
            ease: 'Linear'
        });
    }

    // In CheckersMatchmakingScene.ts, update the joinQueue method:
    private async cancelSearch() {
        if (this.cancelled || this.matchFound) return;

        this.cancelled = true;
        console.log('🚪 Cancelling match search...');

        this.statusText.setText('Cancelling...');

        // Stop all timers
        if (this.searchTimer) {
            this.searchTimer.destroy();
        }

        if (this.matchCheckInterval) {
            clearInterval(this.matchCheckInterval);
            this.matchCheckInterval = 0;
        }

        if (this.matchListener) {
            this.matchListener();
            this.matchListener = null;
        }

        // REFUND: Add back the $1 game fee
        await this.refundGameFee();

        // Leave queue
        await checkersMultiplayer.leaveQueue(this.uid);

        // Show refund message
        this.showRefundMessage();

        // Fade out and go back to start scene
        this.cameras.main.fadeOut(1000, 0, 0, 0);

        this.time.delayedCall(1000, () => {
            this.scene.start('CheckersStartScene', {
                username: this.username,
                uid: this.uid
            });
        });
    }

    private async refundGameFee(): Promise<boolean> {
        try {
            console.log('💰 Refunding $1 game fee for UID:', this.uid);

            const success = await updateCheckersWalletBalance(
                this.uid,
                1.00,
                'bonus',
                'Matchmaking cancelled - fee refund'
            );

            if (success) {
                console.log('✅ Game fee refunded successfully');
                return true;
            } else {
                console.log('❌ Failed to refund game fee');
                return false;
            }

        } catch (error) {
            console.error('❌ Error refunding game fee:', error);
            return false;
        }
    }

    private showRefundMessage() {
        // Create refund popup
        const refundText = this.add.text(180, 450, '+$1 REFUNDED', {
            fontSize: '18px',
            color: '#00ff00',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 2
        }).setOrigin(0.5);

        // Animate
        this.tweens.add({
            targets: refundText,
            y: 400,
            alpha: 0,
            duration: 1500,
            ease: 'Power2',
            onComplete: () => refundText.destroy()
        });
    }


    private async joinQueue() {
        try {
            console.log('🔍 Joining Checkers matchmaking queue...');
            this.statusText.setText('Joining queue...');

            // Clear any existing match notifications before joining
            const matchRef = ref(db, `matches/${this.uid}`);
            await remove(matchRef);

            await checkersMultiplayer.joinQueue(
                this.uid,
                this.username,
                this.displayName,
                this.avatar
            );

            console.log('✅ Joined Checkers matchmaking queue');
            this.statusText.setText('In queue - waiting for opponent...');

            const count = await this.getQueueCount();
            this.queueCountText.setText(`Players in queue: ${count}`);

        } catch (error) {
            console.error('❌ Failed to join queue:', error);
            this.statusText.setText('Failed to join queue. Retrying...');

            this.time.delayedCall(2000, () => {
                this.joinQueue();
            });
        }
    }

    private async getQueueCount(): Promise<number> {
        try {
            const queueRef = ref(db, 'matchmaking/checkers');
            const snapshot = await get(queueRef);
            return snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
        } catch (error) {
            return 0;
        }
    }

    private startMatchChecking() {
        console.log('🔍 Starting match check interval...');

        this.matchCheckInterval = window.setInterval(async () => {
            await this.checkForMatch();
        }, 2000);
    }

    private async checkForMatch() {
        if (this.matchFound || this.cancelled) return;

        if (Date.now() - this.searchStartTime > this.maxSearchTime) {
            this.statusText.setText('⚠️ Search timed out');

            // REFUND on timeout
            await this.refundGameFee();

            // Show timeout message
            const timeoutText = this.add.text(180, 400, 'No players found', {
                fontSize: '16px',
                color: '#ffaa00'
            }).setOrigin(0.5);

            this.time.delayedCall(2000, () => {
                timeoutText.destroy();
                this.scene.start('CheckersStartScene', {
                    username: this.username,
                    uid: this.uid
                });
            });

            return;
        }

        try {
            // Get all lobbies
            const lobbiesRef = ref(db, 'lobbies');
            const snapshot = await get(lobbiesRef);

            if (!snapshot.exists()) return;

            const lobbies = snapshot.val();
            let foundLobby = false;
            const now = Date.now();

            // Find a lobby where this player is a member
            for (const [lobbyId, lobbyData] of Object.entries(lobbies)) {
                const lobby = lobbyData as any;

                // Skip old lobbies (older than 5 minutes)
                if (now - lobby.createdAt > 300000) {
                    continue;
                }

                // Check if it's a checkers lobby and contains this player
                if (lobby.gameId === 'checkers' &&
                    lobby.playerIds &&
                    lobby.playerIds.includes(this.uid)) {

                    console.log('🎯 Match found! Lobby:', lobbyId);
                    this.matchFound = true;
                    foundLobby = true;

                    // Update UI
                    this.statusText.setText('Match found!');
                    this.searchText.setText('Opponent located!');

                    // Add a flash effect
                    this.cameras.main.flash(500, 255, 255, 255);

                    // Stop checking
                    if (this.matchCheckInterval) {
                        clearInterval(this.matchCheckInterval);
                        this.matchCheckInterval = 0;
                    }

                    // Stop search timer
                    if (this.searchTimer) {
                        this.searchTimer.destroy();
                    }

                    // Cancel button becomes "CONTINUE"
                    this.cancelBtn.setText('✅ CONTINUE');
                    this.cancelBtn.setStyle({ backgroundColor: '#4CAF50' });
                    this.cancelBtn.off('pointerdown');
                    this.cancelBtn.on('pointerdown', () => {
                        this.goToLobby(lobbyId);
                    });

                    // Also auto-continue after 2 seconds
                    this.time.delayedCall(2000, () => {
                        if (!this.cancelled && this.matchFound) {
                            this.goToLobby(lobbyId);
                        }
                    });

                    break;
                }
            }

            // Update queue count
            const count = await this.getQueueCount();
            this.queueCountText.setText(`Players in queue: ${count}`);

        } catch (error) {
            console.error('Error checking for match:', error);
        }
    }

    private isTransitioning: boolean = false;

    private goToLobby(lobbyId: string) {
        if (this.isTransitioning) return;
        this.isTransitioning = true;

        console.log('🚀 Moving to Checkers lobby:', lobbyId);

        this.cameras.main.fadeOut(500, 0, 0, 0);

        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('CheckersLobbyScene', {
                username: this.username,
                uid: this.uid,
                lobbyId: lobbyId
            });
        });
    }


    private addBackgroundPieces() {
        const pieces = ['♟️', '♞', '♝', '♜', '♛', '♚'];

        for (let i = 0; i < 12; i++) {
            const x = Phaser.Math.Between(20, 340);
            const y = Phaser.Math.Between(20, 620);
            const piece = pieces[Math.floor(Math.random() * pieces.length)];
            const alpha = Phaser.Math.FloatBetween(0.03, 0.1);

            const text = this.add.text(x, y, piece, {
                fontSize: `${Phaser.Math.Between(16, 32)}px`,
                color: '#888888',
                alpha: alpha
            });

            this.tweens.add({
                targets: text,
                y: y + 30,
                x: x + (i % 2 === 0 ? 20 : -20),
                duration: 4000 + i * 300,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }
    }

    shutdown() {
        console.log('🛑 Shutting down CheckersMatchmakingScene');

        if (this.matchCheckInterval) {
            clearInterval(this.matchCheckInterval);
            this.matchCheckInterval = 0;
        }

        if (this.searchTimer) {
            this.searchTimer.destroy();
        }

        if (this.matchListener) {
            this.matchListener();
            this.matchListener = null;
        }

        // Only refund if we haven't found a match and didn't explicitly cancel
        if (!this.matchFound && !this.cancelled) {
            // Use setTimeout to avoid async issues during shutdown
            setTimeout(() => {
                this.refundGameFee().then(() => {
                    // Go to start scene
                    this.scene.start('CheckersStartScene', {
                        username: this.username,
                        uid: this.uid
                    });
                }).catch(err => {
                    console.error('Error refunding during shutdown:', err);
                    // Still go to start scene even if refund fails
                    this.scene.start('CheckersStartScene', {
                        username: this.username,
                        uid: this.uid
                    });
                });
            }, 100);

            checkersMultiplayer.leaveQueue(this.uid).catch(err => {
                console.error('Error leaving queue during shutdown:', err);
            });
        }

        checkersMultiplayer.setPlayerOnline(this.uid, false).catch(err => {
            console.error('Error setting offline status:', err);
        });
    }
}