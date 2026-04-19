// src/scenes/checkers/CheckersStartScene.ts
import Phaser from 'phaser';
import {
    getCheckersUserData,
    getCheckersLeaderboard,
    CheckersUserData,
    getCheckersBalance,
    CheckersLeaderboardEntry
} from '../../firebase/checkersService';

export class CheckersStartScene extends Phaser.Scene {
    private username: string = '';
    private uid: string = '';

    private userData: CheckersUserData | null = null;
    private leaderboard: CheckersLeaderboardEntry[] = [];
    private playerRank: number = 0;
    private balance: number = 0;
    private displayName: string = '';
    private avatar: string = '';

    // Prevents double-tap / double-click on Find Match
    private findMatchLocked: boolean = false;

    // UI Elements
    private balanceText!: Phaser.GameObjects.Text;
    private statsText!: Phaser.GameObjects.Text;
    private rankText!: Phaser.GameObjects.Text;
    private menuButtons: Phaser.GameObjects.Text[] = [];
    private loadingText!: Phaser.GameObjects.Text;
    private errorText!: Phaser.GameObjects.Text;
    private retryButton!: Phaser.GameObjects.Text;

    // Checker pieces for animation
    private redPiece!: Phaser.GameObjects.Image;
    private blackPiece!: Phaser.GameObjects.Image;

    constructor() {
        super({ key: 'CheckersStartScene' });
    }

    init(data: { username: string; uid?: string; displayName?: string; avatar?: string }) {
        console.log('📥 CheckersStartScene received:', data);

        if (!data || !data.username) {
            console.error('❌ No username received!');
            this.showErrorAndRedirect('No username provided');
            return;
        }

        this.username    = data.username;
        this.uid         = data.uid || '';
        this.displayName = data.username;
        this.avatar      = data.avatar || 'default';

        // Always reset the lock when the scene reinitialises
        this.findMatchLocked = false;

        console.log('👤 Username:', this.username, '| UID:', this.uid);
    }

    async create() {
        console.log('🎨 Creating CheckersStartScene for:', this.username);

        this.addBackground();
        this.showLoading();

        try {
            await this.fetchAllUserData();
            this.loadingText?.destroy();
            this.buildFullUI();
        } catch (error) {
            console.error('❌ Failed to load data:', error);
            this.showError('Failed to load game data. Please try again.');
        }
    }

    // ─────────────────────────────────────────────
    //  DATA LOADING
    // ─────────────────────────────────────────────

    private async fetchAllUserData() {
        console.log('📡 Fetching Checkers data for:', this.username);

        const [userData, leaderboard, balance] = await Promise.all([
            getCheckersUserData(this.uid),
            getCheckersLeaderboard(10),
            getCheckersBalance(this.uid)
        ]);

        if (!userData) throw new Error('No user data found for: ' + this.username);

        this.userData    = userData;
        this.leaderboard = leaderboard;
        this.balance     = balance;

        const rankIndex  = leaderboard.findIndex(e => e.username === this.username);
        this.playerRank  = rankIndex + 1;

        console.log('✅ Data fetched:', {
            username: this.username,
            gamesPlayed: this.userData.gamesPlayed,
            gamesWon: this.userData.gamesWon,
            balance: this.balance
        });
    }

    // ─────────────────────────────────────────────
    //  UI BUILDERS
    // ─────────────────────────────────────────────

    private buildFullUI() {
        if (!this.userData) return;

        this.addTitle();
        this.addCheckerPieces();
        this.createBalanceDisplay();
        this.createStatsDisplay();
        this.createRankDisplay();
        this.createWelcomeMessage();
        this.createMenuButtons();
        this.addFooter();
        this.setupInputHandlers();
    }

    private addBackground() {
        this.cameras.main.setBackgroundColor('#2a1a0a');
        for (let i = 0; i < 5; i++) {
            const sq = this.add.rectangle(
                Phaser.Math.Between(0, 360),
                Phaser.Math.Between(0, 640),
                20, 20, 0x8b4513, 0.1
            );
            sq.angle = 45;
        }
    }

    private showLoading() {
        this.loadingText = this.add.text(180, 300, 'LOADING CHECKERS DATA...', {
            fontSize: '18px',
            color: '#ffff00'
        }).setOrigin(0.5);
    }

