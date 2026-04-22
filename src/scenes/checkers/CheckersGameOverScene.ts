// src/scenes/checkers/CheckersGameOverScene.ts
import Phaser from 'phaser';
import { CheckersUserData, updateCheckersStats, saveCheckersGame } from '../../firebase/checkersService';

export class CheckersGameOverScene extends Phaser.Scene {
  private userData!:       CheckersUserData;
  private username:        string = '';
  private uid:             string = '';
  private winner:          'red' | 'black' = 'red';
  private playerColor:     'red' | 'black' = 'red';
  private piecesCaptured:  number = 0;
  private kingsMade:       number = 0;
  private moves:           number = 0;
  private gameDuration:    number = 0;

  // Board square drifters
  private boardSquares: Array<{ obj: Phaser.GameObjects.Rectangle; drift: number }> = [];

  constructor() {
    super({ key: 'CheckersGameOverScene' });
  }

  init(data: {
    userData: CheckersUserData | null; username?: string; uid?: string;
    winner: 'red' | 'black'; playerColor: 'red' | 'black';
    piecesCaptured: number; kingsMade: number; moves: number; gameDuration: number;
  }) {
    if (!data || (!data.userData && !data.uid)) { this.scene.start('CheckersStartScene'); return; }

    this.userData = data.userData || {
      username: data.username || 'Player', displayName: data.username || 'Player',
      gamesPlayed: 0, gamesWon: 0, gamesLost: 0,
    } as CheckersUserData;

    this.username       = data.username     || this.userData.username || '';
    this.uid            = data.uid          || this.userData.uid      || '';
    this.winner         = data.winner;
    this.playerColor    = data.playerColor;
    this.piecesCaptured = data.piecesCaptured || 0;
    this.kingsMade      = data.kingsMade      || 0;
    this.moves          = data.moves          || 0;
    this.gameDuration   = data.gameDuration   || 0;
    this.boardSquares   = [];

    this.storeGameResult();
  }

  private async storeGameResult() {
    try {
      if (!this.uid) return;
      const playerWon = this.playerColor === this.winner;
      await updateCheckersStats(this.uid, playerWon, this.piecesCaptured, this.kingsMade, this.moves);
      await saveCheckersGame({
        winner: this.winner,
        playerRed:   this.playerColor === 'red'   ? this.username : 'Opponent',
        playerBlack: this.playerColor === 'black' ? this.username : 'Opponent',
        moves: this.moves, piecesCaptured: this.piecesCaptured,
        date: new Date().toISOString(), timestamp: Date.now(),
      });
    } catch (err) { console.error('❌ Error saving game:', err); }
  }

