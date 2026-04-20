// src/scenes/ball-crush/BallCrushStartScene.ts
import Phaser from 'phaser';
import {
  getBallCrushBalance,
  getBallCrushUserData,
  getBallCrushLeaderboard,
  BallCrushUserData,
  BallCrushLeaderboardEntry,
} from '../../firebase/ballCrushSimple';

export class BallCrushStartScene extends Phaser.Scene {
  // ── Identity ────────────────────────────────────────────────────────
  private username: string = '';
  private uid: string = '';
  private displayName: string = '';
  private avatar: string = 'default';

  // ── Data ────────────────────────────────────────────────────────────
  private userData: BallCrushUserData | null = null;
  private leaderboard: BallCrushLeaderboardEntry[] = [];
  private playerRank: number = 0;
  private balance: number = 0;

  // ── UI ──────────────────────────────────────────────────────────────
  private balanceText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private rankText!: Phaser.GameObjects.Text;
  private loadingText!: Phaser.GameObjects.Text;
  private menuButtons: Phaser.GameObjects.Text[] = [];

  constructor() {
    super({ key: 'BallCrushStartScene' });
  }

  // ─── init ─────────────────────────────────────────────────────────────────
  init(data: { username: string; uid: string; displayName?: string; avatar?: string }) {
    console.log('⚽ BallCrushStartScene received:', data);

    if (!data || !data.username) {
      console.error('❌ No username received!');
      this.scene.start('CookieScene');
      return;
    }

    this.username = data.username;
    this.uid = data.uid || '';
    this.displayName = data.displayName || data.username;
    this.avatar = data.avatar || 'default';
  }

  // ─── create ───────────────────────────────────────────────────────────────
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

  // ─── Data fetching ────────────────────────────────────────────────────────
  private async fetchAllUserData() {
    console.log('📡 Fetching Ball Crush data for:', this.uid);

    const [userData, leaderboard, balance] = await Promise.all([
      getBallCrushUserData(this.uid),
      getBallCrushLeaderboard(10),
      getBallCrushBalance(this.uid)
    ]);

    if (!userData) {
      throw new Error('No user data found for: ' + this.username);
    }

    this.userData = userData;
    this.leaderboard = leaderboard;
    this.balance = balance;

    const rankIndex = leaderboard.findIndex(e => e.username === this.username);
    this.playerRank = rankIndex >= 0 ? rankIndex + 1 : 0;

    console.log('✅ Ball Crush user data fetched:', {
      username: this.username,
      balance: this.balance
    });
  }

  // ─── Full UI ──────────────────────────────────────────────────────────────
  private buildFullUI() {
    if (!this.userData) return;

    this.addTitle();
    this.addBallAnimation();
    this.createBalanceDisplay();
    this.createStatsDisplay();
    this.createRankDisplay();
    this.createWelcomeMessage();
    this.createMenuButtons();
    this.addFooter();
  }

  // ─── Background ───────────────────────────────────────────────────────────
  private addBackground() {
    if (this.textures.exists('ball-background')) {
      const bg = this.add.image(180, 320, 'ball-background');
      bg.setDisplaySize(360, 640);
      bg.setDepth(-1);
    } else {
      this.cameras.main.setBackgroundColor('#1a3a1a');
    }

    for (let i = 0; i < 6; i++) {
      const x = Phaser.Math.Between(20, 340);
      const y = Phaser.Math.Between(20, 620);
      const size = Phaser.Math.Between(8, 20);
      const alpha = Phaser.Math.FloatBetween(0.04, 0.12);
      const dot = this.add.circle(x, y, size, 0xffaa00, alpha);
      this.tweens.add({
        targets: dot, y: y + 20, duration: 3000 + i * 400,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
      });
    }
  }

  // ─── Title ────────────────────────────────────────────────────────────────
  private addTitle() {
    this.add.text(180, 70, 'BALL CRUSH', {
      fontSize: '32px',
      color: '#ffaa00',
      fontStyle: 'bold',
      stroke: '#8b4513',
      strokeThickness: 4
    }).setOrigin(0.5);
  }

