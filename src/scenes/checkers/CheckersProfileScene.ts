// src/scenes/checkers/CheckersProfileScene.ts
import Phaser from 'phaser';
import { CheckersUserData } from '../../firebase/checkersService';

export class CheckersProfileScene extends Phaser.Scene {
  private userData!: CheckersUserData;
  private username: string = '';
  private uid: string = '';
  private backButton!: Phaser.GameObjects.Text;
  private walletButton!: Phaser.GameObjects.Text;
  private editButton!: Phaser.GameObjects.Text;
  
  constructor() {
    super({ key: 'CheckersProfileScene' });
  }
  
  init(data: { userData: CheckersUserData; username?: string; uid?: string }) {
    console.log('👤 CheckersProfileScene initialized');
    
    if (!data || !data.userData) {
      console.error('❌ No user data received');
      this.scene.start('CheckersStartScene');
      return;
    }
    
    this.userData = data.userData;
    this.username = data.username || this.userData.username || '';
    this.uid = data.uid || '';
    
    console.log('📥 Profile data:', this.userData);
  }
  
  create() {
    // Background
    this.cameras.main.setBackgroundColor('#16213e');
    
    // Title
    this.add.text(180, 30, '♟️ CHECKERS PROFILE', {
      fontSize: '24px',
      color: '#ffd700',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);
    
    // Profile card background
    const card = this.add.graphics();
    card.fillStyle(0x0f3460, 0.8);
    card.fillRoundedRect(20, 60, 320, 440, 15);
    card.lineStyle(2, 0xffd700);
    card.strokeRoundedRect(20, 60, 320, 440, 15);
    
    // Avatar placeholder (larger)
    this.add.text(40, 100, '♟️', { fontSize: '64px' });
    
    // Username and display name
    this.add.text(160, 90, this.userData.displayName, {
      fontSize: '22px',
      color: '#ffffff',
      fontStyle: 'bold'
    });
    
    this.add.text(160, 120, `@${this.userData.username}`, {
      fontSize: '16px',
      color: '#cccccc'
    });
    
    // Member since
    const joinDate = new Date(this.userData.createdAt).toLocaleDateString();
    this.add.text(160, 145, `Joined: ${joinDate}`, {
      fontSize: '12px',
      color: '#888888'
    });
    
    // Divider line
    const line = this.add.graphics();
    line.lineStyle(1, 0x444444, 1);
    line.lineBetween(30, 175, 330, 175);
    
    // Calculate win rate
    const winRate = this.userData.gamesPlayed > 0 
      ? Math.round((this.userData.gamesWon / this.userData.gamesPlayed) * 100) 
      : 0;
    
    // Get Checkers-specific winnings
    const checkersWinnings = this.userData.winnings?.checkers?.total || 0;
    const winsCount = this.userData.winnings?.checkers?.count || 0;
    
    // Stats grid
    let yPos = 190;
    const stats = [
      { label: 'Rank', value: this.userData.rank, icon: '🏆', color: '#ffd700' },
      { label: 'Level', value: this.userData.level.toString(), icon: '📊', color: '#00ff00' },
      { label: 'Experience', value: this.userData.experience.toString(), icon: '✨', color: '#00ffff' },
      { label: 'Games Played', value: this.userData.gamesPlayed.toString(), icon: '🎮', color: '#2196F3' },
      { label: 'Games Won', value: this.userData.gamesWon.toString(), icon: '🏅', color: '#4CAF50' },
      { label: 'Games Lost', value: this.userData.gamesLost.toString(), icon: '💔', color: '#f44336' },
      { label: 'Win Rate', value: `${winRate}%`, icon: '📈', color: winRate >= 70 ? '#00ff00' : winRate >= 50 ? '#ffff00' : '#ff6666' },
      { label: 'Current Streak', value: this.userData.winStreak.toString(), icon: '🔥', color: '#FF9800' },
      { label: 'Best Streak', value: this.userData.bestWinStreak.toString(), icon: '⭐', color: '#ffd700' }
    ];
    
    stats.forEach(stat => {
      // Icon
      this.add.text(40, yPos, stat.icon, { fontSize: '18px' });
      
      // Label
      this.add.text(65, yPos, stat.label + ':', { 
        fontSize: '14px', 
        color: '#aaaaaa' 
      });
      
      // Value
      this.add.text(200, yPos, stat.value, { 
        fontSize: '16px', 
        color: stat.color,
        fontStyle: 'bold'
      });
      
      yPos += 25;
    });
    
    // Game Stats Section
    yPos += 5;
    
    // Small separator
    const line2 = this.add.graphics();
    line2.lineStyle(1, 0x444444, 1);
    line2.lineBetween(30, yPos - 5, 330, yPos - 5);
    
    // Game-specific stats
    const gameStats = [
      { label: 'Pieces Captured', value: this.userData.piecesCaptured.toString(), icon: '📦', color: '#ffaa00' },
      { label: 'Kings Made', value: this.userData.kingsMade.toString(), icon: '👑', color: '#ffff00' }
    ];
    
    gameStats.forEach(stat => {
      // Icon
      this.add.text(40, yPos, stat.icon, { fontSize: '18px' });
      
      // Label
      this.add.text(65, yPos, stat.label + ':', { 
        fontSize: '14px', 
        color: '#aaaaaa' 
      });
      
      // Value
      this.add.text(200, yPos, stat.value, { 
        fontSize: '16px', 
        color: stat.color,
        fontStyle: 'bold'
      });
      
      yPos += 25;
    });
    
    // Winnings info section (Checkers-specific)
    const winningsBg = this.add.graphics();
    winningsBg.fillStyle(0x1a1a2e, 0.9);
    winningsBg.fillRoundedRect(20, yPos + 5, 320, 70, 10);
    winningsBg.lineStyle(1, 0xffd700);
    winningsBg.strokeRoundedRect(20, yPos + 5, 320, 70, 10);
    
    this.add.text(40, yPos + 15, '💰', { fontSize: '32px' });
    this.add.text(80, yPos + 20, 'Checkers Winnings:', { fontSize: '14px', color: '#ffffff' });
    this.add.text(80, yPos + 40, `$${checkersWinnings.toFixed(2)}`, {
      fontSize: '22px',
      color: '#00ff00',
      fontStyle: 'bold'
    });
    
    this.add.text(240, yPos + 40, `${winsCount} wins`, {
      fontSize: '12px',
      color: '#888888'
    });
    
    // Last win info if available
    if (this.userData.winnings?.checkers?.lastWin) {
      const lastWinDate = new Date(this.userData.winnings.checkers.lastWin).toLocaleDateString();
      this.add.text(180, yPos + 60, `Last win: ${lastWinDate}`, {
        fontSize: '10px',
        color: '#888888'
      }).setOrigin(0.5);
    }
    
    // Create action buttons
    this.createWalletButton();
    this.createEditButton();
    this.createBackButton();
  }
  
  private createWalletButton() {
    this.walletButton = this.add.text(240, 600, '💰 WALLET', {
      fontSize: '18px',
      color: '#ffffff',
      backgroundColor: '#4CAF50',
      padding: { x: 20, y: 10 }
    })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });
    
