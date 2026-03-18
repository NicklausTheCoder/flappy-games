// src/scenes/checkers/CheckersLeaderboardScene.ts
import Phaser from 'phaser';
import { getCheckersLeaderboard, CheckersLeaderboardEntry } from '../../firebase/checkersService';

export class CheckersLeaderboardScene extends Phaser.Scene {
    private leaderboard: CheckersLeaderboardEntry[] = [];
    private loadingText!: Phaser.GameObjects.Text;
    private backButton!: Phaser.GameObjects.Text;
    private refreshButton!: Phaser.GameObjects.Text;
    private errorText!: Phaser.GameObjects.Text;
    private username: string = '';
    private uid: string = '';

    constructor() {
        super({ key: 'CheckersLeaderboardScene' });
    }

    init(data: { username?: string; uid?: string }) {
        console.log('🏆 CheckersLeaderboardScene initialized');
        this.username = data?.username || '';
        this.uid = data?.uid || '';

        console.log('Received username:', this.username);
        console.log('Received uid:', this.uid);
    }

    async create() {
        // Background
        this.cameras.main.setBackgroundColor('#1a1a2e');

        // Title
        this.add.text(180, 30, '🏆 CHECKERS LEADERBOARD', {
            fontSize: '20px',
            color: '#ffd700',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);

        // Subtitle - sorted by wins
        this.add.text(180, 55, 'Ranked by Total Wins', {
            fontSize: '12px',
            color: '#cccccc'
        }).setOrigin(0.5);

        // Loading
        this.loadingText = this.add.text(180, 300, 'LOADING LEADERBOARD...', {
            fontSize: '18px',
            color: '#ffff00'
        }).setOrigin(0.5);

        // Fetch leaderboard
        await this.loadLeaderboard();

        // Create buttons
        this.createBackButton();
        this.createRefreshButton();
    }

    private async loadLeaderboard() {
        try {
            console.log('📡 Fetching Checkers leaderboard...');
            this.leaderboard = await getCheckersLeaderboard(15);

            console.log('✅ Leaderboard data:', this.leaderboard);

            this.loadingText.destroy();

            if (this.leaderboard.length === 0) {
                this.showEmptyState();
            } else {
                this.displayLeaderboard();
            }

        } catch (error) {
            console.error('❌ Error:', error);
            this.showError('Failed to load leaderboard');
        }
    }

    private displayLeaderboard() {
        let yPos = 80;

        // Headers
        this.add.text(30, yPos, 'RANK', {
            fontSize: '14px',
            color: '#ffd700',
            fontStyle: 'bold'
        });

        this.add.text(90, yPos, 'PLAYER', {
            fontSize: '14px',
            color: '#ffd700',
            fontStyle: 'bold'
        });

        this.add.text(210, yPos, 'WINS', {
            fontSize: '14px',
            color: '#ffd700',
            fontStyle: 'bold'
        });

        this.add.text(260, yPos, 'CAPT', {
            fontSize: '14px',
            color: '#ffd700',
            fontStyle: 'bold'
        });

        this.add.text(310, yPos, 'WIN%', {
            fontSize: '14px',
            color: '#ffd700',
            fontStyle: 'bold'
        });

        yPos += 25;

        // Leaderboard entries
        this.leaderboard.forEach((entry, index) => {
            const rank = index + 1;

            // Medal or rank number
            let rankDisplay: string;
            let rankColor: string;

            if (rank === 1) {
                rankDisplay = '🥇';
                rankColor = '#ffd700';
            } else if (rank === 2) {
                rankDisplay = '🥈';
                rankColor = '#c0c0c0';
            } else if (rank === 3) {
                rankDisplay = '🥉';
                rankColor = '#cd7f32';
            } else {
                rankDisplay = `${rank}.`;
                rankColor = '#ffffff';
            }

            // Row background (alternating)
            if (index % 2 === 0) {
                const bg = this.add.graphics();
                bg.fillStyle(0x333333, 0.3);
                bg.fillRect(15, yPos - 12, 330, 25);
            }

            // Rank
            this.add.text(30, yPos, rankDisplay, {
                fontSize: '16px',
                color: rankColor,
                fontStyle: rank <= 3 ? 'bold' : 'normal'
            });

            // Player name (truncate if too long)
            let displayName = entry.displayName || entry.username;
            if (displayName.length > 10) {
                displayName = displayName.substring(0, 8) + '...';
            }

            this.add.text(90, yPos, displayName, {
                fontSize: '14px',
                color: '#ffffff'
            });

            // Wins
            this.add.text(215, yPos, entry.gamesWon.toString(), {
                fontSize: '16px',
                color: '#00ff00',
                fontStyle: 'bold'
            });

            // Pieces Captured
            this.add.text(260, yPos, entry.piecesCaptured.toString(), {
                fontSize: '14px',
                color: '#ffff00'
            });

            // Win Rate
            const winRateColor = entry.winRate >= 70 ? '#00ff00' :
                entry.winRate >= 50 ? '#ffff00' : '#ff6666';
            this.add.text(310, yPos, `${entry.winRate}%`, {
                fontSize: '14px',
                color: winRateColor,
                fontStyle: 'bold'
            });

            yPos += 28;

            // Stop if we run out of space
            if (yPos > 550) {
                this.add.text(180, 570, `... and ${this.leaderboard.length - index - 1} more`, {
                    fontSize: '12px',
                    color: '#888888'
                }).setOrigin(0.5);
                return;
            }
        });

        // Show total players
        this.add.text(180, 590, `Total Players: ${this.leaderboard.length}`, {
            fontSize: '12px',
            color: '#666666'
        }).setOrigin(0.5);
    }

    private showEmptyState() {
        this.add.text(180, 250, '📊', {
            fontSize: '48px',
            color: '#888888'
        }).setOrigin(0.5);

        this.add.text(180, 300, 'No Checkers players yet', {
            fontSize: '18px',
            color: '#ffffff'
        }).setOrigin(0.5);

        this.add.text(180, 330, 'Play a game to be the first!', {
            fontSize: '14px',
            color: '#ffff00'
        }).setOrigin(0.5);
    }



    // In CheckersLeaderboardScene.ts, update the createBackButton method:

// In CheckersLeaderboardScene.ts, update the back button:

private createBackButton() {
    this.backButton = this.add.text(50, 600, '← BACK', {
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: '#4CAF50',
        padding: { x: 12, y: 6 }
    })
    .setInteractive({ useHandCursor: true });
    
    this.backButton.on('pointerover', () => {
        this.backButton.setStyle({ color: '#ffff00', backgroundColor: '#45a049' });
    });
    
    this.backButton.on('pointerout', () => {
        this.backButton.setStyle({ color: '#ffffff', backgroundColor: '#4CAF50' });
    });

    console.log('username in leaderboard:', this.username);
    console.log('uid in leaderboard:', this.uid);
    
    this.backButton.on('pointerdown', () => {
        // IMPORTANT: Pass BOTH username and uid
        this.scene.start('CheckersStartScene', { 
            username: this.username,
            uid: this.uid 
        });
    });
}

// Update refresh button too:
private createRefreshButton() {
    this.refreshButton = this.add.text(180, 600, '🔄 REFRESH', {
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: '#2196F3',
        padding: { x: 12, y: 6 }
    })
    .setInteractive({ useHandCursor: true });
    
    this.refreshButton.on('pointerover', () => {
        this.refreshButton.setStyle({ color: '#ffff00', backgroundColor: '#1976D2' });
    });
    
    this.refreshButton.on('pointerout', () => {
        this.refreshButton.setStyle({ color: '#ffffff', backgroundColor: '#2196F3' });
    });
    
    this.refreshButton.on('pointerdown', async () => {
        this.refreshButton.setText('⏳ LOADING...');
        this.refreshButton.disableInteractive();
        
        await this.loadLeaderboard();
        
        // Pass username and uid when restarting
        this.scene.restart({ username: this.username, uid: this.uid });
    });
}

// Update error retry:
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
    
    // Pass username and uid on retry
    this.input.once('pointerdown', () => {
        this.scene.restart({ username: this.username, uid: this.uid });
    });
}
}