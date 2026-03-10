import Phaser from 'phaser';
import { CompleteUserData, ScoreEntry, getUserScores } from '../../firebase/simple';

export class FlappyBirdScoresScene extends Phaser.Scene {
  private userData!: CompleteUserData;
  private scores: ScoreEntry[] = [];
  private backButton!: Phaser.GameObjects.Text;
  private loadingText!: Phaser.GameObjects.Text;
  private errorText!: Phaser.GameObjects.Text;
  
  constructor() {
    super({ key: 'FlappyBirdScoresScene' });
  }
  
  init(data: { userData: CompleteUserData }) {
    console.log('📊 ScoresScene initialized');
    
    if (!data || !data.userData) {
      this.scene.start('FlappyBirdStartScene');
      return;
    }
    
    this.userData = data.userData;
  }
  
  async create() {
    // Background
    this.cameras.main.setBackgroundColor('#16213e');
    
    // Title
    this.add.text(180, 30, '📊 YOUR SCORES', {
      fontSize: '24px',
      color: '#ffd700',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);
    
    // Stats summary
    this.add.text(180, 70, `Best: ${this.userData.highScore}  |  Games: ${this.userData.totalGames}  |  Wins: ${this.userData.totalWins}`, {
      fontSize: '12px',
      color: '#ffffff'
    }).setOrigin(0.5);
    
    // Show loading
    this.loadingText = this.add.text(180, 300, 'LOADING SCORES...', {
      fontSize: '16px',
      color: '#ffff00'
    }).setOrigin(0.5);
    
    // Fetch real scores from database
    await this.loadScores();
    
    // Remove loading text
    this.loadingText.destroy();
    
    // Scores list background
    const listBg = this.add.graphics();
    listBg.fillStyle(0x0f3460, 0.8);
    listBg.fillRoundedRect(20, 100, 320, 400, 10);
    listBg.lineStyle(1, 0xffd700);
    listBg.strokeRoundedRect(20, 100, 320, 400, 10);
    
    // Headers
    this.add.text(40, 110, '#', { fontSize: '14px', color: '#ffd700', fontStyle: 'bold' });
    this.add.text(80, 110, 'DATE', { fontSize: '14px', color: '#ffd700', fontStyle: 'bold' });
    this.add.text(200, 110, 'SCORE', { fontSize: '14px', color: '#ffd700', fontStyle: 'bold' });
    this.add.text(280, 110, 'RESULT', { fontSize: '14px', color: '#ffd700', fontStyle: 'bold' });
    
    this.displayScores();
    this.createBackButton();
    this.createRefreshButton();
  }
  
  private async loadScores() {
    try {
      this.scores = await getUserScores(this.userData.username, 10);
      console.log('📊 Loaded scores:', this.scores);
    } catch (error) {
      console.error('❌ Error loading scores:', error);
      this.scores = [];
    }
  }
  
  private displayScores() {
    if (this.scores.length === 0) {
      this.add.text(180, 300, 'No games played yet', {
        fontSize: '16px',
        color: '#888888'
      }).setOrigin(0.5);
      
      this.add.text(180, 340, 'Play a game to see your scores!', {
        fontSize: '14px',
        color: '#ffff00'
      }).setOrigin(0.5);
      return;
    }
    
    let yPos = 140;
    
    this.scores.slice(0, 10).forEach((score, index) => {
      // Row background (alternating)
      if (index % 2 === 0) {
        const bg = this.add.graphics();
        bg.fillStyle(0x333333, 0.3);
        bg.fillRect(25, yPos - 8, 310, 25);
      }
      
      // Rank
      this.add.text(40, yPos, (index + 1).toString(), {
        fontSize: '14px',
        color: '#ffffff'
      });
      
      // Date
      this.add.text(80, yPos, score.date, {
        fontSize: '14px',
        color: '#cccccc'
      });
      
      // Score
      const isHighScore = score.score === this.userData.highScore;
      this.add.text(200, yPos, score.score.toString(), {
        fontSize: '16px',
        color: isHighScore ? '#ffd700' : '#00ff00',
        fontStyle: isHighScore ? 'bold' : 'normal'
      });
      
      // Win/Loss indicator
      this.add.text(280, yPos, score.won ? '🏆' : '💔', {
        fontSize: '16px'
      });
      
      yPos += 30;
      
      // Stop if we run out of space
      if (yPos > 470) return;
    });
    
    // Show total count if more than 10
    if (this.scores.length > 10) {
      this.add.text(180, 480, `... and ${this.scores.length - 10} more games`, {
        fontSize: '12px',
        color: '#888888'
      }).setOrigin(0.5);
    }
  }
  
  private createBackButton() {
    this.backButton = this.add.text(50, 550, '← BACK', {
      fontSize: '18px',
      color: '#ffffff',
      backgroundColor: '#4CAF50',
      padding: { x: 15, y: 8 }
    })
    .setInteractive({ useHandCursor: true });
    
    this.backButton.on('pointerover', () => {
      this.backButton.setStyle({ color: '#ffff00', backgroundColor: '#45a049' });
    });
    
    this.backButton.on('pointerout', () => {
      this.backButton.setStyle({ color: '#ffffff', backgroundColor: '#4CAF50' });
    });
    
    this.backButton.on('pointerdown', () => {
      this.scene.start('FlappyBirdStartScene', { userData: this.userData });
    });
  }
  
  private createRefreshButton() {
    const refreshBtn = this.add.text(180, 550, '🔄 REFRESH', {
      fontSize: '18px',
      color: '#ffffff',
      backgroundColor: '#2196F3',
      padding: { x: 15, y: 8 }
    })
    .setInteractive({ useHandCursor: true });
    
    refreshBtn.on('pointerover', () => {
      refreshBtn.setStyle({ color: '#ffff00', backgroundColor: '#1976D2' });
    });
    
    refreshBtn.on('pointerout', () => {
      refreshBtn.setStyle({ color: '#ffffff', backgroundColor: '#2196F3' });
    });
    
    refreshBtn.on('pointerdown', async () => {
      // Show loading
      refreshBtn.setText('⏳ LOADING...');
      
      // Reload scores
      await this.loadScores();
      
      // Refresh the scene
      this.scene.restart({ userData: this.userData });
    });
  }
}