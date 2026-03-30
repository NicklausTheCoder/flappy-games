// src/scenes/checkers/CheckersMatchmakingScene.ts
import Phaser from 'phaser';
import { checkersMultiplayer } from '../../firebase/checkersMultiplayer';
import { ref, get, onValue, remove } from 'firebase/database';
import { db } from '../../firebase/init';
import { updateCheckersWalletBalance } from '../../firebase/checkersService';

export class CheckersMatchmakingScene extends Phaser.Scene {
    private username: string = '';
    private uid: string = '';
    private displayName: string = '';
    private avatar: string = '';

    private searchTimer!: Phaser.Time.TimerEvent;
    private cancelled: boolean = false;
    private matchFound: boolean = false;
    private transitioning: boolean = false;
    private maxSearchTime: number = 60000;
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
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('♟️ CheckersMatchmakingScene init STARTED');
        console.log('📦 Data received:', data);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // CRITICAL: RESET ALL FLAGS to prevent stale state from previous matches
        this.cancelled = false;
        this.matchFound = false;
        this.transitioning = false;
        this.searchStartTime = 0;

        // Clean up any existing timers/listeners
        if (this.searchTimer) {
            this.searchTimer.destroy();
            this.searchTimer = null as any;
        }

        if (this.matchListener) {
            this.matchListener();
            this.matchListener = null;
        }

        // Parse user data
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