    private showError(message: string) {
        this.loadingText?.destroy();

        const overlay = this.add.graphics();
        overlay.fillStyle(0x000000, 0.9);
        overlay.fillRect(0, 0, 360, 640);

        this.add.text(180, 200, '❌', { fontSize: '48px', color: '#ff0000' }).setOrigin(0.5);
        this.errorText = this.add.text(180, 260, message, {
            fontSize: '18px', color: '#ffffff',
            stroke: '#000000', strokeThickness: 2,
            wordWrap: { width: 300 }
        }).setOrigin(0.5);

        this.retryButton = this.add.text(180, 330, '🔄 TRY AGAIN', {
            fontSize: '20px', color: '#ffffff',
            backgroundColor: '#4CAF50', padding: { x: 15, y: 8 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        this.retryButton.on('pointerdown', () => {
            this.scene.restart({ username: this.username, uid: this.uid });
        });
    }

    private showErrorAndRedirect(message: string) {
        this.loadingText?.destroy();

        const overlay = this.add.graphics();
        overlay.fillStyle(0x000000, 0.9);
        overlay.fillRect(0, 0, 360, 640);

        this.add.text(180, 250, '🔒', { fontSize: '48px', color: '#ff0000' }).setOrigin(0.5);
        this.add.text(180, 310, message,           { fontSize: '18px', color: '#ffffff' }).setOrigin(0.5);
        this.add.text(180, 370, 'Returning to login...', { fontSize: '14px', color: '#ffff00' }).setOrigin(0.5);

        setTimeout(() => { this.scene.start('CookieScene'); }, 2000);
    }

    private addTitle() {
        this.add.text(180, 70, 'CHECKERS', {
            fontSize: '32px', color: '#ffaa00',
            fontStyle: 'bold', stroke: '#8b4513', strokeThickness: 4
        }).setOrigin(0.5);
    }

    private addCheckerPieces() {
        if (!this.textures.exists('red_normal') || !this.textures.exists('black_normal')) return;

        this.redPiece = this.add.image(120, 140, 'red_normal').setDisplaySize(40, 40);
        this.blackPiece = this.add.image(240, 140, 'black_normal').setDisplaySize(40, 40);

        this.tweens.add({ targets: [this.redPiece, this.blackPiece], y: 130, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: [this.redPiece, this.blackPiece], angle: 5, duration: 600, yoyo: true, repeat: -1 });
    }

    private createWelcomeMessage() {
        if (!this.userData) return;

        this.add.text(180, 190, `Welcome, ${this.displayName}!`, {
            fontSize: '16px', color: '#ffff00',
            stroke: '#000000', strokeThickness: 2
        }).setOrigin(0.5);

        this.add.text(180, 210, `${this.userData.rank} • Level ${this.userData.level}`, {
            fontSize: '14px', color: '#ffffff'
        }).setOrigin(0.5);

        const winRate = this.userData.gamesPlayed > 0
            ? Math.round((this.userData.gamesWon / this.userData.gamesPlayed) * 100)
            : 0;

        this.add.text(180, 230, `Wins: ${this.userData.gamesWon} | Win Rate: ${winRate}%`, {
            fontSize: '12px', color: '#ffffff'
        }).setOrigin(0.5);
    }

    private createBalanceDisplay() {
        const bg = this.add.graphics();
        bg.fillStyle(0x000000, 0.7);
        bg.fillRoundedRect(5, 5, 110, 40, 8);
        bg.lineStyle(1, 0xffaa00);
        bg.strokeRoundedRect(5, 5, 110, 40, 8);

        this.add.text(10, 8,  '💰',  { fontSize: '20px' });
        this.add.text(35, 8,  'Bal:', { fontSize: '12px', color: '#ffffff' });
        this.balanceText = this.add.text(35, 23, `${this.balance.toFixed(0)}`, {
            fontSize: '14px', color: '#00ff00', fontStyle: 'bold'
        });
    }

    private createStatsDisplay() {
        if (!this.userData) return;

        const bg = this.add.graphics();
        bg.fillStyle(0x000000, 0.7);
        bg.fillRoundedRect(245, 5, 110, 40, 8);
        bg.lineStyle(1, 0xffaa00);
        bg.strokeRoundedRect(245, 5, 110, 40, 8);

        this.add.text(250, 8, '📊',    { fontSize: '20px' });
        this.add.text(275, 8, 'Stats:', { fontSize: '12px', color: '#ffffff' });
        this.statsText = this.add.text(265, 23, `${this.userData.gamesPlayed || 0} Games`, {
            fontSize: '12px', color: '#ffaa00', fontStyle: 'bold'
        });
    }

    private createRankDisplay() {
        const bg = this.add.graphics();
        bg.fillStyle(0x000000, 0.7);
        bg.fillRoundedRect(125, 5, 110, 40, 8);
        bg.lineStyle(1, 0xffaa00);
        bg.strokeRoundedRect(125, 5, 110, 40, 8);

        this.add.text(130, 8, '🏆',   { fontSize: '20px' });
        this.add.text(160, 8, 'Rank:', { fontSize: '12px', color: '#ffffff' });
        this.rankText = this.add.text(165, 23, `#${this.playerRank || 999}`, {
            fontSize: '14px', color: '#ffaa00', fontStyle: 'bold'
        });
    }

    private createMenuButtons() {
        if (!this.userData) return;

        const buttonWidth  = 160;
        const buttonHeight = 45;
        const startX       = 180;
        const startY       = 280;

        const buttons = [
            { text: '🎮 FIND MATCH',     color: '#FF9800', scene: 'CheckersMatchmakingScene' },
            { text: '🏆 LEADERBOARD',    color: '#2196F3', scene: 'CheckersLeaderboardScene' },
            { text: '👤 PROFILE',        color: '#9C27B0', scene: 'CheckersProfileScene' },
            { text: '📊 MY STATS',       color: '#9C27B0', scene: 'CheckersStatsScene' },
            { text: '⚡ TEST SKILL',     color: '#FF9800', scene: 'CheckersTestSkillScene' },
            { text: '🎮 BACK TO GAMES',  color: '#FF5722', isExternal: true, url: 'https://wintapgames.com/games' }
        ] as const;

        buttons.forEach((btn, index) => {
            const yPos = startY + index * 55;

            const bg = this.add.graphics();
            const drawBg = (highlight: boolean) => {
                bg.clear();
                bg.fillStyle(Phaser.Display.Color.HexStringToColor(btn.color).color, 1);
                bg.fillRoundedRect(startX - buttonWidth / 2, yPos - buttonHeight / 2, buttonWidth, buttonHeight, 12);
                bg.lineStyle(highlight ? 3 : 2, highlight ? 0xffff00 : 0xffffff, 1);
                bg.strokeRoundedRect(startX - buttonWidth / 2, yPos - buttonHeight / 2, buttonWidth, buttonHeight, 12);
            };
            drawBg(false);

            const button = this.add.text(startX, yPos, btn.text, {
                fontSize: '16px', color: '#ffffff',
                fontStyle: 'bold', stroke: '#000000', strokeThickness: 2
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });

            button.on('pointerover', () => { button.setStyle({ color: '#ffff00' }); button.setScale(1.05); drawBg(true);  });
            button.on('pointerout',  () => { button.setStyle({ color: '#ffffff' }); button.setScale(1);    drawBg(false); });

            // ── Button actions ──
            if ('isExternal' in btn && btn.isExternal && btn.url) {
                button.on('pointerdown', () => { window.location.href = btn.url; });

            } else if (btn.text === '🎮 FIND MATCH') {
                button.on('pointerdown', () => this.handleFindMatch(button, bg, drawBg, buttonWidth, buttonHeight, startX, yPos));

            } else {
                button.on('pointerdown', () => {
                    this.scene.start(btn.scene, {
                        username: this.username,
                        userData: this.userData,
                        uid: this.uid
                    });
                });
            }

            this.menuButtons.push(button);
        });
    }

    /**
     * Handles the Find Match button press with:
     *   1. Immediate lock to prevent double-press
     *   2. Visual loading state on the button
     *   3. Balance check (reads live balance, not stale UI value)
     *   4. Scene transition — fee is charged inside CheckersMatchmakingScene, not here
     */
    private async handleFindMatch(
        button: Phaser.GameObjects.Text,
        bg: Phaser.GameObjects.Graphics,
        drawBg: (highlight: boolean) => void,
        buttonWidth: number,
        buttonHeight: number,
        startX: number,
        yPos: number
    ) {
        // ── Guard: one press at a time ──
        if (this.findMatchLocked) {
            console.log('🔒 Find Match already in progress, ignoring extra press');
            return;
        }
        this.findMatchLocked = true;

        // ── Visual: show loading state immediately ──
        button.setText('⏳ SEARCHING...');
        button.disableInteractive();
        bg.clear();
        bg.fillStyle(0x555555, 1);
        bg.fillRoundedRect(startX - buttonWidth / 2, yPos - buttonHeight / 2, buttonWidth, buttonHeight, 12);
        bg.lineStyle(2, 0x888888, 1);
        bg.strokeRoundedRect(startX - buttonWidth / 2, yPos - buttonHeight / 2, buttonWidth, buttonHeight, 12);

        // Pulsing animation so the user knows something is happening
        const pulse = this.tweens.add({
            targets: button,
            alpha: 0.5,
            duration: 400,
            yoyo: true,
            repeat: -1
        });

        try {
            // ── Live balance check (avoids stale UI state) ──
            const { getCheckersBalance } = await import('../../firebase/checkersService');
            const liveBalance = await getCheckersBalance(this.uid);
            console.log(`💰 Live balance check: $${liveBalance}`);

            if (liveBalance < 1) {
                pulse.stop();
                button.setAlpha(1);
                this.showInsufficientFunds();

                // Restore button
                button.setText('🎮 FIND MATCH');
                button.setInteractive({ useHandCursor: true });
                drawBg(false);
                this.findMatchLocked = false;
                return;
            }

            // ── All good — transition to matchmaking ──
            // The $1 fee is deducted atomically inside CheckersMatchmakingScene.create()
            // so it's charged once and always refunded if no match is found.
            pulse.stop();
            button.setAlpha(1);
            button.setText('✅ FOUND!');

            this.cameras.main.fadeOut(400, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.start('CheckersMatchmakingScene', {
                    username: this.username,
                    userData: this.userData,
                    uid: this.uid
                });
            });

        } catch (error) {
            console.error('❌ Error during Find Match:', error);
            pulse.stop();
            button.setAlpha(1);
            button.setText('🎮 FIND MATCH');
            button.setInteractive({ useHandCursor: true });
            drawBg(false);
            this.findMatchLocked = false;
            this.showError('Connection error. Please try again.');
        }
    }

    private showInsufficientFunds() {
        const popup = this.add.graphics();
        popup.fillStyle(0x000000, 0.9);
        popup.fillRoundedRect(40, 200, 280, 150, 10);
        popup.lineStyle(2, 0xff0000, 1);
        popup.strokeRoundedRect(40, 200, 280, 150, 10);

        const icon  = this.add.text(180, 230, '⚠️', { fontSize: '40px' }).setOrigin(0.5);
        const title = this.add.text(180, 280, 'Insufficient Coins!', { fontSize: '18px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
        const sub   = this.add.text(180, 310, 'Need $1 to play',     { fontSize: '14px', color: '#ffff00' }).setOrigin(0.5);
        const close = this.add.text(180, 340, 'OK', {
            fontSize: '16px', color: '#ffffff',
            backgroundColor: '#4CAF50', padding: { x: 20, y: 5 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        const destroy = () => { popup.destroy(); icon.destroy(); title.destroy(); sub.destroy(); close.destroy(); };
        close.on('pointerdown', destroy);
        this.time.delayedCall(3000, destroy);
    }

    private addFooter() {
        this.add.text(340, 620, 'Checkers v1.0.0', { fontSize: '10px', color: '#666666' }).setOrigin(1, 0);
    }

    private setupInputHandlers() {
        if (!this.userData || !this.input.keyboard) return;

        this.input.keyboard.on('keydown-ENTER', () => {
            if (this.userData && this.balance >= 1) {
                this.scene.start('CheckersGameScene', {
                    username: this.username, uid: this.uid,
                    displayName: this.displayName, avatar: this.avatar
                });
            }
        });
    }
}