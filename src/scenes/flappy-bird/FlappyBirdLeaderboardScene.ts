import Phaser from 'phaser';
import { getLeaderboard, LeaderboardEntry } from '../../firebase/simple';

export class FlappyBirdLeaderboardScene extends Phaser.Scene {
  private leaderboard: LeaderboardEntry[] = [];
  private loadingText!: Phaser.GameObjects.Text;
  private backButton!: Phaser.GameObjects.Text;
  private refreshButton!: Phaser.GameObjects.Text;
  private errorText!: Phaser.GameObjects.Text;
  
  constructor() {
    super({ key: 'FlappyBirdLeaderboardScene' });
  }
  
  init() {
    console.log('🏆 LeaderboardScene initialized');
  }
  
  async create() {
    // Background
    this.cameras.main.setBackgroundColor('#1a1a2e');
    
    // Title
    this.add.text(180, 30, '🏆 TOP PLAYERS', {
      fontSize: '24px',
      color: '#ffd700',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3
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
      console.log('📡 Fetching leaderboard...');
      this.leaderboard = await getLeaderboard(15);
      
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
    let yPos = 70;
    
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
    
    this.add.text(250, yPos, 'SCORE', { 
      fontSize: '14px', 
      color: '#ffd700', 
      fontStyle: 'bold' 
    });
    
    this.add.text(310, yPos, 'LVL', { 
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
      let displayName = entry.displayName;
      if (displayName.length > 10) {
        displayName = displayName.substring(0, 8) + '...';
      }
      
      this.add.text(90, yPos, displayName, { 
        fontSize: '14px', 
        color: '#ffffff' 
      });
      
      // Score
      this.add.text(250, yPos, entry.highScore.toString(), { 
        fontSize: '16px', 
        color: '#00ff00',
        fontStyle: 'bold'
      });
      
      // Level
      this.add.text(315, yPos, entry.level.toString(), { 
        fontSize: '14px', 
        color: '#888888' 
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
    
    this.add.text(180, 300, 'No players yet', {
      fontSize: '18px',
      color: '#ffffff'
    }).setOrigin(0.5);
    
    this.add.text(180, 330, 'Be the first to play!', {
      fontSize: '14px',
      color: '#ffff00'
    }).setOrigin(0.5);
  }
  
  private showError(message: string) {
    this.loadingText.destroy();
    
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
    
    // Make screen tappable to retry
    this.input.once('pointerdown', () => {
      this.scene.restart();
    });
  }
  
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
    
    this.backButton.on('pointerdown', () => {
      this.scene.start('FlappyBirdStartScene');
    });
  }
  
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
    
    this.refreshButton.on('pointerdown', () => {
      this.scene.restart();
    });
  }
}