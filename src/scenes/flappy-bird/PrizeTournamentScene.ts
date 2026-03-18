// src/scenes/flappy-bird/PrizeTournamentScene.ts
import Phaser from 'phaser';
import {
    getCurrentTournamentStatus,
    getTournamentHistory,
    TournamentPeriod
} from '../../firebase/flappyBirdTournament';

export class PrizeTournamentScene extends Phaser.Scene {
    private username: string = '';
    private uid: string = '';
    private tournamentStatus: any = null;
    private tournamentHistory: TournamentPeriod[] = [];
    private loadingText!: Phaser.GameObjects.Text;
    private timerText!: Phaser.GameObjects.Text;
    private poolText!: Phaser.GameObjects.Text;
    private playersText!: Phaser.GameObjects.Text;
    private timerInterval!: any;
    private currentView: 'current' | 'history' = 'current';
    private viewButton!: Phaser.GameObjects.Text;

    constructor() {
        super({ key: 'PrizeTournamentScene' });
    }

    init(data: { username?: string; uid?: string }) {
        console.log('🏆 PrizeTournamentScene initialized');
        this.username = data?.username || '';
        this.uid = data?.uid || '';
    }

    async create() {
        // Background
        this.cameras.main.setBackgroundColor('#2a1a3a');

        // Title
        this.add.text(180, 30, '🏆 PRIZE TOURNAMENT', {
            fontSize: '22px',
            color: '#ffd700',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);

        // Subtitle - every 4 hours
        this.add.text(180, 55, 'Every 4 hours • Top player wins 40% of pool', {
            fontSize: '12px',
            color: '#ffffff'
        }).setOrigin(0.5);

        // Loading
        this.loadingText = this.add.text(180, 300, 'LOADING TOURNAMENT DATA...', {
            fontSize: '18px',
            color: '#ffff00'
        }).setOrigin(0.5);

        // Fetch tournament data
        await this.loadTournamentData();

        this.loadingText.destroy();

        // Create UI
        this.createTournamentDisplay();
        this.createButtons();
        this.startTimer();
    }

    // In PrizeTournamentScene.ts - update the display methods
    private async loadTournamentData() {
        try {
            this.tournamentStatus = await getCurrentTournamentStatus();
            this.tournamentHistory = await getTournamentHistory(5);

            console.log('✅ Tournament status:', this.tournamentStatus);
            console.log('📊 Tournament history:', this.tournamentHistory);

        } catch (error) {
            console.error('❌ Error loading tournament data:', error);
        }
    }

    private refreshDisplay() {
        // Clear everything and redraw
        this.children.removeAll();
        this.create();
    }

    private showHistory() {
        // Clear the current display
        this.children.removeAll();

        // Background
        this.cameras.main.setBackgroundColor('#2a1a3a');

        // Title
        this.add.text(180, 30, '📜 TOURNAMENT HISTORY', {
            fontSize: '22px',
            color: '#ffd700',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);

        if (this.tournamentHistory.length === 0) {
            // Empty state
            this.add.text(180, 250, '📊', {
                fontSize: '48px',
                color: '#888888'
            }).setOrigin(0.5);

            this.add.text(180, 300, 'No tournaments completed yet', {
                fontSize: '18px',
                color: '#ffffff'
            }).setOrigin(0.5);

            this.add.text(180, 330, 'Check back after 4 hours!', {
                fontSize: '14px',
                color: '#ffff00'
            }).setOrigin(0.5);
        } else {
            let yPos = 80;

            this.tournamentHistory.forEach((tournament, index) => {
                // Card background
                const cardBg = this.add.graphics();
                cardBg.fillStyle(0x4a2a6a, 0.8);
                cardBg.fillRoundedRect(20, yPos, 320, 90, 10);

                if (tournament.winner) {
                    cardBg.lineStyle(2, 0xffd700);
                } else {
                    cardBg.lineStyle(1, 0x888888);
                }
                cardBg.strokeRoundedRect(20, yPos, 320, 90, 10);

                // Date
                const date = new Date(tournament.endTime);
                const dateStr = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()} ${date.getHours()}:00`;
                this.add.text(30, yPos + 5, dateStr, {
                    fontSize: '12px',
                    color: '#cccccc'
                });

                if (tournament.winner) {
                    // Winner info
                    this.add.text(30, yPos + 25, '🏆 ' + tournament.winner.displayName, {
                        fontSize: '16px',
                        color: '#ffd700',
                        fontStyle: 'bold'
                    });

                    this.add.text(30, yPos + 45, `Score: ${tournament.winner.score}`, {
                        fontSize: '14px',
                        color: '#ffffff'
                    });

                    this.add.text(200, yPos + 45, `Prize: $${tournament.winner.prize}`, {
                        fontSize: '16px',
                        color: '#00ff00',
                        fontStyle: 'bold'
                    });

                    this.add.text(280, yPos + 5, `${tournament.players ? Object.keys(tournament.players).length : 0} players`, {
                        fontSize: '10px',
                        color: '#888888'
                    });

                    this.add.text(280, yPos + 20, `Pool: $${tournament.totalPool}`, {
                        fontSize: '10px',
                        color: '#888888'
                    });
                } else {
                    // No winner (no players)
                    this.add.text(30, yPos + 35, 'No players this period', {
                        fontSize: '16px',
                        color: '#888888',
                        fontStyle: 'italic'
                    });
                }

                yPos += 100;

                if (yPos > 550) {
                    this.add.text(180, 570, `... and ${this.tournamentHistory.length - index - 1} more`, {
                        fontSize: '12px',
                        color: '#888888'
                    }).setOrigin(0.5);

                }
            });
        }

        // Back to current view button
        const backBtn = this.add.text(180, 590, '👁️ VIEW CURRENT TOURNAMENT', {
            fontSize: '16px',
            color: '#ffffff',
            backgroundColor: '#4a6a9a',
            padding: { x: 15, y: 8 }
        })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });

        backBtn.on('pointerdown', () => {
            this.currentView = 'current';
            this.refreshDisplay();
        });

        // Regular back button
        const menuBtn = this.add.text(50, 590, '← MENU', {
            fontSize: '16px',
            color: '#ffffff',
            backgroundColor: '#4CAF50',
            padding: { x: 12, y: 6 }
        })
            .setInteractive({ useHandCursor: true });

        menuBtn.on('pointerdown', () => {
            this.scene.start('FlappyBirdStartScene', {
                username: this.username,
                uid: this.uid
            });
        });
    }

    private createTournamentDisplay() {
        // Tournament info card
        const cardBg = this.add.graphics();
        cardBg.fillStyle(0x4a2a6a, 0.8);
        cardBg.fillRoundedRect(20, 70, 320, 140, 10);
        cardBg.lineStyle(2, 0xffd700);
        cardBg.strokeRoundedRect(20, 70, 320, 140, 10);

        // Timer
        this.add.text(180, 85, 'TIME REMAINING', {
            fontSize: '14px',
            color: '#aaaaaa'
        }).setOrigin(0.5);

        this.timerText = this.add.text(180, 110, this.formatTime(this.tournamentStatus.timeRemaining), {
            fontSize: '28px',
            color: '#ffff00',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Pool and players
        this.poolText = this.add.text(90, 150, `💰 $${this.tournamentStatus.totalPool}`, {
            fontSize: '18px',
            color: '#00ff00',
            fontStyle: 'bold'
        });

        this.playersText = this.add.text(250, 150, `👥 ${this.tournamentStatus.players}`, {
            fontSize: '18px',
            color: '#ffffff',
            fontStyle: 'bold'
        });

        // Prize pool info
        const potentialPrize = Math.round(this.tournamentStatus.totalPool * 0.4 * 100) / 100;
        this.add.text(180, 185, `Winner takes 40% = $${potentialPrize}`, {
            fontSize: '14px',
            color: '#ffd700'
        }).setOrigin(0.5);

        // Current leaders section
        this.add.text(180, 220, '🏅 CURRENT LEADERS', {
            fontSize: '16px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Leaders background
        const leadersBg = this.add.graphics();
        leadersBg.fillStyle(0x333333, 0.5);
        leadersBg.fillRoundedRect(20, 230, 320, 120, 10);

        if (this.tournamentStatus.topPlayers.length === 0) {
            this.add.text(180, 290, 'No games played yet this period', {
                fontSize: '14px',
                color: '#888888'
            }).setOrigin(0.5);
        } else {
            let yPos = 245;
            this.tournamentStatus.topPlayers.forEach((player: any, index: number) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
                const color = index === 0 ? '#ffd700' : index === 1 ? '#c0c0c0' : '#cd7f32';

                this.add.text(40, yPos, `${medal} ${player.displayName}`, {
                    fontSize: '14px',
                    color: '#ffffff'
                });

                this.add.text(280, yPos, player.score.toString(), {
                    fontSize: '16px',
                    color: color,
                    fontStyle: 'bold'
                });

                yPos += 25;
            });
        }

        // View toggle button
        this.viewButton = this.add.text(180, 360, '📜 VIEW HISTORY', {
            fontSize: '16px',
            color: '#ffffff',
            backgroundColor: '#4a6a9a',
            padding: { x: 15, y: 8 }
        })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });

        this.viewButton.on('pointerdown', () => {
            this.currentView = 'history';
            this.showHistory();
        });


    }

    private createButtons() {
        // Back button
        const backBtn = this.add.text(50, 600, '← BACK', {
            fontSize: '16px',
            color: '#ffffff',
            backgroundColor: '#4CAF50',
            padding: { x: 12, y: 6 }
        })
            .setInteractive({ useHandCursor: true });

        backBtn.on('pointerdown', () => {
            this.scene.start('FlappyBirdStartScene', {
                username: this.username,
                uid: this.uid
            });
        });

        // Refresh button
        const refreshBtn = this.add.text(180, 600, '🔄 REFRESH', {
            fontSize: '16px',
            color: '#ffffff',
            backgroundColor: '#2196F3',
            padding: { x: 12, y: 6 }
        })
            .setInteractive({ useHandCursor: true });

        refreshBtn.on('pointerdown', async () => {
            refreshBtn.setText('⏳ LOADING...');
            refreshBtn.disableInteractive();

            await this.loadTournamentData();
            this.refreshDisplay();

            refreshBtn.setText('🔄 REFRESH');
            refreshBtn.setInteractive(true);
        });

        // Info button
        const infoBtn = this.add.text(310, 600, 'ℹ️', {
            fontSize: '24px',
            color: '#ffffff',
            backgroundColor: '#9C27B0',
            padding: { x: 12, y: 4 }
        })
            .setInteractive({ useHandCursor: true });

        infoBtn.on('pointerdown', () => {
            this.showInfoPopup();
        });
    }

    private refreshDisplay() {
        if (this.currentView === 'current') {
            this.createTournamentDisplay();
        } else {
            this.showHistory();
        }
    }

    private showHistory() {
        // Clear previous display (simplified - in real app you'd properly remove old elements)
        this.scene.restart({ username: this.username, uid: this.uid });
        // Then show history view
    }

    private showInfoPopup() {
        const popup = this.add.graphics();
        popup.fillStyle(0x000000, 0.95);
        popup.fillRoundedRect(30, 150, 300, 250, 15);
        popup.lineStyle(2, 0xffd700);
        popup.strokeRoundedRect(30, 150, 300, 250, 15);

        this.add.text(180, 180, '🏆 HOW IT WORKS', {
            fontSize: '18px',
            color: '#ffd700',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        const rules = [
            '• Tournament resets every 4 hours',
            '• Every game adds $1 to prize pool',
            '• Top player wins 40% of pool',
            '• Rest 60% goes to platform',
            '• Win automatically credited to wallet',
            '',
            '⏰ Periods:',
            '00:00 - 04:00',
            '04:00 - 08:00',
            '08:00 - 12:00',
            '12:00 - 16:00',
            '16:00 - 20:00',
            '20:00 - 00:00'
        ];

        let yPos = 220;
        rules.forEach(rule => {
            this.add.text(180, yPos, rule, {
                fontSize: '12px',
                color: '#ffffff'
            }).setOrigin(0.5);
            yPos += 18;
        });

        const closeBtn = this.add.text(180, 380, 'GOT IT', {
            fontSize: '16px',
            color: '#ffffff',
            backgroundColor: '#4CAF50',
            padding: { x: 20, y: 8 }
        })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });

        closeBtn.on('pointerdown', () => {
            popup.destroy();
            closeBtn.destroy();
        });
    }

    private formatTime(ms: number): string {
        if (ms <= 0) return '00:00:00';

        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);

        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    // In PrizeTournamentScene.ts, update the startTimer method:

    private startTimer() {
        // Clear any existing timer first
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        this.timerInterval = setInterval(() => {
            // Check if the scene is still active and timerText exists
            if (!this.scene.isActive() || !this.timerText || !this.timerText.active) {
                this.shutdown();
                return;
            }

            if (this.tournamentStatus.timeRemaining > 0) {
                this.tournamentStatus.timeRemaining -= 1000;
                this.timerText.setText(this.formatTime(this.tournamentStatus.timeRemaining));

                // Refresh every minute to update pool/players
                if (this.tournamentStatus.timeRemaining % 60000 === 0) {
                    this.loadTournamentData();
                }
            } else {
                // Tournament just ended
                this.loadTournamentData();
            }
        }, 1000);
    }

    // Update the shutdown method:
    shutdown() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }
}