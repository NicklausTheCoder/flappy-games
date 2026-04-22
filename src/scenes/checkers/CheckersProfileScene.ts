// src/scenes/checkers/CheckersProfileScene.ts
import Phaser from 'phaser';
import { CheckersUserData } from '../../firebase/checkersService';

export class CheckersProfileScene extends Phaser.Scene {
  private userData!: CheckersUserData;
  private username:  string = '';
  private uid:       string = '';

  private boardSquares: Array<{ obj: Phaser.GameObjects.Rectangle; drift: number }> = [];

  constructor() {
    super({ key: 'CheckersProfileScene' });
  }

  init(data: { userData: CheckersUserData; username?: string; uid?: string }) {
    if (!data?.userData) { this.scene.start('CheckersStartScene'); return; }
    this.userData    = data.userData;
    this.username    = data.username || this.userData.username || '';
    this.uid         = data.uid      || '';
    this.boardSquares = [];
  }

  create() {
    this.addBackground();

    const winRate = this.userData.gamesPlayed > 0
      ? Math.round((this.userData.gamesWon / this.userData.gamesPlayed) * 100)
      : 0;
    const checkersWinnings = this.userData.winnings?.checkers?.total || 0;
    const winsCount        = this.userData.winnings?.checkers?.count || 0;

    // ── Title ──
    const titleBg = this.add.graphics().setDepth(9);
    titleBg.fillStyle(0x2a1200, 0.95);
    titleBg.fillRoundedRect(24, 18, 312, 56, 14);
    titleBg.lineStyle(2, 0xffaa00, 0.85);
    titleBg.strokeRoundedRect(24, 18, 312, 56, 14);
    this.add.text(180, 46, '♟  PROFILE', {
      fontSize: '24px', color: '#ffaa00', fontStyle: 'bold',
      stroke: '#3d1a00', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10);

    // ── Profile card ──
    const profileCard = this.add.graphics().setDepth(9);
    profileCard.fillStyle(0x2a1200, 0.95);
    profileCard.fillRoundedRect(22, 86, 316, 90, 12);
    profileCard.lineStyle(1.5, 0xffaa00, 0.7);
    profileCard.strokeRoundedRect(22, 86, 316, 90, 12);

    // Piece avatar
    this.add.circle(72, 131, 26, 0x3d1a00, 1).setDepth(10);
    this.add.circle(72, 131, 22, 0xcc2200, 1).setDepth(11);
    this.add.circle(72, 131, 14, 0xdd3300, 1).setDepth(12);
    this.add.circle(63, 122,  6, 0xffffff, 0.25).setDepth(13);
    this.add.text(72, 131, '♛', { fontSize: '14px', color: '#ffaa00' }).setOrigin(0.5).setDepth(14);

    this.add.text(108, 98,  this.userData.displayName, {
      fontSize: '18px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#3d1a00', strokeThickness: 2,
    }).setDepth(10);
    this.add.text(108, 122, `@${this.userData.username}`, {
      fontSize: '13px', color: '#ffaa00', stroke: '#3d1a00', strokeThickness: 1,
    }).setDepth(10);
    const joined = new Date(this.userData.createdAt).toLocaleDateString();
    this.add.text(108, 142, `Joined ${joined}`, {
      fontSize: '10px', color: '#888888', stroke: '#3d1a00', strokeThickness: 1,
    }).setDepth(10);

    // ── Stats card ──
    const statsY = 188;
    const statsCard = this.add.graphics().setDepth(9);
    statsCard.fillStyle(0x2a1200, 0.92);
    statsCard.fillRoundedRect(22, statsY, 316, 228, 12);
    statsCard.lineStyle(1.5, 0xffaa00, 0.55);
    statsCard.strokeRoundedRect(22, statsY, 316, 228, 12);

    this.add.text(180, statsY + 12, 'CAREER STATS', {
      fontSize: '11px', color: '#ffaa00', letterSpacing: 3,
      stroke: '#3d1a00', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(10);

    const statsData = [
      { icon: '🏆', label: 'Rank',           value: this.userData.rank,                       color: '#ffaa00' },
      { icon: '📊', label: 'Level',          value: `${this.userData.level}`,                 color: '#44ff88' },
      { icon: '🎮', label: 'Games played',   value: `${this.userData.gamesPlayed}`,           color: '#ffffff' },
      { icon: '🏅', label: 'Games won',      value: `${this.userData.gamesWon}`,              color: '#44ff88' },
      { icon: '💔', label: 'Games lost',     value: `${this.userData.gamesLost}`,             color: '#ff8888' },
      { icon: '📈', label: 'Win rate',       value: `${winRate}%`,                            color: winRate >= 50 ? '#44ff88' : '#ffaa44' },
      { icon: '🔥', label: 'Current streak', value: `${this.userData.winStreak}`,             color: '#ffaa00' },
      { icon: '⭐', label: 'Best streak',    value: `${this.userData.bestWinStreak}`,         color: '#ffd700' },
      { icon: '♟', label: 'Pieces captured',value: `${this.userData.piecesCaptured}`,        color: '#ccaa88' },
    ];

    statsData.forEach((s, i) => {
      const y = statsY + 32 + i * 22;
      this.add.text(38,  y, s.icon, { fontSize: '13px' }).setDepth(10);
      this.add.text(58,  y, s.label + ':', { fontSize: '12px', color: '#aaaaaa', stroke: '#3d1a00', strokeThickness: 1 }).setDepth(10);
      this.add.text(326, y, s.value,  { fontSize: '13px', color: s.color, fontStyle: 'bold', stroke: '#3d1a00', strokeThickness: 1 }).setOrigin(1, 0).setDepth(10);
    });

    // ── Winnings card ──
    const winningsY = 428;
    const winCard = this.add.graphics().setDepth(9);
    winCard.fillStyle(0x2a1200, 0.95);
    winCard.fillRoundedRect(22, winningsY, 316, 72, 12);
    winCard.lineStyle(1.5, 0x44ff88, 0.65);
    winCard.strokeRoundedRect(22, winningsY, 316, 72, 12);

    this.add.text(38,  winningsY + 12, '💰', { fontSize: '26px' }).setDepth(10);
    this.add.text(74,  winningsY + 14, 'Checkers Winnings', { fontSize: '12px', color: '#aaaaaa', stroke: '#3d1a00', strokeThickness: 1 }).setDepth(10);
    this.add.text(74,  winningsY + 34, `$${checkersWinnings.toFixed(2)}`, {
      fontSize: '22px', color: '#44ff88', fontStyle: 'bold',
      stroke: '#3d1a00', strokeThickness: 2,
    }).setDepth(10);
    this.add.text(260, winningsY + 40, `${winsCount} wins`, {
      fontSize: '12px', color: '#888888', stroke: '#3d1a00', strokeThickness: 1,
    }).setDepth(10);

    // ── Buttons ──
    this.buildButton(90,  578, '← BACK',      false, () => this.scene.start('CheckersStartScene', { username: this.username, uid: this.uid, userData: this.userData }));
    this.buildButton(230, 578, '💰 WALLET',   true,  () => window.open(`https://wintapgames.com/wallet/${this.userData.username}`, '_blank'));
  }

  update(_t: number, delta: number) {
    const dt = delta / 1000;
    this.boardSquares.forEach(s => {
      s.obj.y -= s.drift * dt;
      s.obj.angle += s.drift * 0.3 * dt;
      if (s.obj.y < -20) { s.obj.y = 660; s.obj.x = Phaser.Math.Between(0, 360); }
    });
  }

  private addBackground() {
    this.cameras.main.setBackgroundColor('#0f0800');
    if (this.textures.exists('checkers-bg')) {
      this.add.image(180, 320, 'checkers-bg').setDisplaySize(360, 640).setDepth(-2);
      const d = this.add.graphics().setDepth(-1);
      d.fillStyle(0x000000, 0.72); d.fillRect(0, 0, 360, 640);
    }
    for (let i = 0; i < 10; i++) {
      const size = Phaser.Math.Between(10, 24);
      const sq   = this.add.rectangle(
        Phaser.Math.Between(0,360), Phaser.Math.Between(0,640),
        size, size, i % 2 === 0 ? 0x8b4513 : 0xdeb887,
        Phaser.Math.FloatBetween(0.04, 0.11)
      ).setDepth(0).setAngle(45);
      this.boardSquares.push({ obj: sq, drift: Phaser.Math.FloatBetween(5, 16) });
    }
  }

  private buildButton(x: number, y: number, label: string, primary: boolean, cb: () => void) {
    const hasBtn = this.textures.exists('wood-button');
    let imgObj: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
    if (hasBtn) {
      imgObj = this.add.image(0, 0, 'wood-button').setDisplaySize(148, 42);
      (imgObj as Phaser.GameObjects.Image).setTint(primary ? 0xffdd99 : 0xcc9966);
    } else {
      const g = this.add.graphics();
      g.fillStyle(primary ? 0xd4813a : 0x8b4513, 0.95);
      g.fillRoundedRect(-74,-21,148,42,10);
      imgObj = g;
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