        console.log('✅ Parsed values:');
        console.log('   username:', this.username);
        console.log('   uid:', this.uid);
        console.log('   displayName:', this.displayName);
        console.log('   avatar:', this.avatar);
        console.log('   flags reset: cancelled=false, matchFound=false, transitioning=false');
    }
    async create() {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🎬 CheckersMatchmakingScene create() started');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // Reset search start time
        this.searchStartTime = Date.now();
        console.log(`⏰ Search start time: ${new Date(this.searchStartTime).toLocaleTimeString()}`);

        // Set background
        this.cameras.main.setBackgroundColor('#1a1a2e');
        this.addBackgroundPieces();

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
            console.log('🖱️ Cancel button clicked');
            this.cancelSearch();
        });

        // STEP 1: Clear ANY existing match notifications FIRST (prevents stale matches)
        console.log(`🗑️ Clearing any stale match notifications for ${this.uid}`);
        await remove(ref(db, `matches/${this.uid}`));
        console.log('✅ Stale match notifications cleared');

        // STEP 2: Set up match listener
        console.log(`📡 Setting up match listener for path: matches/${this.uid}`);
        const matchRef = ref(db, `matches/${this.uid}`);
        this.matchListener = onValue(matchRef, (snapshot) => {
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('🔔 MATCH LISTENER FIRED!');
            console.log(`   Path: matches/${this.uid}`);
            console.log(`   Snapshot exists: ${snapshot.exists()}`);
            console.log(`   matchFound: ${this.matchFound}`);
            console.log(`   transitioning: ${this.transitioning}`);
            console.log(`   cancelled: ${this.cancelled}`);

            if (snapshot.exists()) {
                const match = snapshot.val();
                console.log('   Match data:', match);
            }

            if (snapshot.exists() && !this.matchFound && !this.transitioning) {
                const match = snapshot.val();
                console.log('🎯 VALID MATCH - proceeding to lobby!');
                console.log(`   lobbyId: ${match.lobbyId}`);
                console.log(`   gameId: ${match.gameId}`);

                // Remove the notification immediately
                console.log(`🗑️ Removing match notification for ${this.uid}`);
                remove(ref(db, `matches/${this.uid}`)).then(() => {
                    console.log('✅ Match notification removed');
                }).catch(err => {
                    console.error('❌ Failed to remove match notification:', err);
                });

                this.handleMatchFound(match.lobbyId);
            } else {
                console.log('❌ Match IGNORED - conditions not met');
                if (this.matchFound) console.log('   - matchFound is true');
                if (this.transitioning) console.log('   - transitioning is true');
                if (this.cancelled) console.log('   - cancelled is true');
                if (!snapshot.exists()) console.log('   - snapshot does not exist');
            }
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        });

        // STEP 3: Animate search dots
        let dots = 0;
        this.searchTimer = this.time.addEvent({
            delay: 500,
            callback: () => {
                if (!this.matchFound && !this.cancelled) {
                    dots = (dots + 1) % 4;
                    this.searchText.setText('Searching' + '.'.repeat(dots));
                }
            },
            loop: true
        });

        // STEP 4: Join matchmaking queue
        console.log('📝 About to join queue...');
        await this.joinQueue();

        // STEP 5: Keep-alive interval (every 5 seconds)
        console.log('🔄 Setting up keep-alive interval (every 5 seconds)');
        this.time.addEvent({
            delay: 5000,
            callback: () => {
                if (!this.cancelled && !this.matchFound) {
                    console.log(`💓 Keep-alive ping for ${this.uid} at ${new Date().toLocaleTimeString()}`);
                    checkersMultiplayer.setPlayerOnline(this.uid, true);
                    checkersMultiplayer.setPlayerQueueStatus(this.uid, true);
                }
            },
            loop: true
        });

        // STEP 6: Update queue count periodically (every 2 seconds)
        this.startQueueCountUpdater();

        // STEP 7: Set timeout handler
        console.log(`⏱️ Setting timeout for ${this.maxSearchTime}ms (${this.maxSearchTime / 1000} seconds)`);
        this.time.delayedCall(this.maxSearchTime, () => {
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('⏰ TIMEOUT CHECK FIRED');
            console.log(`   matchFound: ${this.matchFound}`);
            console.log(`   cancelled: ${this.cancelled}`);
            console.log(`   transitioning: ${this.transitioning}`);

            if (!this.matchFound && !this.cancelled && !this.transitioning) {
                console.log('⚠️ Search timed out - handling timeout');
                this.handleTimeout();
            } else {
                console.log('✅ Timeout ignored - match already found or cancelled');
            }
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        });

        console.log('✅ create() completed, waiting for match...');
    }

    private async joinQueue() {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🔍 joinQueue() called');
        console.log(`   uid: ${this.uid}`);
        console.log(`   username: ${this.username}`);
        console.log(`   displayName: ${this.displayName}`);
        console.log(`   avatar: ${this.avatar}`);

        try {
            console.log('📡 Checking current online status...');
            const onlineStatus = await checkersMultiplayer.isPlayerOnline(this.uid);
            console.log(`   Current online status: ${onlineStatus}`);

            // Double-check: Clear any existing match notifications again
            console.log('🗑️ Clearing any existing match notifications...');
            await remove(ref(db, `matches/${this.uid}`));
            console.log('✅ Match notifications cleared');

            console.log('💰 Deducting $1 game fee...');
            const feeSuccess = await updateCheckersWalletBalance(
                this.uid,
                -1.00,
                'game_fee',
                'Checkers game fee'
            );

            if (!feeSuccess) {
                console.error('❌ Insufficient funds!');
                // Use setTimeout to avoid Phaser text error during scene transition
                setTimeout(() => {
                    if (this.scene && this.scene.isActive()) {
                        this.statusText.setText('❌ Insufficient funds!');
                    }
                }, 100);
                this.time.delayedCall(2000, () => {
                    this.scene.start('CheckersStartScene', {
                        username: this.username,
                        uid: this.uid
                    });
                });
                return;
            }
            console.log('✅ Game fee deducted successfully');

            console.log('🎮 Calling checkersMultiplayer.joinQueue()...');
            await checkersMultiplayer.joinQueue(
                this.uid,
                this.username,
                this.displayName,
                this.avatar
            );

            console.log('✅ Successfully joined queue!');

            // Safely update UI text
            setTimeout(() => {
                if (this.scene && this.scene.isActive()) {
                    this.statusText.setText('In queue - waiting for opponent...');
                }
            }, 100);

            // Get queue count
            const queueCount = await this.getQueueCount();
            console.log(`📊 Current queue size: ${queueCount}`);

        } catch (error) {
            console.error('❌ Failed to join queue:', error);

            // Safely update UI text
            setTimeout(() => {
                if (this.scene && this.scene.isActive()) {
                    this.statusText.setText('Failed to join queue. Retrying...');
                }
            }, 100);


            this.time.delayedCall(2000, () => {
                console.log('🔄 Retrying joinQueue...');
                this.joinQueue();
            });
        }
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }




    private async getQueueCount(): Promise<number> {
        try {
            const queueRef = ref(db, 'matchmaking/checkers');
            const snapshot = await get(queueRef);
            const count = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
            console.log(`📊 Queue count: ${count}`);
            return count;
        } catch (error) {
            console.error('Error getting queue count:', error);
            return 0;
        }
    }

    private async startQueueCountUpdater() {
        console.log('🔄 Starting queue count updater (every 2 seconds)');
        this.time.addEvent({
            delay: 2000,
            callback: async () => {
                if (!this.matchFound && !this.cancelled) {
                    const queueRef = ref(db, 'matchmaking/checkers');
                    const snapshot = await get(queueRef);
                    const count = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
                    this.queueCountText.setText(`Players in queue: ${count}`);

                    // Also log the actual players in queue occasionally
                    if (count > 0 && Math.random() < 0.3) { // Log 30% of the time to avoid spam
                        const players = snapshot.val();
                        console.log(`👥 Players in queue:`, Object.keys(players).join(', '));
                    }
                }
            },
            loop: true
        });
    }

    private handleMatchFound(lobbyId: string) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🎉 handleMatchFound() called!');
        console.log(`   lobbyId: ${lobbyId}`);
        console.log(`   matchFound before: ${this.matchFound}`);
        console.log(`   transitioning before: ${this.transitioning}`);

        if (this.matchFound || this.transitioning) {
            console.log('⚠️ Already handling a match, ignoring duplicate');
            return;
        }

        this.matchFound = true;
        this.transitioning = true;

        console.log('✅ Match accepted!');
        console.log(`   matchFound set to: ${this.matchFound}`);
        console.log(`   transitioning set to: ${this.transitioning}`);

        // Update UI
        this.statusText.setText('Match found!');
        this.searchText.setText('Opponent located!');
        this.cameras.main.flash(500, 255, 255, 255);
        console.log('✨ UI updated with match found visuals');

        // Disable cancel button
        this.cancelBtn.disableInteractive();
        this.cancelBtn.setStyle({ backgroundColor: '#888888' });
        console.log('🔘 Cancel button disabled');

        // Stop timer
        if (this.searchTimer) {
            this.searchTimer.destroy();
            console.log('⏹️ Search timer stopped');
        }

        // Clear queue status (no await needed here, fire and forget)
        console.log('🗑️ Clearing queue status...');
        checkersMultiplayer.setPlayerQueueStatus(this.uid, false).then(() => {
            console.log('✅ Queue status cleared');
        }).catch(err => {
            console.error('❌ Failed to clear queue status:', err);
        });

        // Fade out and go to lobby
        console.log('🎬 Starting fade out to lobby...');
        this.cameras.main.fadeOut(800, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            console.log(`🚀 Transitioning to CheckersLobbyScene with lobbyId: ${lobbyId}`);
            this.scene.start('CheckersLobbyScene', {
                username: this.username,
                uid: this.uid,
                lobbyId: lobbyId
            });
        });
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }

    private async cancelSearch() {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🚪 cancelSearch() called');
        console.log(`   cancelled before: ${this.cancelled}`);
        console.log(`   matchFound before: ${this.matchFound}`);
        console.log(`   transitioning before: ${this.transitioning}`);

        if (this.cancelled || this.matchFound || this.transitioning) {
            console.log('⚠️ Cancel ignored - already in progress or completed');
            return;
        }

        this.cancelled = true;
        this.transitioning = true;
        console.log('✅ Cancel accepted');

        this.statusText.setText('Cancelling...');
        console.log('📝 Status updated to "Cancelling..."');

        // Stop timer
        if (this.searchTimer) {
            this.searchTimer.destroy();
            console.log('⏹️ Search timer stopped');
        }

        // Remove listener
        if (this.matchListener) {
            this.matchListener();
            this.matchListener = null;
            console.log('🔌 Match listener removed');
        }

        // Leave queue
        console.log('🗑️ Leaving queue...');
        await checkersMultiplayer.leaveQueue(this.uid);
        console.log('✅ Left queue');

        // Refund the dollar
        console.log('💰 Refunding $1...');
        await updateCheckersWalletBalance(
            this.uid,
            1.00,
            'refund',
            'Matchmaking cancelled - refund'
        );
        console.log('✅ Refund processed');

        // Show refund message
        const refundText = this.add.text(180, 450, '+$1 REFUNDED', {
            fontSize: '18px',
            color: '#00ff00',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 2
        }).setOrigin(0.5);

        this.tweens.add({
            targets: refundText,
            y: 400,
            alpha: 0,
            duration: 1500,
            onComplete: () => refundText.destroy()
        });
        console.log('✨ Refund message displayed');

        // Fade out and go back to start scene
        console.log('🎬 Fading out to StartScene...');
        this.cameras.main.fadeOut(1000, 0, 0, 0);
        this.time.delayedCall(1000, () => {
            console.log('🏠 Returning to CheckersStartScene');
            this.scene.start('CheckersStartScene', {
                username: this.username,
                uid: this.uid
            });
        });
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }

    private async handleTimeout() {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('⏰ handleTimeout() called');
        console.log(`   matchFound: ${this.matchFound}`);
        console.log(`   cancelled: ${this.cancelled}`);
        console.log(`   transitioning: ${this.transitioning}`);

        if (this.matchFound || this.cancelled || this.transitioning) {
            console.log('⚠️ Timeout ignored - match already found or cancelled');
            return;
        }

        this.cancelled = true;
        this.transitioning = true;
        console.log('✅ Timeout accepted');

        this.statusText.setText('No players found');
        console.log('📝 Status updated to "No players found"');

        // Refund the dollar
        console.log('💰 Refunding $1 due to timeout...');
        await updateCheckersWalletBalance(
            this.uid,
            1.00,
            'refund',
            'Matchmaking timeout - refund'
        );
        console.log('✅ Refund processed');

        console.log('🗑️ Leaving queue...');
        await checkersMultiplayer.leaveQueue(this.uid);
        console.log('✅ Left queue');

        console.log('🎬 Returning to StartScene in 2 seconds...');
        this.time.delayedCall(2000, () => {
            console.log('🏠 Returning to CheckersStartScene');
            this.scene.start('CheckersStartScene', {
                username: this.username,
                uid: this.uid
            });
        });
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }

    private createAnimatedPieces() {
        this.piece1 = this.add.text(140, 260, '🔴', { fontSize: '48px' });
        this.piece2 = this.add.text(200, 300, '⚫', { fontSize: '48px' });

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
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🛑 CheckersMatchmakingScene shutdown() called');
        console.log(`   matchFound: ${this.matchFound}`);
        console.log(`   transitioning: ${this.transitioning}`);
        console.log(`   cancelled: ${this.cancelled}`);

        if (this.searchTimer) {
            this.searchTimer.destroy();
            console.log('⏹️ Search timer destroyed');
        }

        if (this.matchListener) {
            this.matchListener();
            this.matchListener = null;
            console.log('🔌 Match listener destroyed');
        }

        // Only cleanup if not transitioning to lobby
        if (!this.matchFound && !this.transitioning) {
            console.log('🗑️ Cleanup: leaving queue and setting offline');
            checkersMultiplayer.leaveQueue(this.uid);
            checkersMultiplayer.setPlayerOnline(this.uid, false);
        } else {
            console.log('✅ Cleanup skipped - match found or transitioning');
        }
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }
}