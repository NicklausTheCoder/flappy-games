// src/scenes/checkers/CheckersStatsScene.ts
import Phaser from 'phaser';
import { getCheckersUserData, CheckersUserData } from '../../firebase/checkersService';

export class CheckersStatsScene extends Phaser.Scene {
    private username: string = '';
    private uid: string = '';
    private userData: CheckersUserData | null = null;
    private loadingText!: Phaser.GameObjects.Text;
    private errorText!: Phaser.GameObjects.Text;

    constructor() {
        super({ key: 'CheckersStatsScene' });
    }

    init(data: { username?: string; uid?: string }) {
        console.log('♟️ CheckersStatsScene initialized');
        this.username = data?.username || '';
        this.uid = data?.uid || '';

        if (!this.uid) {
            console.error('❌ No UID provided to CheckersStatsScene');
        }
    }

    async create() {
        // Background
        this.cameras.main.setBackgroundColor('#1a1a2e');

        // Title
        this.add.text(180, 30, '♟️ CHECKERS STATS', {
            fontSize: '24px',
            color: '#ffd700',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);

        // Player name
        this.add.text(180, 60, `Player: ${this.username}`, {
            fontSize: '14px',
            color: '#cccccc'
        }).setOrigin(0.5);

        // Loading
        this.loadingText = this.add.text(180, 300, 'LOADING STATS...', {
            fontSize: '18px',
            color: '#ffff00'
        }).setOrigin(0.5);

        // Fetch user data
        await this.loadUserData();

        this.loadingText.destroy();

        if (!this.userData) {
            this.showError('Failed to load stats');
        } else {
            this.displayStats();
        }

        this.createBackButton();
        this.createRefreshButton();
    }

    private async loadUserData() {
        try {
            if (!this.uid) {
                console.error('❌ Cannot load stats: No UID');
                return;
            }

            console.log('📡 Fetching Checkers stats for UID:', this.uid);
            this.userData = await getCheckersUserData(this.uid);

            if (this.userData) {
                console.log('✅ Stats loaded:', this.userData);
            } else {
                console.log('⚠️ No stats found for user');
            }

        } catch (error) {
            console.error('❌ Error loading stats:', error);
        }
    }

    // In CheckersStatsScene.ts, update the displayStats method:

    private displayStats() {
        if (!this.userData) return;

        // Calculate win rate
        const winRate = this.userData.gamesPlayed > 0
            ? Math.round((this.userData.gamesWon / this.userData.gamesPlayed) * 100)
            : 0;

        // Get Checkers-specific winnings
        const checkersWinnings = this.userData.winnings?.checkers?.total || 0;
        const winsCount = this.userData.winnings?.checkers?.count || 0;

        // Rank and Level Card
        this.createStatCard(30, 90, 150, 80, 'RANK', this.userData.rank || 'Bronze', '#ffd700');
        this.createStatCard(180, 90, 150, 80, 'LEVEL', `Level ${this.userData.level || 1}`, '#4CAF50');

        // Games Stats Card
        this.createStatCard(30, 180, 300, 100, 'GAMES', '', '#333333', true);

        this.add.text(60, 205, 'Played:', { fontSize: '14px', color: '#cccccc' });
        this.add.text(160, 205, this.userData.gamesPlayed.toString(), {
            fontSize: '20px',
            color: '#ffffff',
            fontStyle: 'bold'
        });

        this.add.text(60, 235, 'Won:', { fontSize: '14px', color: '#cccccc' });
        this.add.text(160, 235, this.userData.gamesWon.toString(), {
            fontSize: '20px',
            color: '#00ff00',
            fontStyle: 'bold'
        });

        this.add.text(210, 235, 'Lost:', { fontSize: '14px', color: '#cccccc' });
        this.add.text(270, 235, this.userData.gamesLost.toString(), {
            fontSize: '20px',
            color: '#ff6666',
            fontStyle: 'bold'
        });

        // Performance Card
        this.createStatCard(30, 290, 300, 100, 'PERFORMANCE', '', '#333333', true);

        this.add.text(60, 315, 'Win Rate:', { fontSize: '14px', color: '#cccccc' });

        const winRateColor = winRate >= 70 ? '#00ff00' :
            winRate >= 50 ? '#ffff00' : '#ff6666';

        this.add.text(160, 315, `${winRate}%`, {
            fontSize: '20px',
            color: winRateColor,
            fontStyle: 'bold'
        });

        this.add.text(60, 345, 'Current Streak:', { fontSize: '14px', color: '#cccccc' });
        this.add.text(180, 345, this.userData.winStreak.toString(), {
            fontSize: '16px',
            color: this.userData.winStreak > 0 ? '#00ff00' : '#888888',
            fontStyle: 'bold'
        });

        this.add.text(60, 370, 'Best Streak:', { fontSize: '14px', color: '#cccccc' });
        this.add.text(180, 370, this.userData.bestWinStreak.toString(), {
            fontSize: '16px',
            color: '#ffd700',
            fontStyle: 'bold'
        });

        // Game Stats Card
        this.createStatCard(30, 400, 300, 100, 'GAME STATS', '', '#333333', true);

        this.add.text(60, 425, 'Pieces Captured:', { fontSize: '14px', color: '#cccccc' });
        this.add.text(200, 425, this.userData.piecesCaptured.toString(), {
            fontSize: '16px',
            color: '#ffaa00',
            fontStyle: 'bold'
        });

        this.add.text(60, 455, 'Kings Made:', { fontSize: '14px', color: '#cccccc' });
        this.add.text(200, 455, this.userData.kingsMade.toString(), {
            fontSize: '16px',
            color: '#ffff00',
            fontStyle: 'bold'
        });

        // Winnings Card - Now shows Checkers-specific winnings
        this.createStatCard(30, 510, 300, 70, 'CHECKERS WINNINGS', '', '#00ff00', true);

        this.add.text(60, 535, `Total: $${checkersWinnings.toFixed(2)}`, {
            fontSize: '18px',
            color: '#00ff00',
            fontStyle: 'bold'
        });

        this.add.text(200, 535, `Wins: ${winsCount}`, {
            fontSize: '14px',
            color: '#ffffff'
        });

        // Last win info if available
        if (this.userData.winnings?.checkers?.lastWin) {
            const lastWinDate = new Date(this.userData.winnings.checkers.lastWin).toLocaleDateString();
            this.add.text(180, 565, `Last win: ${lastWinDate}`, {
                fontSize: '10px',
                color: '#888888'
            }).setOrigin(0.5);
        }
    }
    private createStatCard(x: number, y: number, width: number, height: number,
        title: string, value: string, color: string, isMultiLine: boolean = false) {

        const bg = this.add.graphics();
        bg.fillStyle(0x16213e, 0.9);
        bg.fillRoundedRect(x, y, width, height, 8);
        bg.lineStyle(1, Phaser.Display.Color.HexStringToColor(color).color);
        bg.strokeRoundedRect(x, y, width, height, 8);

        if (!isMultiLine) {
            this.add.text(x + 10, y + 10, title, {
                fontSize: '12px',
                color: '#cccccc'
            });

            this.add.text(x + 10, y + 35, value, {
                fontSize: '18px',
                color: color,
                fontStyle: 'bold'
            });
        } else {
            this.add.text(x + 10, y + 10, title, {
                fontSize: '12px',
                color: '#cccccc'
            });
        }
    }

    private showError(message: string) {
        if (this.loadingText) {
            this.loadingText.destroy();
        }

        this.errorText = this.add.text(180, 250, '❌', {
            fontSize: '48px',
            color: '#ff0000'
        }).setOrigin(0.5);

        this.add.text(180, 300, message, {
            fontSize: '16px',
            color: '#ffffff'
        }).setOrigin(0.5);

        this.add.text(180, 350, 'Tap to retry', {
            fontSize: '14px',
            color: '#ffff00'
        }).setOrigin(0.5);

        this.input.once('pointerdown', () => {
            this.scene.restart({ username: this.username, uid: this.uid });
        });
    }

    private createBackButton() {
        const backBtn = this.add.text(50, 600, '← BACK', {
            fontSize: '16px',
            color: '#ffffff',
            backgroundColor: '#4CAF50',
            padding: { x: 12, y: 6 }
        })
            .setInteractive({ useHandCursor: true });

        backBtn.on('pointerover', () => {
            backBtn.setStyle({ color: '#ffff00', backgroundColor: '#45a049' });
        });

        backBtn.on('pointerout', () => {
            backBtn.setStyle({ color: '#ffffff', backgroundColor: '#4CAF50' });
        });

        backBtn.on('pointerdown', () => {
            this.scene.start('CheckersStartScene', {
                username: this.username,
                uid: this.uid
            });
        });
    }

    private createRefreshButton() {
        const refreshBtn = this.add.text(180, 600, '🔄 REFRESH', {
            fontSize: '16px',
            color: '#ffffff',
            backgroundColor: '#2196F3',
            padding: { x: 12, y: 6 }
        })
            .setInteractive({ useHandCursor: true });

        refreshBtn.on('pointerover', () => {
            refreshBtn.setStyle({ color: '#ffff00', backgroundColor: '#1976D2' });
        });

        refreshBtn.on('pointerout', () => {
            refreshBtn.setStyle({ color: '#ffffff', backgroundColor: '#2196F3' });
        });

        refreshBtn.on('pointerdown', async () => {
            refreshBtn.setText('⏳ LOADING...');
            refreshBtn.disableInteractive();

            await this.loadUserData();
            this.scene.restart({ username: this.username, uid: this.uid });
        });
    }
}