  // ─── Animated ball ────────────────────────────────────────────────────────
  private addBallAnimation() {
    if (!this.textures.exists('ball')) return;

    const ball = this.add.image(180, 140, 'ball');
    ball.setScale(0.2);

    this.tweens.add({
      targets: ball, y: 128, duration: 800,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });

    this.tweens.add({
      targets: ball, angle: 360, duration: 3000,
      repeat: -1, ease: 'Linear'
    });
  }

  // ─── Welcome message ──────────────────────────────────────────────────────
  private createWelcomeMessage() {
    if (!this.userData) return;

    this.add.text(180, 190, `Welcome, ${this.displayName}!`, {
      fontSize: '16px',
      color: '#ffff00',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);

    this.add.text(180, 210, `Level ${this.userData.level ?? 1}`, {
      fontSize: '14px',
      color: '#ffffff'
    }).setOrigin(0.5);

    const winRate = this.userData.totalGames > 0
      ? Math.round((this.userData.totalWins / this.userData.totalGames) * 100)
      : 0;

    this.add.text(180, 230, `Wins: ${this.userData.totalWins} | Win Rate: ${winRate}%`, {
      fontSize: '12px',
      color: '#ffffff'
    }).setOrigin(0.5);
  }

  // ─── Balance display (top-left) ───────────────────────────────────────────
  private createBalanceDisplay() {
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.7);
    bg.fillRoundedRect(5, 5, 110, 40, 8);
    bg.lineStyle(1, 0xffaa00);
    bg.strokeRoundedRect(5, 5, 110, 40, 8);

    this.add.text(10, 8, '💰', { fontSize: '20px' });
    this.add.text(35, 8, 'Bal:', { fontSize: '12px', color: '#ffffff' });
    this.balanceText = this.add.text(35, 23, `${this.balance.toFixed(0)}`, {
      fontSize: '14px', color: '#00ff00', fontStyle: 'bold'
    });
  }

  // ─── Stats display (top-right) ────────────────────────────────────────────
  private createStatsDisplay() {
    if (!this.userData) return;

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.7);
    bg.fillRoundedRect(245, 5, 110, 40, 8);
    bg.lineStyle(1, 0xffaa00);
    bg.strokeRoundedRect(245, 5, 110, 40, 8);

