// src/scenes/sky-shooter/SkyShooterProfileScene.ts
import Phaser from 'phaser';

// Interface for user data we need in the scene
interface SkyShooterUserData {
  uid: string;
  username: string;
  displayName: string;
  balance: number;
  totalGames: number;
  totalWins: number;
  totalLosses: number;
  winStreak: number;
  level: number;
  rank: string;
  experience: number;
  avatar: string;
  createdAt: string;
}

export class SkyShooterProfileScene extends Phaser.Scene {
  private userData!: SkyShooterUserData;
  private backButton!: Phaser.GameObjects.Text;
  private walletButton!: Phaser.GameObjects.Text;
  private editButton!: Phaser.GameObjects.Text;
  
  constructor() {
    super({ key: 'SkyShooterProfileScene' });
  }
  
  init(data: { userData: SkyShooterUserData }) {
    console.log('👤 SkyShooterProfileScene initialized');
    
    if (!data || !data.userData) {
      console.error('❌ No user data received');
      this.scene.start('SkyShooterStartScene');
      return;
    }
    
    this.userData = data.userData;
    console.log('📥 Profile data:', this.userData);
  }
  
  create() {
    // Background
    this.cameras.main.setBackgroundColor('#0a0a2a');
    
    // Add stars background
    this.addStars();
    
    // Title
    this.add.text(180, 30, '🚀 PILOT PROFILE', {
      fontSize: '28px',
      color: '#00ffff',
      fontStyle: 'bold',
      stroke: '#0000ff',
      strokeThickness: 4
    }).setOrigin(0.5);
    
    // Profile card background
    const card = this.add.graphics();
    card.fillStyle(0x000033, 0.9);
    card.fillRoundedRect(20, 60, 320, 400, 15);
    card.lineStyle(2, 0x00ffff);
    card.strokeRoundedRect(20, 60, 320, 400, 15);
    
    // Avatar placeholder
    this.add.text(40, 110, '🚀', { fontSize: '64px' });
    
    // Username and display name (with fallbacks)
    this.add.text(160, 100, this.userData.displayName || 'Pilot', {
      fontSize: '22px',
      color: '#ffffff',
      fontStyle: 'bold'
    });
    
    this.add.text(160, 130, `@${this.userData.username || 'unknown'}`, {
      fontSize: '16px',
      color: '#00ffff'
    });
    
    // Rank badge
    this.createRankBadge();
    
    // Divider line
    const line = this.add.graphics();
    line.lineStyle(1, 0x00ffff, 0.3);
    line.lineBetween(30, 185, 330, 185);
    
    // Stats grid with safe fallbacks
    let yPos = 200;
    
    // Create safe values for all stats
    const rank = this.userData.rank || 'Rookie';
    const level = this.userData.level || 1;
    const experience = this.userData.experience || 0;
    const totalGames = this.userData.totalGames || 0;
    const totalWins = this.userData.totalWins || 0;
    const totalLosses = this.userData.totalLosses || 0;
    const winStreak = this.userData.winStreak || 0;
    
    const stats = [
      { label: 'Rank', value: rank, icon: '🏆', color: '#00ffff' },
      { label: 'Level', value: level.toString(), icon: '📊', color: '#00ff00' },
      { label: 'Experience', value: experience.toString(), icon: '✨', color: '#ffffff' },
      { label: 'Missions', value: totalGames.toString(), icon: '🎯', color: '#4CAF50' },
      { label: 'Victories', value: totalWins.toString(), icon: '🏅', color: '#00ff00' },
      { label: 'Defeats', value: totalLosses.toString(), icon: '💔', color: '#f44336' },
      { label: 'Win Streak', value: winStreak.toString(), icon: '🔥', color: '#FF9800' }
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
    walletBg.fillStyle(0x000044, 0.9);
    walletBg.fillRoundedRect(20, 470, 320, 60, 10);
    walletBg.lineStyle(1, 0x00ffff);
    walletBg.strokeRoundedRect(20, 470, 320, 60, 10);
    
    this.add.text(40, 485, '💰', { fontSize: '32px' });
    this.add.text(80, 485, 'Credits:', { fontSize: '14px', color: '#ffffff' });
    
    // Safe balance value
    const balance = this.userData.balance || 0;
    this.add.text(80, 505, balance.toFixed(0), {
      fontSize: '22px',
      color: '#00ff00',
      fontStyle: 'bold'
    });
    
    // Create action buttons
    this.createWalletButton();
    this.createEditButton();
    this.createBackButton();
  }
  
  private addStars() {
    // Create a simple circle texture for stars if it doesn't exist
    if (!this.textures.exists('white')) {
      const graphics = this.make.graphics({ x: 0, y: 0, add: false });
      graphics.fillStyle(0xffffff);
      graphics.fillCircle(2, 2, 1);
      graphics.generateTexture('white', 4, 4);
    }
    
    // Add some random stars
    for (let i = 0; i < 50; i++) {
      const x = Phaser.Math.Between(0, 360);
      const y = Phaser.Math.Between(0, 640);
      const size = Phaser.Math.Between(1, 2);
      const alpha = Phaser.Math.FloatBetween(0.3, 0.8);
      this.add.image(x, y, 'white').setScale(size).setAlpha(alpha);
    }
  }
  
  private createRankBadge() {
    // Get rank color
    const rankColors: Record<string, string> = {
      'Rookie': '#8B8B8B',
      'Bronze': '#CD7F32',
      'Silver': '#C0C0C0',
      'Gold': '#FFD700',
      'Platinum': '#E5E4E2',
      'Diamond': '#B9F2FF'
    };
    
    const rank = this.userData.rank || 'Rookie';
    const rankColor = rankColors[rank] || '#00ffff';
    
    // Badge background
    const badge = this.add.graphics();
    badge.fillStyle(0x000000, 0.7);
    badge.fillRoundedRect(220, 95, 100, 30, 15);
    badge.lineStyle(1, 0x00ffff);
    badge.strokeRoundedRect(220, 95, 100, 30, 15);
    
    // Rank text
    this.add.text(270, 110, rank, {
      fontSize: '16px',
      color: rankColor,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);
  }
  
  private createWalletButton() {
    this.walletButton = this.add.text(240, 560, '💰 CREDITS', {
      fontSize: '18px',
      color: '#ffffff',
      backgroundColor: '#4CAF50',
      padding: { x: 20, y: 10 }
    })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });
    
    // Hover effect
    this.walletButton.on('pointerover', () => {
      this.walletButton.setStyle({ color: '#00ffff', backgroundColor: '#45a049' });
      this.walletButton.setScale(1.05);
    });
    
    this.walletButton.on('pointerout', () => {
      this.walletButton.setStyle({ color: '#ffffff', backgroundColor: '#4CAF50' });
      this.walletButton.setScale(1);
    });
    
    // Open wallet URL in new tab
    this.walletButton.on('pointerdown', () => {
      const walletUrl = `https://wintapgames.com/wallet/${this.userData.username}`;
      window.open(walletUrl, '_blank');
    });
  }
  
