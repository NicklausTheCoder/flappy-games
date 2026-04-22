// src/scenes/checkers/CheckersStatsScene.ts
import Phaser from 'phaser';
import { getCheckersUserData, CheckersUserData } from '../../firebase/checkersService';

export class CheckersStatsScene extends Phaser.Scene {
  private username:  string = '';
  private uid:       string = '';
  private userData:  CheckersUserData | null = null;
  private loadingText!: Phaser.GameObjects.Text;

  private boardSquares: Array<{ obj: Phaser.GameObjects.Rectangle; drift: number }> = [];

  constructor() {
    super({ key: 'CheckersStatsScene' });
  }

  init(data: { username?: string; uid?: string }) {
    this.username    = data?.username || '';
    this.uid         = data?.uid      || '';
    this.boardSquares = [];
  }

  async create() {
    this.addBackground();

    const titleBg = this.add.graphics().setDepth(9);
    titleBg.fillStyle(0x2a1200, 0.95);
    titleBg.fillRoundedRect(24, 18, 312, 56, 14);
    titleBg.lineStyle(2, 0xffaa00, 0.85);
    titleBg.strokeRoundedRect(24, 18, 312, 56, 14);
    this.add.text(180, 46, '📊  MY STATS', {
      fontSize: '22px', color: '#ffaa00', fontStyle: 'bold',
      stroke: '#3d1a00', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10);

    this.loadingText = this.add.text(180, 300, 'LOADING...', {
      fontSize: '20px', color: '#ffaa00', fontStyle: 'bold',
      stroke: '#3d1a00', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10);

    await this.loadUserData();
    this.loadingText.destroy();

    if (!this.userData) {
      this.add.text(180, 280, '❌', { fontSize: '48px' }).setOrigin(0.5).setDepth(10);
      this.add.text(180, 340, 'Failed to load stats', {
        fontSize: '16px', color: '#ffffff', stroke: '#3d1a00', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(10);
    } else {
      this.displayStats();
    }

    this.buildBackButton();
    this.buildRefreshButton();
  }

  update(_t: number, delta: number) {
    const dt = delta / 1000;
    this.boardSquares.forEach(s => {
      s.obj.y -= s.drift * dt;
      s.obj.angle += s.drift * 0.3 * dt;
      if (s.obj.y < -20) { s.obj.y = 660; s.obj.x = Phaser.Math.Between(0, 360); }
    });
  }

  private async loadUserData() {
    try {
      if (!this.uid) return;
      this.userData = await getCheckersUserData(this.uid);
    } catch (e) { console.error('❌', e); }
  }

  private displayStats() {
    if (!this.userData) return;

    const winRate          = this.userData.gamesPlayed > 0 ? Math.round((this.userData.gamesWon / this.userData.gamesPlayed) * 100) : 0;
    const checkersWinnings = this.userData.winnings?.checkers?.total || 0;
    const winsCount        = this.userData.winnings?.checkers?.count || 0;

    const makeCard = (y: number, h: number, title: string) => {
      const card = this.add.graphics().setDepth(9);
      card.fillStyle(0x2a1200, 0.92);
      card.fillRoundedRect(22, y, 316, h, 12);
      card.lineStyle(1.5, 0xffaa00, 0.55);
      card.strokeRoundedRect(22, y, 316, h, 12);
      this.add.text(180, y + 12, title, {
        fontSize: '10px', color: '#ffaa00', letterSpacing: 3, stroke: '#3d1a00', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(10);
    };

    const row = (y: number, label: string, value: string, color: string) => {
      this.add.text(38,  y, label + ':', { fontSize: '13px', color: '#aaaaaa', stroke: '#3d1a00', strokeThickness: 1 }).setDepth(10);
      this.add.text(326, y, value,        { fontSize: '14px', color, fontStyle: 'bold', stroke: '#3d1a00', strokeThickness: 1 }).setOrigin(1,0).setDepth(10);
    };

    // ── Rank / Level ──
    makeCard(90, 56, 'PLAYER');
    row(110, 'Rank',  this.userData.rank || 'Bronze', '#ffaa00');
    row(128, 'Level', `${this.userData.level}`,        '#44ff88');

    // ── Games ──
    makeCard(158, 86, 'GAMES');
    row(178, 'Played', `${this.userData.gamesPlayed}`, '#ffffff');
    row(198, 'Won',    `${this.userData.gamesWon}`,    '#44ff88');
    row(218, 'Lost',   `${this.userData.gamesLost}`,   '#ff8888');

    // ── Performance ──
    makeCard(256, 90, 'PERFORMANCE');
    row(276, 'Win rate',       `${winRate}%`,                               winRate >= 50 ? '#44ff88' : '#ffaa44');
    row(296, 'Current streak', `${this.userData.winStreak}`,                '#ffaa00');
    row(316, 'Best streak',    `${this.userData.bestWinStreak}`,            '#ffd700');

    // ── Game stats ──
    makeCard(358, 68, 'GAME STATS');
    row(378, 'Pieces captured', `${this.userData.piecesCaptured}`, '#ccaa88');
    row(398, 'Kings made',      `${this.userData.kingsMade}`,      '#ffff88');

    // ── Winnings ──
    const wCard = this.add.graphics().setDepth(9);
    wCard.fillStyle(0x2a1200, 0.95);
    wCard.fillRoundedRect(22, 438, 316, 68, 12);
    wCard.lineStyle(1.5, 0x44ff88, 0.65);
    wCard.strokeRoundedRect(22, 438, 316, 68, 12);
    this.add.text(180, 450, 'CHECKERS WINNINGS', { fontSize: '10px', color: '#44ff88', letterSpacing: 2, stroke: '#3d1a00', strokeThickness: 2 }).setOrigin(0.5).setDepth(10);
    this.add.text(38,  468, `Total: $${checkersWinnings.toFixed(2)}`, { fontSize: '18px', color: '#44ff88', fontStyle: 'bold', stroke: '#3d1a00', strokeThickness: 2 }).setDepth(10);
    this.add.text(326, 472, `${winsCount} wins`, { fontSize: '12px', color: '#888888', stroke: '#3d1a00', strokeThickness: 1 }).setOrigin(1,0).setDepth(10);
  }

  private addBackground() {
    this.cameras.main.setBackgroundColor('#0f0800');
    if (this.textures.exists('checkers-bg')) {
      this.add.image(180, 320, 'checkers-bg').setDisplaySize(360, 640).setDepth(-2);
      const d = this.add.graphics().setDepth(-1);
      d.fillStyle(0x000000, 0.72); d.fillRect(0, 0, 360, 640);
    }
    for (let i = 0; i < 10; i++) {
      const sq = this.add.rectangle(
        Phaser.Math.Between(0,360), Phaser.Math.Between(0,640),
        Phaser.Math.Between(10,24), Phaser.Math.Between(10,24),
        i % 2 === 0 ? 0x8b4513 : 0xdeb887, Phaser.Math.FloatBetween(0.04,0.11)
      ).setDepth(0).setAngle(45);
      this.boardSquares.push({ obj: sq, drift: Phaser.Math.FloatBetween(5, 16) });
    }
  }

  private buildBackButton() {
    this.buildBtn(90, 588, '← BACK', false, () =>
      this.scene.start('CheckersStartScene', { username: this.username, uid: this.uid })
    );
  }

  private buildRefreshButton() {
    this.buildBtn(260, 588, '🔄 REFRESH', true, async () => {
      await this.loadUserData();
      this.scene.restart({ username: this.username, uid: this.uid });
    });
  }

  private buildBtn(x: number, y: number, label: string, primary: boolean, cb: () => void) {
    const hasBtn = this.textures.exists('wood-button');
    let imgObj: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
    if (hasBtn) {
      imgObj = this.add.image(0, 0, 'wood-button').setDisplaySize(148, 42);
      (imgObj as Phaser.GameObjects.Image).setTint(primary ? 0xffdd99 : 0xcc9966);
    } else {
      const g = this.add.graphics();
      g.fillStyle(primary ? 0xd4813a : 0x8b4513, 0.95);
      g.fillRoundedRect(-74,-21,148,42,10); imgObj = g;
    }
    const lbl = this.add.text(0, 0, label, {
      fontSize: '13px', color: '#3d1a00', fontStyle: 'bold', stroke: '#8b4513', strokeThickness: 1,
    }).setOrigin(0.5);
    const c = this.add.container(x, y, [imgObj as any, lbl]).setDepth(20);
    c.setSize(148, 42).setInteractive({ useHandCursor: true });
    c.on('pointerover',  () => { lbl.setColor('#ffaa00'); this.tweens.add({ targets:c, scaleX:1.05, scaleY:1.05, duration:75 }); });
    c.on('pointerout',   () => { lbl.setColor('#3d1a00'); this.tweens.add({ targets:c, scaleX:1,    scaleY:1,    duration:75 }); });
    c.on('pointerdown',  () => { this.tweens.add({ targets:c, scaleX:0.95, scaleY:0.95, duration:55, yoyo:true, onComplete:cb }); });
  }
}