    this.add.text(250, 8, '📊', { fontSize: '20px' });
    this.add.text(275, 8, 'Stats:', { fontSize: '12px', color: '#ffffff' });
    this.statsText = this.add.text(265, 23, `${this.userData.totalGames ?? 0} Games`, {
      fontSize: '12px', color: '#ffaa00', fontStyle: 'bold'
    });
  }

  // ─── Rank display (top-center) ────────────────────────────────────────────
  private createRankDisplay() {
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.7);
    bg.fillRoundedRect(125, 5, 110, 40, 8);
    bg.lineStyle(1, 0xffaa00);
    bg.strokeRoundedRect(125, 5, 110, 40, 8);

    this.add.text(130, 8, '🏆', { fontSize: '20px' });
    this.add.text(160, 8, 'Rank:', { fontSize: '12px', color: '#ffffff' });
    this.rankText = this.add.text(165, 23, `#${this.playerRank || 999}`, {
      fontSize: '14px', color: '#ffaa00', fontStyle: 'bold'
    });
  }

  // ─── Menu buttons ─────────────────────────────────────────────────────────
  private createMenuButtons() {
    if (!this.userData) return;

    const buttonWidth = 160;
    const buttonHeight = 45;
    const startX = 180;
    const startY = 280;

    const buttons = [
      { text: '🎮 FIND MATCH ($1)', color: '#FF9800', action: 'matchmaking' },
      { text: '🏆 LEADERBOARD',     color: '#2196F3', scene: 'BallCrushLeaderboardScene' },
      { text: '👤 PROFILE',         color: '#9C27B0', scene: 'BallCrushProfileScene' },
      { text: '📊 MY STATS',        color: '#9C27B0', scene: 'BallCrushStatsScene' },
      { text: '🎮 BACK TO GAMES',   color: '#FF5722', url: 'https://wintapgames.com/games' },
    ];

    buttons.forEach((btn, index) => {
      const yPos = startY + index * 55;

      const bg = this.add.graphics();
      const drawBg = (borderColor: number, borderWidth: number) => {
        bg.clear();
        bg.fillStyle(Phaser.Display.Color.HexStringToColor(btn.color).color, 1);
        bg.fillRoundedRect(startX - buttonWidth / 2, yPos - buttonHeight / 2, buttonWidth, buttonHeight, 12);
        bg.lineStyle(borderWidth, borderColor, 1);
        bg.strokeRoundedRect(startX - buttonWidth / 2, yPos - buttonHeight / 2, buttonWidth, buttonHeight, 12);
      };
      drawBg(0xffffff, 2);

      const button = this.add.text(startX, yPos, btn.text, {
        fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 2
      })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      button.on('pointerover', () => {
        button.setStyle({ color: '#ffff00' });
        button.setScale(1.05);
        drawBg(0xffff00, 3);
      });

      button.on('pointerout', () => {
        button.setStyle({ color: '#ffffff' });
        button.setScale(1);
        drawBg(0xffffff, 2);
      });

      if (btn.url) {
        button.on('pointerdown', () => { window.location.href = btn.url!; });

      } else if (btn.action === 'matchmaking') {
        button.on('pointerdown', () => {
          // Balance pre-check — gives fast feedback, but the real atomic
          // deduction happens inside BallCrushMatchmakingScene (same as checkers).
          if (this.balance < 1) {
            this.showInsufficientFunds();
            return;
          }

          console.log('🔍 Starting Ball Crush matchmaking with:', {
            username: this.username,
            uid: this.uid,
            displayName: this.displayName,
            avatar: this.avatar
          });

          this.scene.start('BallCrushMatchmakingScene', {
            username: this.username,
            uid: this.uid,
            displayName: this.displayName,
            avatar: this.avatar
          });
        });

      } else if (btn.scene) {
        button.on('pointerdown', () => {
          this.scene.start(btn.scene!, {
            username: this.username,
            uid: this.uid,
            userData: this.userData
          });
        });
      }

      this.menuButtons.push(button);
    });
  }

  // ─── Insufficient funds popup ─────────────────────────────────────────────
  private showInsufficientFunds() {
    const popup = this.add.graphics();
    popup.fillStyle(0x000000, 0.9);
    popup.fillRoundedRect(40, 200, 280, 150, 10);
    popup.lineStyle(2, 0xff0000, 1);
    popup.strokeRoundedRect(40, 200, 280, 150, 10);

    const icon     = this.add.text(180, 230, '⚠️', { fontSize: '40px' }).setOrigin(0.5);
    const title    = this.add.text(180, 280, 'Insufficient Funds!', { fontSize: '18px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    const sub      = this.add.text(180, 310, 'Need $1 to play', { fontSize: '14px', color: '#ffff00' }).setOrigin(0.5);
    const closeBtn = this.add.text(180, 340, 'OK', {
      fontSize: '16px', color: '#ffffff',
      backgroundColor: '#4CAF50', padding: { x: 20, y: 5 }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    const destroy = () => {
      popup.destroy(); icon.destroy(); title.destroy();
      sub.destroy(); closeBtn.destroy();
    };

    closeBtn.on('pointerdown', destroy);
    this.time.delayedCall(3000, destroy);
  }

  // ─── Loading / error states ───────────────────────────────────────────────
  private showLoading() {
    this.loadingText = this.add.text(180, 320, 'LOADING...', {
      fontSize: '18px', color: '#ffff00'
    }).setOrigin(0.5);
  }

  private showError(message: string) {
    this.loadingText?.destroy();

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.9);
    overlay.fillRect(0, 0, 360, 640);

    this.add.text(180, 200, '❌', { fontSize: '48px', color: '#ff0000' }).setOrigin(0.5);
    this.add.text(180, 260, message, {
      fontSize: '18px', color: '#ffffff', stroke: '#000000', strokeThickness: 2,
      wordWrap: { width: 300 }
    }).setOrigin(0.5);

    this.add.text(180, 330, '🔄 TRY AGAIN', {
      fontSize: '20px', color: '#ffffff',
      backgroundColor: '#4CAF50', padding: { x: 15, y: 8 }
    })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.scene.restart({ username: this.username, uid: this.uid });
      });
  }

  // ─── Footer ───────────────────────────────────────────────────────────────
  private addFooter() {
    this.add.text(340, 628, 'Ball Crush v1.0.0', {
      fontSize: '10px', color: '#666666'
    }).setOrigin(1, 0);
  }
}