    // Hover effect
    this.walletButton.on('pointerover', () => {
      this.walletButton.setStyle({ color: '#ffff00', backgroundColor: '#45a049' });
    });
    
    this.walletButton.on('pointerout', () => {
      this.walletButton.setStyle({ color: '#ffffff', backgroundColor: '#4CAF50' });
    });
    
    // Open wallet URL in new tab
    this.walletButton.on('pointerdown', () => {
      const walletUrl = `https://wintapgames.com/wallet/${this.userData.username}`;
      window.open(walletUrl, '_blank');
    });
  }
  
  private createEditButton() {
    this.editButton = this.add.text(180, 560, '✏️ EDIT PROFILE', {
      fontSize: '18px',
      color: '#ffffff',
      backgroundColor: '#2196F3',
      padding: { x: 20, y: 10 }
    })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });
    
    // Hover effect
    this.editButton.on('pointerover', () => {
      this.editButton.setStyle({ color: '#ffff00', backgroundColor: '#1976D2' });
    });
    
    this.editButton.on('pointerout', () => {
      this.editButton.setStyle({ color: '#ffffff', backgroundColor: '#2196F3' });
    });
    
    // Open edit profile URL in new tab
    this.editButton.on('pointerdown', () => {
      const editUrl = `https://wintapgames.com/profile/edit/${this.userData.username}`;
      window.open(editUrl, '_blank');
    });
  }
  
  private createBackButton() {
    this.backButton = this.add.text(40, 583, '← BACK', {
      fontSize: '16px',
      color: '#ffffff',
      backgroundColor: '#f44336',
      padding: { x: 20, y: 10 }
    })
    .setInteractive({ useHandCursor: true });
    
    this.backButton.on('pointerover', () => {
      this.backButton.setStyle({ color: '#ffff00', backgroundColor: '#d32f2f' });
    });
    
    this.backButton.on('pointerout', () => {
      this.backButton.setStyle({ color: '#ffffff', backgroundColor: '#f44336' });
    });
    
    this.backButton.on('pointerdown', () => {
      this.scene.start('CheckersStartScene', {
        username: this.username,
        uid: this.uid,
        userData: this.userData
      });
    });
  }
}