  create() {
    this.addBackground();

    const playerWon = this.playerColor === this.winner;

    // ── Confetti for win ──
    if (playerWon) this.spawnConfetti();

    // ── Title ──
    const titleBg = this.add.graphics().setDepth(9);
    titleBg.fillStyle(0x2a1200, 0.95);
    titleBg.fillRoundedRect(24, 18, 312, 64, 14);
    titleBg.lineStyle(2, playerWon ? 0xffaa00 : 0xaa4444, 0.9);
    titleBg.strokeRoundedRect(24, 18, 312, 64, 14);

    this.add.text(180, 36, 'GAME OVER', {
      fontSize: '26px', color: playerWon ? '#ffaa00' : '#ff6666', fontStyle: 'bold',
      stroke: '#3d1a00', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(10);

    this.add.text(180, 66, playerWon ? 'YOU WIN!' : 'YOU LOSE', {
      fontSize: '13px', color: playerWon ? '#ffaa00' : '#ff6666', letterSpacing: 5,
      stroke: '#3d1a00', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(10);

    // ── Result card ──
    this.buildResultCard(playerWon);

    // ── Game stats card ──
    this.buildStatsCard();

    // ── Career card ──
    this.buildCareerCard();

    // ── Buttons ──
    this.buildButtons();
  }

  update(_t: number, delta: number) {
    const dt = delta / 1000;
    this.boardSquares.forEach(s => {
      s.obj.y -= s.drift * dt;
      s.obj.angle += s.drift * 0.3 * dt;
      if (s.obj.y < -20) { s.obj.y = 660; s.obj.x = Phaser.Math.Between(0, 360); }
    });
  }

  // ─── Background ────────────────────────────────────────────────────────────
  private addBackground() {
    this.cameras.main.setBackgroundColor('#0f0800');

    if (this.textures.exists('checkers-bg')) {
      this.add.image(180, 320, 'checkers-bg').setDisplaySize(360, 640).setDepth(-2);
      const dim = this.add.graphics().setDepth(-1);
      dim.fillStyle(0x000000, 0.72);
      dim.fillRect(0, 0, 360, 640);
    }

    for (let i = 0; i < 12; i++) {
      const size  = Phaser.Math.Between(10, 26);
      const sq = this.add.rectangle(
        Phaser.Math.Between(0, 360), Phaser.Math.Between(0, 640),
        size, size, i % 2 === 0 ? 0x8b4513 : 0xdeb887,
        Phaser.Math.FloatBetween(0.04, 0.12)
      ).setDepth(0).setAngle(45);
      this.boardSquares.push({ obj: sq, drift: Phaser.Math.FloatBetween(5, 18) });
    }
  }

  // ─── Cards ─────────────────────────────────────────────────────────────────
  private buildResultCard(playerWon: boolean) {
    const card = this.add.graphics().setDepth(9);
    card.fillStyle(0x2a1200, 0.95);
    card.fillRoundedRect(22, 98, 316, 110, 14);
    card.lineStyle(2, playerWon ? 0xffaa00 : 0xaa4444, 0.85);
    card.strokeRoundedRect(22, 98, 316, 110, 14);

    // Big piece showing winner's colour
    const pieceColor  = this.winner === 'red' ? 0xcc2200 : 0x222222;
    const pieceLight  = this.winner === 'red' ? 0xdd3300 : 0x444444;
    this.add.circle(180, 138, 28, 0x3d1a00,   1).setDepth(10);
    this.add.circle(180, 138, 24, pieceColor,  1).setDepth(11);
    this.add.circle(180, 138, 16, pieceLight,  1).setDepth(12);
    this.add.circle(171, 130,  6, 0xffffff, 0.22).setDepth(13);

    if (playerWon) {
      // Crown on the piece
      this.add.text(180, 138, '♛', {
        fontSize: '18px', color: '#ffaa00',
        stroke: '#3d1a00', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(14);
    }

    this.add.text(180, 170, `${this.winner.toUpperCase()} WINS`, {
      fontSize: '13px', color: this.winner === 'red' ? '#ff8866' : '#aaaaaa',
      stroke: '#3d1a00', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(10);

    if (playerWon) {
      // Animated prize
      const prize = this.add.text(180, 194, '+$1.50', {
        fontSize: '22px', color: '#44ff88', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(12);

      this.tweens.add({
        targets: prize, y: 170, alpha: 0, duration: 2200, ease: 'Power2',
        delay: 600, onComplete: () => prize.destroy(),
      });
    }
  }

  private buildStatsCard() {
    const card = this.add.graphics().setDepth(9);
    card.fillStyle(0x2a1200, 0.92);
    card.fillRoundedRect(22, 220, 316, 118, 12);
    card.lineStyle(1.5, 0xffaa00, 0.55);
    card.strokeRoundedRect(22, 220, 316, 118, 12);

    this.add.text(180, 233, 'GAME STATS', {
      fontSize: '11px', color: '#ffaa00', letterSpacing: 3,
      stroke: '#3d1a00', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(10);

    const stats = [
      { label: 'Pieces captured', value: this.piecesCaptured.toString(), color: '#ffaa00' },
      { label: 'Kings made',      value: this.kingsMade.toString(),      color: '#ffff88' },
      { label: 'Total moves',     value: this.moves.toString(),           color: '#ffffff' },
    ];

    const mins = Math.floor(this.gameDuration / 60);
    const secs = this.gameDuration % 60;
    stats.push({ label: 'Duration', value: `${mins}m ${secs}s`, color: '#ccaa88' });

    stats.forEach((s, i) => {
      const y = 252 + i * 24;
      this.add.text(40,  y, s.label + ':', { fontSize: '13px', color: '#aaaaaa', stroke: '#3d1a00', strokeThickness: 1 }).setDepth(10);
      this.add.text(320, y, s.value, { fontSize: '15px', color: s.color, fontStyle: 'bold', stroke: '#3d1a00', strokeThickness: 1 }).setOrigin(1, 0).setDepth(10);
    });
  }

  private buildCareerCard() {
    const card = this.add.graphics().setDepth(9);
    card.fillStyle(0x2a1200, 0.92);
    card.fillRoundedRect(22, 350, 316, 106, 12);
    card.lineStyle(1.5, 0xffaa00, 0.55);
    card.strokeRoundedRect(22, 350, 316, 106, 12);

    this.add.text(180, 363, 'CAREER STATS', {
      fontSize: '11px', color: '#ffaa00', letterSpacing: 3,
      stroke: '#3d1a00', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(10);

    const winRate = this.userData.gamesPlayed > 0
      ? Math.round((this.userData.gamesWon / this.userData.gamesPlayed) * 100)
      : 0;

    const stats = [
      { label: 'Games played', value: this.userData.gamesPlayed.toString(), color: '#ffffff' },
      { label: 'Games won',    value: this.userData.gamesWon.toString(),    color: '#44ff88' },
      { label: 'Win rate',     value: `${winRate}%`,                        color: winRate >= 50 ? '#44ff88' : '#ffaa44' },
    ];

    stats.forEach((s, i) => {
      const y = 382 + i * 24;
      this.add.text(40,  y, s.label + ':', { fontSize: '13px', color: '#aaaaaa', stroke: '#3d1a00', strokeThickness: 1 }).setDepth(10);
      this.add.text(320, y, s.value, { fontSize: '15px', color: s.color, fontStyle: 'bold', stroke: '#3d1a00', strokeThickness: 1 }).setOrigin(1, 0).setDepth(10);
    });
  }

  // ─── Buttons ───────────────────────────────────────────────────────────────
  private buildButtons() {
    const hasBtn  = this.textures.exists('wood-button');
    const cx      = 180;
    const btns = [
      { label: '🔍  FIND MATCH',  y: 488, primary: true,  action: 'match' },
      { label: '🏠  MAIN MENU',   y: 542, primary: false, action: 'menu' },
    ];

    btns.forEach(def => {
      let imgObj: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
      if (hasBtn) {
        imgObj = this.add.image(0, 0, 'wood-button').setDisplaySize(220, 46);
        (imgObj as Phaser.GameObjects.Image).setTint(def.primary ? 0xffdd99 : 0xcc9966);
      } else {
        const g = this.add.graphics();
        g.fillStyle(def.primary ? 0xd4813a : 0x8b4513, 0.95);
        g.fillRoundedRect(-110,-23,220,46,10);
        g.lineStyle(2, def.primary ? 0xffdd99 : 0xffaa00, 0.85);
        g.strokeRoundedRect(-110,-23,220,46,10);
        imgObj = g;
      }

      const lbl = this.add.text(0, 0, def.label, {
        fontSize: '15px', color: '#3d1a00', fontStyle: 'bold', stroke: '#8b4513', strokeThickness: 1,
      }).setOrigin(0.5);

      const c = this.add.container(cx, def.y, [imgObj as any, lbl]);
      c.setSize(220, 46).setInteractive({ useHandCursor: true }).setDepth(20);

      c.on('pointerover',  () => { lbl.setColor('#ffaa00'); this.tweens.add({ targets:c, scaleX:1.05, scaleY:1.05, duration:75 }); });
      c.on('pointerout',   () => { lbl.setColor('#3d1a00'); this.tweens.add({ targets:c, scaleX:1,    scaleY:1,    duration:75 }); });
      c.on('pointerdown',  () => {
        this.tweens.add({ targets:c, scaleX:0.95, scaleY:0.95, duration:55, yoyo:true, onComplete:()=>{
          if (def.action === 'match') {
            this.scene.start('CheckersMatchmakingScene', { username: this.username, uid: this.uid });
          } else {
            this.scene.start('CheckersStartScene', { username: this.username, uid: this.uid, userData: this.userData });
          }
        }});
      });
    });
  }

  // ─── Confetti ──────────────────────────────────────────────────────────────
  private spawnConfetti() {
    const colors = [0xffaa00, 0xcc2200, 0xffeedd, 0xddbb88, 0xff6600, 0xffd700];
    for (let i = 0; i < 32; i++) {
      const sq = this.add.rectangle(
        Phaser.Math.Between(20, 340),
        Phaser.Math.Between(-40, -10),
        Phaser.Math.Between(5, 12),
        Phaser.Math.Between(5, 12),
        colors[Phaser.Math.Between(0, colors.length - 1)],
        1
      ).setDepth(15).setAngle(Phaser.Math.Between(0, 90));

      this.tweens.add({
        targets:  sq,
        y:        680,
        x:        sq.x + Phaser.Math.Between(-60, 60),
        angle:    sq.angle + Phaser.Math.Between(-360, 360),
        alpha:    0,
        duration: Phaser.Math.Between(1800, 3200),
        ease:     'Power1',
        delay:    Phaser.Math.Between(0, 800),
        onComplete: () => sq.destroy(),
      });
    }
  }
}