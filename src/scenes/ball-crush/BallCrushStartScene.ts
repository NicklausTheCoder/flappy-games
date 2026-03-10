// src/scenes/ball-crush/BallCrushStartScene.ts
import Phaser from 'phaser';
import { multiGameQueries, GameStats } from '../../firebase/firebase.queries';
import { ref, get } from 'firebase/database';
import { db } from '../../firebase/init';

// Interface for user data we need in the scene
interface BallCrushUserData {
    uid: string;
    username: string;
    displayName: string;
    balance: number;
    highScore: number;
    totalGames: number;
    totalWins: number;
    winStreak: number;
    level: number;
    rank: string;
    avatar: string;
}

export class BallCrushStartScene extends Phaser.Scene {
    // Receive username from LoaderScene
    private username: string = '';
    private uid: string = '';

    // Then we fetch ALL this data ourselves
    private userData: BallCrushUserData | null = null;
    private gameStats: GameStats | null = null;
    private leaderboard: any[] = [];
    private playerRank: number = 0;

    // UI Elements
    private balanceText!: Phaser.GameObjects.Text;
    private highScoreText!: Phaser.GameObjects.Text;
    private rankText!: Phaser.GameObjects.Text;
    private menuButtons: Phaser.GameObjects.Text[] = [];
    private ballSprite!: Phaser.GameObjects.Sprite;
    private loadingText!: Phaser.GameObjects.Text;
    private errorText!: Phaser.GameObjects.Text;
    private retryButton!: Phaser.GameObjects.Text;

    // Game ID for this scene
    private readonly GAME_ID = 'ball-crush';

    constructor() {
        super({ key: 'BallCrushStartScene' });
    }

    // RECEIVE USERNAME FROM LOADERSCENE
    init(data: { username: string }) {
        console.log('📥 BallCrushStartScene received:', data);

        if (!data || !data.username) {
            console.error('❌ No username received!');
            this.showErrorAndRedirect('No username provided');
            return;
        }

        this.username = data.username;
        console.log('👤 Username set to:', this.username);
    }

    async create() {
        console.log('🎨 Creating BallCrushStartScene for:', this.username);

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

    private showLoading() {
        this.loadingText = this.add.text(180, 300, `LOADING DATA...`, {
            fontSize: '18px',
            color: '#ffaa00'
        }).setOrigin(0.5);
    }

    private showError(message: string) {
        this.loadingText?.destroy();

        // Dark overlay
        const overlay = this.add.graphics();
        overlay.fillStyle(0x000000, 0.9);
        overlay.fillRect(0, 0, 360, 640);

        // Error icon
        this.add.text(180, 200, '❌', {
            fontSize: '48px',
            color: '#ff0000'
        }).setOrigin(0.5);

        // Error message
        this.errorText = this.add.text(180, 260, message, {
            fontSize: '18px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 2,
            wordWrap: { width: 300 }
        }).setOrigin(0.5);

        // Retry button
        this.retryButton = this.add.text(180, 330, '🔄 TRY AGAIN', {
            fontSize: '20px',
            color: '#ffffff',
            backgroundColor: '#4CAF50',
            padding: { x: 15, y: 8 }
        })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });

        this.retryButton.on('pointerover', () => {
            this.retryButton.setStyle({ color: '#ffff00', backgroundColor: '#45a049' });
        });

        this.retryButton.on('pointerout', () => {
            this.retryButton.setStyle({ color: '#ffffff', backgroundColor: '#4CAF50' });
        });

        this.retryButton.on('pointerdown', () => {
            this.scene.restart();
        });
    }

    private debugShowData() {
        if (!this.userData) return;

        // Show raw data for debugging
        this.add.text(180, 550, `Debug: HS=${this.userData.highScore} Bal=${this.userData.balance}`, {
            fontSize: '10px',
            color: '#ff0000'
        }).setOrigin(0.5);
    }

    private showErrorAndRedirect(message: string) {
        this.loadingText?.destroy();

        const overlay = this.add.graphics();
        overlay.fillStyle(0x000000, 0.9);
        overlay.fillRect(0, 0, 360, 640);

        this.add.text(180, 250, '🔒', {
            fontSize: '48px',
            color: '#ff0000'
        }).setOrigin(0.5);

        this.add.text(180, 310, message, {
            fontSize: '18px',
            color: '#ffffff'
        }).setOrigin(0.5);

        this.add.text(180, 370, 'Redirecting to login...', {
            fontSize: '14px',
            color: '#ffff00'
        }).setOrigin(0.5);

        setTimeout(() => {
            window.location.href = '/login';
        }, 2000);
    }