  private createEditButton() {
    this.editButton = this.add.text(80, 560, '✏️ EDIT', {
      fontSize: '18px',
      color: '#ffffff',
      backgroundColor: '#2196F3',
      padding: { x: 20, y: 10 }
    })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });
    
    // Hover effect
    this.editButton.on('pointerover', () => {
      this.editButton.setStyle({ color: '#00ffff', backgroundColor: '#1976D2' });
      this.editButton.setScale(1.05);
    });
    
    this.editButton.on('pointerout', () => {
      this.editButton.setStyle({ color: '#ffffff', backgroundColor: '#2196F3' });
      this.editButton.setScale(1);
    });
    
    // Open edit profile URL in new tab
    this.editButton.on('pointerdown', () => {
      const editUrl = `https://wintapgames.com/profile/edit/${this.userData.username}`;
      window.open(editUrl, '_blank');
    });
  }
  
  private createBackButton() {
    this.backButton = this.add.text(40, 600, '← RETURN', {
      fontSize: '16px',
      color: '#ffffff',
      backgroundColor: '#f44336',
      padding: { x: 15, y: 8 }
    })
    .setInteractive({ useHandCursor: true });
    
    this.backButton.on('pointerover', () => {
      this.backButton.setStyle({ color: '#00ffff', backgroundColor: '#d32f2f' });
    });
    
    this.backButton.on('pointerout', () => {
      this.backButton.setStyle({ color: '#ffffff', backgroundColor: '#f44336' });
    });
    
    this.backButton.on('pointerdown', () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('SkyShooterStartScene', { 
          username: this.userData.username,
          uid: this.userData.uid,
          userData: this.userData 
        });
      });
    });
  }
}