import Phaser from 'phaser';
import { CompleteUserData } from '../../firebase/simple';

export class FlappyBirdProfileScene extends Phaser.Scene {
  private userData!: CompleteUserData;
  private backButton!: Phaser.GameObjects.Text;
  private walletButton!: Phaser.GameObjects.Text;
  private editButton!: Phaser.GameObjects.Text;
  
  constructor() {
    super({ key: 'FlappyBirdProfileScene' });
  }
  
  init(data: { userData: CompleteUserData }) {
    console.log('👤 ProfileScene initialized');
    
    if (!data || !data.userData) {
      console.error('❌ No user data received');
      this.scene.start('FlappyBirdStartScene');
      return;
    }
    
    this.userData = data.userData;
    console.log('📥 Profile data:', this.userData);
  }
  
  create() {
    // Background
    this.cameras.main.setBackgroundColor('#16213e');
    
    // Title
    this.add.text(180, 30, '👤 PLAYER PROFILE', {
      fontSize: '24px',
      color: '#ffd700',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);
    
    // Profile card background
    const card = this.add.graphics();
    card.fillStyle(0x0f3460, 0.8);
    card.fillRoundedRect(20, 60, 320, 400, 15);
    card.lineStyle(2, 0xffd700);
    card.strokeRoundedRect(20, 60, 320, 400, 15);
    
    // Avatar placeholder (large)
    this.add.text(40, 110, '👤', { fontSize: '64px' });
    
    // Username and display name
    this.add.text(160, 100, this.userData.displayName, {
      fontSize: '22px',
      color: '#ffffff',
      fontStyle: 'bold'
    });
    
    this.add.text(160, 130, `@${this.userData.username}`, {
      fontSize: '16px',
      color: '#cccccc'
    });
    
    // Member since
    const joinDate = new Date(this.userData.createdAt).toLocaleDateString();
    this.add.text(160, 155, `Joined: ${joinDate}`, {
      fontSize: '12px',
      color: '#888888'
    });
    
    // Divider line
    const line = this.add.graphics();
    line.lineStyle(1, 0x444444, 1);
    line.lineBetween(30, 185, 330, 185);
    
    // Stats grid
    let yPos = 200;
    const stats = [
      { label: 'Rank', value: this.userData.rank, icon: '🏆', color: '#ffd700' },
      { label: 'Level', value: this.userData.level.toString(), icon: '📊', color: '#00ff00' },
      { label: 'Experience', value: this.userData.experience.toString(), icon: '✨', color: '#00ffff' },
      { label: 'Games Played', value: this.userData.totalGames.toString(), icon: '🎮', color: '#2196F3' },
      { label: 'Wins', value: this.userData.totalWins.toString(), icon: '🏅', color: '#4CAF50' },
      { label: 'Losses', value: this.userData.totalLosses.toString(), icon: '💔', color: '#f44336' },
      { label: 'Win Streak', value: this.userData.winStreak.toString(), icon: '🔥', color: '#FF9800' },
      { label: 'High Score', value: this.userData.highScore.toString(), icon: '🏆', color: '#ffd700' }
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
      this.add.text(190, yPos, stat.value, { 
        fontSize: '16px', 
        color: stat.color,
        fontStyle: 'bold'
      });
      
      yPos += 25;
    });
    
    // Wallet info section
    const walletBg = this.add.graphics();
    walletBg.fillStyle(0x1a1a2e, 0.9);
    walletBg.fillRoundedRect(20, 470, 320, 60, 10);
    walletBg.lineStyle(1, 0xffd700);
    walletBg.strokeRoundedRect(20, 470, 320, 60, 10);
    
    this.add.text(40, 485, '💰', { fontSize: '32px' });
    this.add.text(80, 485, 'Wallet Balance:', { fontSize: '14px', color: '#ffffff' });
    this.add.text(80, 505, `$${this.userData.balance.toFixed(2)}`, {
      fontSize: '22px',
      color: '#00ff00',
      fontStyle: 'bold'
    });
    
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
      // Replace with your actual wallet URL
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
      // Replace with your actual edit profile URL
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
      this.scene.start('FlappyBirdStartScene');
    });
  }
}