// In BallCrushStartScene.ts - update fetchAllUserData
private async fetchAllUserData() {
    console.log('📡 Fetching data for:', this.username);

    try {
        // Get UID
        const lookupRef = ref(db, `lookups/byUsername/${this.username.toLowerCase()}`);
        const lookupSnapshot = await get(lookupRef);

        if (!lookupSnapshot.exists()) {
            throw new Error('User not found: ' + this.username);
        }

        this.uid = lookupSnapshot.val();
        console.log('✅ Found UID:', this.uid);

        // Get user data
        const user = await multiGameQueries.getUserByUid(this.uid);

        if (!user) {
            throw new Error('No user data found for: ' + this.username);
        }

        // Get game stats
        this.gameStats = await multiGameQueries.getGameStats(this.uid, this.GAME_ID);

        // CRITICAL FIX: Get balance from wallets/ path (which has 110)
        // NOT from users/uid/wallet (which has 10)
        const walletRef = ref(db, `wallets/${this.uid}/balance`);
        const walletSnapshot = await get(walletRef);
        const correctBalance = walletSnapshot.exists() ? walletSnapshot.val() : user.wallet.balance;

        // Get leaderboard
        this.leaderboard = await multiGameQueries.getGameLeaderboard(this.GAME_ID, 10);

        // Get player rank
        const rankInfo = await multiGameQueries.getUserGameRank(this.uid, this.GAME_ID);
        this.playerRank = rankInfo.rank;

        // Transform to user data format with CORRECT balance
        this.userData = {
            uid: this.uid,
            username: user.public.username,
            displayName: user.public.displayName,
            balance: correctBalance,  // This will now be 110, not 10
            highScore: this.gameStats?.highScore || 0,
            totalGames: this.gameStats?.totalGames || 0,
            totalWins: this.gameStats?.totalWins || 0,
            winStreak: this.gameStats?.winStreak || 0,
            level: this.gameStats?.level || 1,
            rank: this.gameStats?.rank || 'Rookie',
            avatar: user.public.avatar
        };

        console.log('✅ User data fetched with correct balance:', this.userData);

    } catch (error) {
        console.error('❌ Error in fetchAllUserData:', error);
        throw error;
    }
}
    private buildFullUI() {
        if (!this.userData) return;

        this.addTitle();
        this.addBall();
        this.createBalanceDisplay();
        this.createHighScoreDisplay();
        this.createRankDisplay();
        this.createWelcomeMessage();
        this.createMenuButtons();
        this.addFooter();
        this.setupInputHandlers();
        this.debugShowData();
    }

    private addBackground() {
        if (this.textures.exists('ball-background')) {
            const bg = this.add.image(180, 320, 'ball-background');
            bg.setDisplaySize(360, 640);
        } else {
            this.cameras.main.setBackgroundColor('#1a3a1a');
        }
    }

    private addTitle() {
        this.add.text(180, 70, 'BALL CRUSH', {
            fontSize: '32px',
            color: '#ffaa00',
            fontStyle: 'bold',
            stroke: '#8b4513',
            strokeThickness: 4
        }).setOrigin(0.5);
    }

    private addBall() {
        if (!this.textures.exists('ball')) return;

        this.ballSprite = this.add.sprite(180, 150, 'ball');
        this.ballSprite.setScale(0.3);

        // Add a bouncing animation
        this.tweens.add({
            targets: this.ballSprite,
            y: 140,
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // Add a slight rotation animation
        this.tweens.add({
            targets: this.ballSprite,
            angle: 10,
            duration: 600,
            yoyo: true,
            repeat: -1
        });
    }

    private createWelcomeMessage() {
        this.add.text(180, 200, `Welcome, ${this.userData!.displayName}!`, {
            fontSize: '16px',
            color: '#ffff00',
            stroke: '#000000',
            strokeThickness: 2
        }).setOrigin(0.5);

        this.add.text(180, 220, `${this.userData!.rank} • Level ${this.userData!.level}`, {
            fontSize: '14px',
            color: '#ffaa00'
        }).setOrigin(0.5);

        this.add.text(180, 240, `Wins: ${this.userData!.totalWins} | Streak: ${this.userData!.winStreak}`, {
            fontSize: '12px',
            color: '#ffffff'
        }).setOrigin(0.5);
    }

    private createBalanceDisplay() {
        // Balance box (top left)
        const bg = this.add.graphics();
        bg.fillStyle(0x000000, 0.7);
        bg.fillRoundedRect(5, 5, 110, 40, 8);
        bg.lineStyle(1, 0xffaa00);
        bg.strokeRoundedRect(5, 5, 110, 40, 8);

        this.add.text(10, 8, '💰', { fontSize: '20px' });
        this.add.text(35, 8, 'Coins:', { fontSize: '10px', color: '#ffffff' });

        this.balanceText = this.add.text(35, 23, `${this.userData!.balance.toFixed(0)}`, {
            fontSize: '14px',
            color: '#00ff00',
            fontStyle: 'bold'
        });
    }

    private createHighScoreDisplay() {
        if (!this.userData) return;

        console.log('📊 Displaying high score:', this.userData.highScore);

        // High score box (top right)
        const bg = this.add.graphics();
        bg.fillStyle(0x000000, 0.7);
        bg.fillRoundedRect(245, 5, 110, 40, 8);
        bg.lineStyle(1, 0xffaa00);
        bg.strokeRoundedRect(245, 5, 110, 40, 8);

        this.add.text(250, 8, '🏆', { fontSize: '20px' });
        this.add.text(275, 8, 'Best:', { fontSize: '12px', color: '#ffffff' });

        const highScore = this.userData.highScore || 0;

        this.highScoreText = this.add.text(275, 23, highScore.toString(), {
            fontSize: '14px',
            color: '#ffaa00',
            fontStyle: 'bold'
        });
    }

    private createRankDisplay() {
        // Rank box (top middle)
        const bg = this.add.graphics();
        bg.fillStyle(0x000000, 0.7);
        bg.fillRoundedRect(125, 5, 110, 40, 8);
        bg.lineStyle(1, 0xffaa00);
        bg.strokeRoundedRect(125, 5, 110, 40, 8);

        this.add.text(130, 8, '📊', { fontSize: '20px' });
        this.add.text(160, 8, 'Rank:', { fontSize: '12px', color: '#ffffff' });

        this.rankText = this.add.text(175, 23, `#${this.playerRank}`, {
            fontSize: '14px',
            color: '#ffaa00',
            fontStyle: 'bold'
        });
    }

    private createMenuButtons() {
        const buttonWidth = 160;
        const buttonHeight = 45;
        const startX = 180;
        const startY = 280;

        const buttons = [
            {
                text: '🎮 1v1 BATTLE',
                color: '#ff4444',
                scene: 'BallCrushGameScene'
            },
            { text: '🏆 LEADERBOARD', color: '#2196F3', scene: 'BallCrushLeaderboardScene' },
            { text: '👤 PLAYER PROFILE', color: '#9C27B0', scene: 'BallCrushProfileScene' },
            { text: '📊 SCORE HISTORY', color: '#FF9800', scene: 'BallCrushScoresScene' },
            { text: '🛒 POWER-UPS', color: '#E91E63', scene: 'BallCrushStoreScene' }
        ];

        buttons.forEach((btn, index) => {
            const yPos = startY + (index * 55);

            const bg = this.add.graphics();
            bg.fillStyle(Phaser.Display.Color.HexStringToColor(btn.color).color, 1);
            bg.fillRoundedRect(startX - buttonWidth / 2, yPos - buttonHeight / 2, buttonWidth, buttonHeight, 12);
            bg.lineStyle(2, 0xffaa00, 1);
            bg.strokeRoundedRect(startX - buttonWidth / 2, yPos - buttonHeight / 2, buttonWidth, buttonHeight, 12);

            const button = this.add.text(startX, yPos, btn.text, {
                fontSize: '16px',
                color: '#ffffff',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 2
            })
                .setOrigin(0.5)
                .setInteractive({ useHandCursor: true });

            button.on('pointerover', () => {
                button.setStyle({ color: '#ffaa00' });
                button.setScale(1.05);

                bg.clear();
                bg.fillStyle(Phaser.Display.Color.HexStringToColor(btn.color).color, 1);
                bg.fillRoundedRect(startX - buttonWidth / 2, yPos - buttonHeight / 2, buttonWidth, buttonHeight, 12);
                bg.lineStyle(3, 0xffffff, 2);
                bg.strokeRoundedRect(startX - buttonWidth / 2, yPos - buttonHeight / 2, buttonWidth, buttonHeight, 12);
            });

            button.on('pointerout', () => {
                button.setStyle({ color: '#ffffff' });
                button.setScale(1);

                bg.clear();
                bg.fillStyle(Phaser.Display.Color.HexStringToColor(btn.color).color, 1);
                bg.fillRoundedRect(startX - buttonWidth / 2, yPos - buttonHeight / 2, buttonWidth, buttonHeight, 12);
                bg.lineStyle(2, 0xffaa00, 1);
                bg.strokeRoundedRect(startX - buttonWidth / 2, yPos - buttonHeight / 2, buttonWidth, buttonHeight, 12);
            });

            if (btn.text === '🎮 1v1 BATTLE') {
                button.on('pointerdown', async () => {
                    if (this.userData!.balance < 1) {
                        this.showInsufficientFunds();
                        return;
                    }

                    const success = await this.deductGameFee();

                    if (success) {
                        this.userData!.balance -= 1;
                        this.balanceText.setText(`${this.userData!.balance.toFixed(0)}`);

                        this.tweens.add({
                            targets: this.balanceText,
                            scale: 1.3,
                            color: '#ff0000',
                            duration: 200,
                            yoyo: true,
                            onComplete: () => {
                                this.scene.start('BallCrushGameScene', {
                                    username: this.username,
                                    uid: this.uid,
                                    userData: this.userData
                                });
                            }
                        });
                    } else {
                        this.showError('Failed to process payment');
                    }
                });
            } else {
                button.on('pointerdown', () => {
                    this.scene.start(btn.scene, {
                        username: this.username,
                        uid: this.uid,
                        userData: this.userData
                    });
                });
            }

            this.menuButtons.push(button);
        });
    }

    private async deductGameFee(): Promise<boolean> {
        try {
            console.log('💰 Deducting 1 coin game fee for:', this.userData!.username);

            const success = await multiGameQueries.updateWalletBalance(
                this.uid,
                -1,
                'loss',
                'Ball Crush match fee'
            );

            if (success) {
                console.log('✅ Game fee deducted successfully');
            } else {
                console.log('❌ Failed to deduct game fee');
            }

            return success;

        } catch (error) {
            console.error('❌ Error deducting game fee:', error);
            return false;
        }
    }

    private showInsufficientFunds() {
        const popup = this.add.graphics();
        popup.fillStyle(0x000000, 0.9);
        popup.fillRoundedRect(40, 200, 280, 150, 10);
        popup.lineStyle(2, 0xff0000, 1);
        popup.strokeRoundedRect(40, 200, 280, 150, 10);

        this.add.text(180, 230, '⚠️', {
            fontSize: '40px',
            color: '#ff0000'
        }).setOrigin(0.5);

        this.add.text(180, 280, 'Insufficient Coins!', {
            fontSize: '18px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.add.text(180, 310, 'Need 1 coin to play', {
            fontSize: '14px',
            color: '#ffff00'
        }).setOrigin(0.5);

        const closeBtn = this.add.text(180, 340, 'OK', {
            fontSize: '16px',
            color: '#ffffff',
            backgroundColor: '#4CAF50',
            padding: { x: 20, y: 5 }
        })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });

        closeBtn.on('pointerdown', () => {
            popup.destroy();
            closeBtn.destroy();
        });

        this.time.delayedCall(2000, () => {
            popup.destroy();
            closeBtn.destroy();
        });
    }

    private addFooter() {
        this.add.text(340, 620, 'v1.0.0', {
            fontSize: '10px',
            color: '#666666'
        }).setOrigin(1, 0);
    }

    private setupInputHandlers() {
        if (this.input.keyboard) {
            this.input.keyboard.on('keydown-ENTER', () => {
                if (this.userData && this.userData.balance >= 1) {
                    this.scene.start('BallCrushMatchmakingScene', {
                        username: this.username,
                        uid: this.uid,
                        userData: this.userData
                    });
                }
            });
            this.input.keyboard.on('keydown-SPACE', () => {
                if (this.userData && this.userData.balance >= 1) {
                    this.scene.start('BallCrushMatchmakingScene', {
                        username: this.username,
                        uid: this.uid,
                        userData: this.userData
                    });
                }
            });
        }
    }
}