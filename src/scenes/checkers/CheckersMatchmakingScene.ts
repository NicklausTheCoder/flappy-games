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

    /**
     * Tracks whether we successfully deducted the $1 fee this session.
     * Ensures we only refund if we actually charged, and never charge twice.
     */
    private feeCharged: boolean = false;

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

        // CRITICAL: Reset ALL flags — prevents stale state from previous sessions
        this.cancelled = false;
        this.matchFound = false;
        this.transitioning = false;
        this.feeCharged = false; // Reset fee flag so we don't double-charge
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

        console.log('✅ Parsed values:', { username: this.username, uid: this.uid });
        console.log('   flags reset: cancelled=false, matchFound=false, transitioning=false, feeCharged=false');
    }

    async create() {
        console.log('🎬 CheckersMatchmakingScene create() started');
        this.searchStartTime = Date.now();

        this.cameras.main.setBackgroundColor('#1a1a2e');
        this.addBackgroundPieces();

        this.add.text(180, 100, '♟️ FINDING OPPONENT', {
            fontSize: '24px',
            color: '#ffd700',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);

        this.add.text(180, 140, `Player: ${this.displayName}`, {
            fontSize: '14px',
            color: '#ffffff'
        }).setOrigin(0.5);

        this.queueCountText = this.add.text(180, 170, 'Players in queue: ...', {
            fontSize: '12px',
            color: '#888888'
        }).setOrigin(0.5);

        this.createAnimatedPieces();

        this.searchText = this.add.text(180, 380, 'Searching', {
            fontSize: '20px',
            color: '#ffffff'
        }).setOrigin(0.5);

        this.statusText = this.add.text(180, 420, 'Looking for players...', {
            fontSize: '14px',
            color: '#aaaaaa'
        }).setOrigin(0.5);

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

        // ── STEP 1: Charge the $1 fee ONCE before doing anything else ──
        // We do this here (not in joinQueue) so retries don't double-charge.
        console.log('💰 Charging $1 game fee...');
        const feeSuccess = await updateCheckersWalletBalance(
            this.uid,
            -1.00,
            'game_fee',
            'Checkers game fee'
        );

        if (!feeSuccess) {
            console.error('❌ Insufficient funds!');
            this.safeSetText(this.statusText, '❌ Insufficient funds!');
            this.time.delayedCall(2000, () => {
                this.scene.start('CheckersStartScene', { username: this.username, uid: this.uid });
            });
            return; // feeCharged stays false — no refund will be issued
        }

        // Mark that we've charged so all exit paths know to refund
        this.feeCharged = true;
        console.log('✅ $1 fee charged — feeCharged=true');

        // ── STEP 2: Clear stale match notifications ──
        console.log(`🗑️ Clearing stale match notifications for ${this.uid}`);
        await remove(ref(db, `matches/${this.uid}`));
        console.log('✅ Stale notifications cleared');

        // ── STEP 3: Set up match listener ──
        console.log(`📡 Setting up match listener for: matches/${this.uid}`);
        const matchRef = ref(db, `matches/${this.uid}`);
        this.matchListener = onValue(matchRef, (snapshot) => {
            console.log('🔔 MATCH LISTENER FIRED');
            console.log(`   exists=${snapshot.exists()} matchFound=${this.matchFound} transitioning=${this.transitioning} cancelled=${this.cancelled}`);

            if (snapshot.exists() && !this.matchFound && !this.transitioning && !this.cancelled) {
                const match = snapshot.val();
                console.log('🎯 VALID MATCH — proceeding to lobby!', match);

                // Remove the notification immediately
                remove(ref(db, `matches/${this.uid}`)).catch((err) =>
                    console.error('❌ Failed to remove match notification:', err)
                );

                this.handleMatchFound(match.lobbyId);
            } else {
                if (!snapshot.exists()) console.log('   → snapshot empty, ignoring');
                if (this.matchFound) console.log('   → matchFound already true, ignoring duplicate');
                if (this.transitioning) console.log('   → already transitioning, ignoring');
                if (this.cancelled) console.log('   → cancelled, ignoring');
            }
        });

        // ── STEP 4: Animate search dots ──
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

        // ── STEP 5: Join the matchmaking queue ──
        // This does NOT charge any fee — fee was already charged above.
        console.log('📝 Joining queue...');
        await this.joinQueue();

        // ── STEP 6: Keep-alive interval (every 5 seconds) ──
        this.time.addEvent({
            delay: 5000,
            callback: () => {
                if (!this.cancelled && !this.matchFound) {
                    console.log(`💓 Keep-alive for ${this.uid}`);
                    checkersMultiplayer.setPlayerOnline(this.uid, true);
                    checkersMultiplayer.setPlayerQueueStatus(this.uid, true);
                }
            },
            loop: true
        });

        // ── STEP 7: Queue count updater (every 2 seconds) ──
        this.startQueueCountUpdater();

        // ── STEP 8: Timeout handler ──
        console.log(`⏱️ Timeout set for ${this.maxSearchTime / 1000}s`);
        this.time.delayedCall(this.maxSearchTime, () => {
            console.log('⏰ TIMEOUT CHECK');
            console.log(`   matchFound=${this.matchFound} cancelled=${this.cancelled} transitioning=${this.transitioning}`);

            if (!this.matchFound && !this.cancelled && !this.transitioning) {
                console.log('⚠️ Search timed out');
                this.handleTimeout();
            } else {
                console.log('✅ Timeout ignored — match found or cancelled already');
            }
        });

        console.log('✅ create() complete — waiting for match...');
    }

    /**
     * Joins the queue. Does NOT charge any fee.
     * Retries on network failure without re-charging.
     */
    private async joinQueue() {
        console.log('🔍 joinQueue() called');

        // Guard: don't join if we've already been cancelled or matched
        if (this.cancelled || this.matchFound || this.transitioning) {
            console.log('⚠️ joinQueue skipped — scene already ending');
            return;
        }

        try {
            console.log('🎮 Calling checkersMultiplayer.joinQueue()...');
            await checkersMultiplayer.joinQueue(
                this.uid,
                this.username,
                this.displayName,
                this.avatar
            );
            console.log('✅ Successfully joined queue!');
            this.safeSetText(this.statusText, 'In queue — waiting for opponent...');

        } catch (error) {
            console.error('❌ Failed to join queue:', error);
            this.safeSetText(this.statusText, 'Connection issue, retrying...');

            // Retry after 2 seconds — no extra fee is charged
            this.time.delayedCall(2000, () => {
                if (!this.cancelled && !this.matchFound && !this.transitioning) {
                    console.log('🔄 Retrying joinQueue...');
                    this.joinQueue();
                }
            });
        }
    }

    private async getQueueCount(): Promise<number> {
        try {
            const snapshot = await get(ref(db, 'matchmaking/checkers'));
            return snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
        } catch {
            return 0;
        }
    }

    private startQueueCountUpdater() {
        this.time.addEvent({
            delay: 2000,
            callback: async () => {
                if (!this.matchFound && !this.cancelled) {
                    const snapshot = await get(ref(db, 'matchmaking/checkers'));
                    const count = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
                    this.queueCountText.setText(`Players in queue: ${count}`);
                }
            },
            loop: true
        });
    }

    private handleMatchFound(lobbyId: string) {
        console.log('🎉 handleMatchFound() —', lobbyId);

        if (this.matchFound || this.transitioning) {
            console.log('⚠️ Duplicate match event ignored');
            return;
        }

        this.matchFound = true;
        this.transitioning = true;
        // feeCharged stays true — the player found a match, no refund

        this.safeSetText(this.statusText, 'Match found!');
        this.safeSetText(this.searchText, 'Opponent located!');
        this.cameras.main.flash(500, 255, 255, 255);

        this.cancelBtn.disableInteractive();
        this.cancelBtn.setStyle({ backgroundColor: '#888888' });

        if (this.searchTimer) this.searchTimer.destroy();

        checkersMultiplayer.setPlayerQueueStatus(this.uid, false).catch(console.error);

        this.cameras.main.fadeOut(800, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            console.log(`🚀 → CheckersLobbyScene lobbyId=${lobbyId}`);
            this.scene.start('CheckersLobbyScene', {
                username: this.username,
                uid: this.uid,
                lobbyId
            });
        });
    }

    private async cancelSearch() {
        console.log('🚪 cancelSearch()');
        console.log(`   cancelled=${this.cancelled} matchFound=${this.matchFound} transitioning=${this.transitioning}`);

        if (this.cancelled || this.matchFound || this.transitioning) {
            console.log('⚠️ Cancel ignored');
            return;
        }

        this.cancelled = true;
        this.transitioning = true;
        this.safeSetText(this.statusText, 'Cancelling...');

        if (this.searchTimer) this.searchTimer.destroy();
        if (this.matchListener) {
            this.matchListener();
            this.matchListener = null;
        }

        // Leave the queue so we can't be matched while cancelling
        console.log('🗑️ Leaving queue...');
        await checkersMultiplayer.leaveQueue(this.uid);
        console.log('✅ Left queue');

        // Refund ONLY if we actually charged
        await this.issueRefund('Matchmaking cancelled');

        // Fade out and go back
        this.cameras.main.fadeOut(1000, 0, 0, 0);
        this.time.delayedCall(1000, () => {
            this.scene.start('CheckersStartScene', { username: this.username, uid: this.uid });
        });
    }

    private async handleTimeout() {
        console.log('⏰ handleTimeout()');

        if (this.matchFound || this.cancelled || this.transitioning) {
            console.log('⚠️ Timeout ignored');
            return;
        }

        this.cancelled = true;
        this.transitioning = true;
        this.safeSetText(this.statusText, 'No players found');

        if (this.searchTimer) this.searchTimer.destroy();
        if (this.matchListener) {
            this.matchListener();
            this.matchListener = null;
        }

        // Leave queue so matchmaker doesn't pair us mid-refund
        console.log('🗑️ Leaving queue...');
        await checkersMultiplayer.leaveQueue(this.uid);
        console.log('✅ Left queue');

        // Refund ONLY if we actually charged
        await this.issueRefund('Matchmaking timeout');

        this.time.delayedCall(2000, () => {
            this.scene.start('CheckersStartScene', { username: this.username, uid: this.uid });
        });
    }

    /**
     * Issues a $1 refund if and only if feeCharged is true.
     * Sets feeCharged = false afterwards to prevent double-refunds.
     */
    private async issueRefund(reason: string) {
        if (!this.feeCharged) {
            console.log('ℹ️ No refund needed — fee was never charged');
            return;
        }

        this.feeCharged = false; // Prevent double-refund even if called twice
        console.log(`💰 Issuing $1 refund — reason: ${reason}`);

        try {
            await updateCheckersWalletBalance(
                this.uid,
                1.00,
                'refund',
                `${reason} - refund`
            );
            console.log('✅ $1 refund issued successfully');

            // Show refund UI
            if (this.scene && this.scene.isActive()) {
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
            }
        } catch (err) {
            console.error('❌ Refund failed!', err);
            // Even if the refund fails, don't set feeCharged back — the wallet service
            // should be retried at a higher level if needed.
        }
    }

    /** Safely set text — checks scene is still active first */
    private safeSetText(textObj: Phaser.GameObjects.Text, value: string) {
        if (this.scene && this.scene.isActive() && textObj && textObj.active) {
            textObj.setText(value);
        }
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
                alpha
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
        console.log('🛑 CheckersMatchmakingScene shutdown()');
        console.log(`   matchFound=${this.matchFound} transitioning=${this.transitioning} cancelled=${this.cancelled} feeCharged=${this.feeCharged}`);

        if (this.searchTimer) this.searchTimer.destroy();

        if (this.matchListener) {
            this.matchListener();
            this.matchListener = null;
        }

        // If shutdown fires unexpectedly (e.g. browser close, scene switch from outside)
        // and we haven't cancelled/matched yet, issue the refund.
        if (!this.matchFound && !this.cancelled && !this.transitioning) {
            console.log('⚠️ Unexpected shutdown — issuing refund and leaving queue');
            // Fire-and-forget is acceptable here since shutdown is synchronous
            this.issueRefund('Unexpected shutdown');
            checkersMultiplayer.leaveQueue(this.uid);
            checkersMultiplayer.setPlayerOnline(this.uid, false);
        } else {
            console.log('✅ Cleanup skipped — match found or intentionally cancelled');
        }
    }
}