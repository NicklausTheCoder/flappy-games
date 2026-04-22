// src/scenes/ball-crush/BallCrushLobbyScene.ts
import Phaser from 'phaser';
import { ballCrushMultiplayer, BallCrushLobby } from '../../firebase/ballCrushMultiplayer';
import { updateBallCrushWalletBalance } from '../../firebase/ballCrushSimple';

export class BallCrushLobbyScene extends Phaser.Scene {
  private username: string = '';
  private uid: string = '';
  private lobbyId: string = '';
  private lobby: BallCrushLobby | null = null;
  private unsubscribe: (() => void) | null = null;
  private isPlayerReady: boolean = false;
  private gameStarted: boolean = false;
  private hasHandledOpponentLeft: boolean = false;

  // Countdown
  private countdownStartedAt: number = 0;
  private countdownTimer: Phaser.Time.TimerEvent | null = null;
  private readonly COUNTDOWN_DURATION = 3000;

  // Star field (same as other scenes)
  private starLayers: Array<Array<{ obj: Phaser.GameObjects.Arc; speed: number }>> = [];
  private shootingStarTimer!: Phaser.Time.TimerEvent;

  // UI refs
  private statusText!: Phaser.GameObjects.Text;
  private lobbyCodeText!: Phaser.GameObjects.Text;
  private countdownText!: Phaser.GameObjects.Text;

  // Player card refs — kept so we can update them on lobby changes
  private p1NameText!: Phaser.GameObjects.Text;
  private p1ReadyText!: Phaser.GameObjects.Text;
  private p1AvatarText!: Phaser.GameObjects.Text;
  private p1CardGfx!: Phaser.GameObjects.Graphics;

  private p2NameText!: Phaser.GameObjects.Text;
  private p2ReadyText!: Phaser.GameObjects.Text;
  private p2AvatarText!: Phaser.GameObjects.Text;
  private p2CardGfx!: Phaser.GameObjects.Graphics;

  // Ready button container so we can swap it easily
  private readyContainer!: Phaser.GameObjects.Container;
  private readyLabel!: Phaser.GameObjects.Text;
  private readyImg!: Phaser.GameObjects.Image;

  // VS pulse
  private vsPulse!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'BallCrushLobbyScene' });
  }

  // ─── preload ──────────────────────────────────────────────────────────────
  preload() {
    if (!this.textures.exists('btn-orange')) this.load.image('btn-orange', 'assets/button.png');
    if (!this.textures.exists('btn-dark'))   this.load.image('btn-dark',   'assets/button2.png');
  }

  // ─── init ─────────────────────────────────────────────────────────────────
  init(data: { username: string; uid: string; lobbyId: string }) {
    this.username               = data.username;
    this.uid                    = data.uid;
    this.lobbyId                = data.lobbyId;
    this.isPlayerReady          = false;
    this.gameStarted            = false;
    this.hasHandledOpponentLeft = false;
    this.countdownStartedAt     = 0;
    this.lobby                  = null;
  }

  // ─── create ───────────────────────────────────────────────────────────────
  async create() {
    this.addBackground();
    this.buildStaticUI();

    this.unsubscribe = ballCrushMultiplayer.subscribeToLobby(this.lobbyId, (lobby) => {
      this.onLobbyUpdate(lobby);
    });

    const existing = await ballCrushMultiplayer.getLobby(this.lobbyId);
    if (!existing) {
      this.statusText.setText('⏳ Loading lobby...');
      this.time.delayedCall(10_000, () => {
        if (!this.lobby && !this.gameStarted) {
          this.statusText.setText('❌ Lobby not found');
          this.time.delayedCall(2_000, () => {
            this.scene.start('BallCrushStartScene', { username: this.username, uid: this.uid });
          });
        }
      });
    }
  }

  // ─── update ───────────────────────────────────────────────────────────────
  update(_t: number, delta: number) {
    const dt = delta / 1000;
    this.starLayers.forEach(layer =>
      layer.forEach(star => {
        star.obj.y += star.speed * dt;
        if (star.obj.y > 644) { star.obj.y = -4; star.obj.x = Phaser.Math.Between(0, 360); }
      })
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STATIC UI — built once in create()
  // ─────────────────────────────────────────────────────────────────────────
  private buildStaticUI() {
    // ── Title ──
    this.add.text(180, 30, '⚽ BALL CRUSH', {
      fontSize: '26px', color: '#ffaa00', fontStyle: 'bold',
      stroke: '#8b4513', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10);

    // ── Room code ──
    this.lobbyCodeText = this.add.text(180, 58, `Room: ${this.lobbyId.substring(0, 10)}`, {
      fontSize: '11px', color: '#666666',
    }).setOrigin(0.5).setDepth(10);

    // ── Glowing divider line ──
    const div = this.add.graphics().setDepth(10);
    div.lineStyle(1, 0xffaa00, 0.3);
    div.beginPath(); div.moveTo(20, 72); div.lineTo(340, 72); div.strokePath();

    // ── Player cards ──
    this.buildPlayerCards();

    // ── VS badge ──
    this.vsPulse = this.add.text(180, 230, 'VS', {
      fontSize: '28px', color: '#ffaa00', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(12);

    this.tweens.add({
      targets: this.vsPulse,
      scaleX: 1.2, scaleY: 1.2,
      duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // ── Status ──
    this.statusText = this.add.text(180, 350, '⏳ Waiting for opponent...', {
      fontSize: '14px', color: '#ffff00',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(10);

    // ── Countdown ──
    this.countdownText = this.add.text(180, 400, '', {
      fontSize: '72px', color: '#ffaa00', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(15).setVisible(false);

    // ── Ready button ──
    this.buildReadyButton();

    // ── Leave button ──
    this.buildLeaveButton();
  }

  // ─── Player cards ─────────────────────────────────────────────────────────
  private buildPlayerCards() {
    // Card dimensions
    const cW = 145, cH = 185, cR = 14;

    // ── Player 1 (left — always "me") ──
    this.p1CardGfx = this.add.graphics().setDepth(10);
    this.drawCard(this.p1CardGfx, 18, 85, cW, cH, cR, 0x0d2b0d, 0xffaa00);

    // Inner glow strip at top
    const g1 = this.add.graphics().setDepth(11);
    g1.fillStyle(0xffaa00, 0.15);
    g1.fillRoundedRect(18, 85, cW, 32, { tl: cR, tr: cR, bl: 0, br: 0 });

    this.p1AvatarText = this.add.text(90, 122, '⚽', {
      fontSize: '46px',
    }).setOrigin(0.5).setDepth(12);

    this.add.text(90, 155, 'YOU', {
      fontSize: '10px', color: '#ffaa00', fontStyle: 'bold', letterSpacing: 3,
    }).setOrigin(0.5).setDepth(12);

    this.p1NameText = this.add.text(90, 175, this.username, {
      fontSize: '13px', color: '#ffffff', fontStyle: 'bold',
      wordWrap: { width: 130 },
    }).setOrigin(0.5).setDepth(12);

    this.p1ReadyText = this.add.text(90, 210, '⏳ Not Ready', {
      fontSize: '11px', color: '#ff6666',
    }).setOrigin(0.5).setDepth(12);

    // ── Player 2 (right — opponent) ──
    this.p2CardGfx = this.add.graphics().setDepth(10);
    this.drawCard(this.p2CardGfx, 197, 85, cW, cH, cR, 0x0d0d2b, 0x4444ff);

    const g2 = this.add.graphics().setDepth(11);
    g2.fillStyle(0x4455ff, 0.15);
    g2.fillRoundedRect(197, 85, cW, 32, { tl: cR, tr: cR, bl: 0, br: 0 });

    this.p2AvatarText = this.add.text(270, 122, '❓', {
      fontSize: '46px',
    }).setOrigin(0.5).setDepth(12);

    this.add.text(270, 155, 'OPPONENT', {
      fontSize: '10px', color: '#aaaaff', fontStyle: 'bold', letterSpacing: 2,
    }).setOrigin(0.5).setDepth(12);

    this.p2NameText = this.add.text(270, 175, 'Waiting...', {
      fontSize: '13px', color: '#888888',
      wordWrap: { width: 130 },
    }).setOrigin(0.5).setDepth(12);

    this.p2ReadyText = this.add.text(270, 210, '⏳ Not Joined', {
      fontSize: '11px', color: '#666666',
    }).setOrigin(0.5).setDepth(12);
  }

  private drawCard(
    g: Phaser.GameObjects.Graphics,
    x: number, y: number, w: number, h: number, r: number,
    fillColor: number, strokeColor: number
  ) {
    g.clear();
    g.fillStyle(fillColor, 0.92);
    g.fillRoundedRect(x, y, w, h, r);
    g.lineStyle(2, strokeColor, 0.8);
    g.strokeRoundedRect(x, y, w, h, r);
  }

  // ─── Ready button ─────────────────────────────────────────────────────────
  private buildReadyButton() {
    const img   = this.add.image(0, 0, 'btn-dark').setDisplaySize(220, 50);
    this.readyImg = img;
    const label = this.add.text(0, 0, '🔒 WAITING FOR OPPONENT', {
      fontSize: '13px', color: '#888888', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 1,
    }).setOrigin(0.5);
    this.readyLabel = label;

    this.readyContainer = this.add.container(180, 460, [img, label]);
    this.readyContainer.setSize(220, 50).setDepth(20);
    // Not interactive yet — enabled when opponent joins
  }

  // ─── Leave button ─────────────────────────────────────────────────────────
  private buildLeaveButton() {
    const img   = this.add.image(0, 0, 'btn-dark').setDisplaySize(160, 42);
    const label = this.add.text(0, 0, '✖ LEAVE', {
      fontSize: '13px', color: '#ff6666', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 1,
    }).setOrigin(0.5);

    const c = this.add.container(180, 570, [img, label]);
    c.setSize(160, 42).setInteractive({ useHandCursor: true }).setDepth(20);

    c.on('pointerover',  () => { label.setColor('#ff4444'); this.tweens.add({ targets: c, scaleX: 1.05, scaleY: 1.05, duration: 80 }); });
    c.on('pointerout',   () => { label.setColor('#ff6666'); this.tweens.add({ targets: c, scaleX: 1, scaleY: 1, duration: 80 }); });
    c.on('pointerdown',  () => {
      this.tweens.add({ targets: c, scaleX: 0.95, scaleY: 0.95, duration: 60, yoyo: true,
        onComplete: () => this.leaveLobby(),
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LOBBY STATE MACHINE
  // ─────────────────────────────────────────────────────────────────────────
  private onLobbyUpdate(lobby: BallCrushLobby | null) {
    if (!this.scene?.isActive()) return;

    if (!lobby) {
      if (!this.gameStarted) this.statusText.setText('⏳ Loading lobby...');
      return;
    }

    if (lobby.status === 'dead') {
      if (!this.gameStarted && !this.hasHandledOpponentLeft) this.handleOpponentLeft();
      return;
    }

    if (lobby.status === 'playing') {
      if (!this.gameStarted) this.transitionToGame(lobby);
      return;
    }

    this.lobby = lobby;
    const players   = Object.values(lobby.players);
    const playerIds = Object.keys(lobby.players);

    // ── Update my card ──
    const me = lobby.players[this.uid];
    if (me) {
      this.p1NameText.setText(me.displayName || this.username);
      this.p1ReadyText.setText(me.isReady ? '✅ Ready!' : '⏳ Not Ready');
      this.p1ReadyText.setColor(me.isReady ? '#00ff88' : '#ff6666');
      this.p1AvatarText.setColor(me.isReady ? '#00ff88' : '#ffffff');
      // Flash card border green when ready
      this.drawCard(this.p1CardGfx, 18, 85, 145, 185, 14,
        0x0d2b0d, me.isReady ? 0x00ff88 : 0xffaa00);
    }

    if (players.length < 2) {
      this.p2NameText.setText('Waiting...').setColor('#666666');
      this.p2AvatarText.setText('❓');
      this.p2ReadyText.setText('⏳ Not Joined').setColor('#666666');
      this.statusText.setText('⏳ Waiting for opponent to join...');
      this.setReadyButtonLocked();
      return;
    }

    // ── Update opponent card ──
    const myIndex       = playerIds.indexOf(this.uid);
    const opponentIndex = myIndex === 0 ? 1 : 0;
    const opp           = players[opponentIndex];

    this.p2NameText.setText(opp.displayName).setColor('#ffffff');
    this.p2AvatarText.setText('⚽');
    this.p2AvatarText.setColor(opp.isReady ? '#00ff88' : '#ffffff');
    this.p2ReadyText.setText(opp.isReady ? '✅ Ready!' : '⏳ Not Ready');
    this.p2ReadyText.setColor(opp.isReady ? '#00ff88' : '#ff6666');
    this.drawCard(this.p2CardGfx, 197, 85, 145, 185, 14,
      0x0d0d2b, opp.isReady ? 0x00ff88 : 0x4444ff);

    const bothReady = players.every(p => p.isReady);

    if (!bothReady) {
      this.statusText.setText('⏳ Waiting for both players to ready up...');
      this.stopCountdown();
      if (!this.isPlayerReady) this.setReadyButtonActive();
      else                      this.setReadyButtonWaiting();
      return;
    }

    // ── Both ready ──
    this.statusText.setText('✅ Both players ready!');
    this.setReadyButtonWaiting();

    const isHost = lobby.playerIds[0] === this.uid;
    if (lobby.status === 'waiting' && isHost) {
      ballCrushMultiplayer.markLobbyReadyWithTimestamp(this.lobbyId, Date.now()).catch(console.error);
    }

    const ts = (lobby as any).countdownStartedAt as number | undefined;
    if (ts) this.startCountdownFromTimestamp(ts);
  }

  // ─── Countdown ────────────────────────────────────────────────────────────
  private startCountdownFromTimestamp(countdownStartedAt: number) {
    if (this.countdownStartedAt === countdownStartedAt && this.countdownTimer) return;

    this.stopCountdown();
    this.countdownStartedAt = countdownStartedAt;

    const remaining = this.COUNTDOWN_DURATION - (Date.now() - countdownStartedAt);
    if (remaining <= 0) return;

    this.countdownText.setVisible(true);
    this.readyContainer.setVisible(false);

    this.countdownTimer = this.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => {
        const left = this.COUNTDOWN_DURATION - (Date.now() - countdownStartedAt);

        if (left <= 0) {
          this.countdownText.setText('GO!');
          this.stopCountdown();

          if (this.lobby && !this.gameStarted) {
            const isHost = this.lobby.playerIds[0] === this.uid;
            if (isHost) ballCrushMultiplayer.startGame(this.lobbyId).catch(console.error);
          }
          return;
        }

        const secondsLeft = Math.ceil(left / 1000);
        this.countdownText.setText(`${secondsLeft}`);

        // Punch scale on each new number
        this.tweens.add({
          targets: this.countdownText,
          scaleX: 1.4, scaleY: 1.4,
          duration: 120, yoyo: true, ease: 'Sine.easeOut',
        });

        // Flash both cards
        this.tweens.add({
          targets: [this.p1CardGfx, this.p2CardGfx],
          alpha: 0.6, duration: 100, yoyo: true,
        });
      },
    });
  }

  private stopCountdown() {
    if (this.countdownTimer) { this.countdownTimer.destroy(); this.countdownTimer = null; }
    if (this.countdownText)  { this.countdownText.setVisible(false).setText(''); }
    if (this.readyContainer) { this.readyContainer.setVisible(true); }
  }

  // ─── Ready button states ──────────────────────────────────────────────────
  private setReadyButtonLocked() {
    this.readyImg.setTexture('btn-dark');
    this.readyLabel.setText('🔒 WAITING FOR OPPONENT').setColor('#666666');
    this.readyContainer.disableInteractive();
    this.readyContainer.removeAllListeners();
  }

  private setReadyButtonActive() {
    this.readyImg.setTexture('btn-orange');
    this.readyLabel.setText('✅ TAP TO READY UP').setColor('#ffffff');
    this.readyContainer.setInteractive({ useHandCursor: true });
    this.readyContainer.removeAllListeners();

    this.readyContainer.on('pointerover', () => {
      this.readyLabel.setColor('#ffff00');
      this.tweens.add({ targets: this.readyContainer, scaleX: 1.06, scaleY: 1.06, duration: 80 });
    });
    this.readyContainer.on('pointerout', () => {
      this.readyLabel.setColor('#ffffff');
      this.tweens.add({ targets: this.readyContainer, scaleX: 1, scaleY: 1, duration: 80 });
    });
    this.readyContainer.on('pointerdown', () => {
      this.tweens.add({
        targets: this.readyContainer, scaleX: 0.95, scaleY: 0.95,
        duration: 60, yoyo: true, onComplete: () => this.setReady(),
      });
    });

    // Pulse to draw attention
    this.tweens.add({
      targets: this.readyContainer,
      scaleX: 1.04, scaleY: 1.04,
      duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  private setReadyButtonWaiting() {
    this.readyImg.setTexture('btn-dark');
    this.readyLabel.setText('✅ READY! Waiting...').setColor('#00ff88');
    this.readyContainer.disableInteractive();
    this.readyContainer.removeAllListeners();
    this.tweens.killTweensOf(this.readyContainer);
    this.readyContainer.setScale(1);
  }

  private async setReady() {
    if (!this.lobby || this.isPlayerReady) return;
    this.isPlayerReady = true;
    this.setReadyButtonWaiting();

    // Card bounce
    this.tweens.add({
      targets: this.p1CardGfx, scaleX: 1.06, scaleY: 1.06,
      duration: 180, yoyo: true, ease: 'Sine.easeOut',
    });

    await ballCrushMultiplayer.setPlayerReady(this.lobbyId, this.uid, true);
  }

  // ─── Game transition ──────────────────────────────────────────────────────
  private transitionToGame(lobby: BallCrushLobby) {
    if (this.gameStarted) return;
    this.gameStarted = true;

    this.stopCountdown();

    // Flash the whole screen white then fade to black → game
    this.cameras.main.flash(300, 255, 255, 255);
    this.cameras.main.once('cameraflashcomplete', () => {
      if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null; }

      this.cameras.main.fadeOut(500, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        const myRole: 'bottom' | 'top' = lobby.playerIds[0] === this.uid ? 'bottom' : 'top';
        this.scene.start('BallCrushGameScene', {
          username: this.username,
          uid:      this.uid,
          lobbyId:  this.lobbyId,
          role:     myRole,
        });
      });
    });
  }

  // ─── Opponent left ────────────────────────────────────────────────────────
  private async handleOpponentLeft() {
    if (this.hasHandledOpponentLeft) return;
    this.hasHandledOpponentLeft = true;

    this.stopCountdown();
    if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null; }

    await ballCrushMultiplayer.markLobbyDead(this.lobbyId);

    await updateBallCrushWalletBalance(
      this.uid, 1.00, 'refund', 'Opponent left lobby'
    );

    await ballCrushMultiplayer.setPlayerQueueStatus(this.uid, false);

    // Show refund popup
    this.showRefundPopup();
  }

  private showRefundPopup() {
    // Dim overlay
    const overlay = this.add.graphics().setDepth(30);
    overlay.fillStyle(0x000000, 0.75);
    overlay.fillRect(0, 0, 360, 640);

    // Card
    const card = this.add.graphics().setDepth(31);
    card.fillStyle(0x0d1a0d, 0.98);
    card.fillRoundedRect(40, 220, 280, 180, 16);
    card.lineStyle(2, 0xff4444, 0.9);
    card.strokeRoundedRect(40, 220, 280, 180, 16);

    this.add.text(180, 258, '😞', { fontSize: '36px' }).setOrigin(0.5).setDepth(32);
    this.add.text(180, 304, 'Opponent Left', {
      fontSize: '20px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(32);
    this.add.text(180, 330, '$1.00 has been refunded', {
      fontSize: '14px', color: '#00ff88',
    }).setOrigin(0.5).setDepth(32);
    this.add.text(180, 354, 'Returning to menu...', {
      fontSize: '12px', color: '#888888',
    }).setOrigin(0.5).setDepth(32);

    // Animate the refund text upward
    const refundFly = this.add.text(180, 330, '+$1.00 REFUNDED', {
      fontSize: '16px', color: '#00ff88', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(33).setAlpha(0);

    this.tweens.add({
      targets: refundFly, y: 290, alpha: 1,
      duration: 600, ease: 'Sine.easeOut',
      onComplete: () => {
        this.tweens.add({ targets: refundFly, alpha: 0, duration: 400, delay: 800 });
      },
    });

    this.time.delayedCall(3000, () => {
      this.scene.start('BallCrushStartScene', { username: this.username, uid: this.uid });
    });
  }

  // ─── Leave lobby ──────────────────────────────────────────────────────────
  private async leaveLobby() {
    this.stopCountdown();
    if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null; }

    this.statusText.setText('👋 Leaving...');

    await ballCrushMultiplayer.setPlayerQueueStatus(this.uid, false);
    await ballCrushMultiplayer.cancelFromLobby(this.lobbyId, this.uid);

    this.scene.start('BallCrushStartScene', { username: this.username, uid: this.uid });
  }

  // ─── Background ───────────────────────────────────────────────────────────
  private addBackground() {
    if (this.textures.exists('ball-background')) {
      this.add.image(180, 320, 'ball-background').setDisplaySize(360, 640).setDepth(-10);
    } else {
      this.cameras.main.setBackgroundColor('#05050f');
    }
    this.createStarField();
    this.scheduleShootingStars();
  }

  private createStarField() {
    const defs = [
      { count: 80, radius: 1,   speedMin: 14, speedMax: 22, alphaMin: 0.20, alphaMax: 0.40, color: 0xaabbff },
      { count: 45, radius: 1.4, speedMin: 32, speedMax: 46, alphaMin: 0.45, alphaMax: 0.70, color: 0xddeeff },
      { count: 20, radius: 2,   speedMin: 62, speedMax: 82, alphaMin: 0.75, alphaMax: 1.00, color: 0xffffff },
    ];
    this.starLayers = [];
    defs.forEach((def, li) => {
      const layer: typeof this.starLayers[0] = [];
      for (let i = 0; i < def.count; i++) {
        const alpha = Phaser.Math.FloatBetween(def.alphaMin, def.alphaMax);
        const obj   = this.add.circle(
          Phaser.Math.Between(0, 360), Phaser.Math.Between(0, 640),
          def.radius, def.color, alpha
        ).setDepth(-5 + li);
        if (li === 2) {
          this.tweens.add({
            targets: obj, alpha: alpha * 0.4,
            duration: Phaser.Math.Between(600, 1400),
            yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
            delay: Phaser.Math.Between(0, 1200),
          });
        }
        layer.push({ obj, speed: Phaser.Math.FloatBetween(def.speedMin, def.speedMax) });
      }
      this.starLayers.push(layer);
    });
  }

  private scheduleShootingStars() {
    const next = () => {
      this.shootingStarTimer = this.time.delayedCall(
        Phaser.Math.Between(4000, 9000), () => { this.spawnShootingStar(); next(); }
      );
    };
    next();
  }

  private spawnShootingStar() {
    const length = Phaser.Math.Between(60, 120);
    const angle  = Phaser.Math.DegToRad(Phaser.Math.Between(20, 45));
    const dx = Math.cos(angle) * length, dy = Math.sin(angle) * length;
    const sx = Phaser.Math.Between(20, 340), sy = Phaser.Math.Between(20, 180);
    const g  = this.add.graphics().setDepth(-2);
    let prog = 0;
    const dur = Phaser.Math.Between(500, 900);
    const t = this.time.addEvent({
      delay: 16, loop: true, callback: () => {
        prog = Math.min(prog + 16 / dur, 1);
        g.clear();
        g.lineStyle(1, 0xffffff, 0.15); g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + dx * prog * 0.6, sy + dy * prog * 0.6); g.strokePath();
        g.lineStyle(1, 0xddeeff, 0.45); g.beginPath(); g.moveTo(sx + dx * prog * 0.3, sy + dy * prog * 0.3); g.lineTo(sx + dx * prog, sy + dy * prog); g.strokePath();
        g.lineStyle(2, 0xffffff, 0.9);  g.beginPath(); g.moveTo(sx + dx * prog * 0.8, sy + dy * prog * 0.8); g.lineTo(sx + dx * prog, sy + dy * prog); g.strokePath();
        if (prog >= 1) { t.destroy(); this.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() }); }
      },
    });
  }

  // ─── Shutdown ─────────────────────────────────────────────────────────────
  shutdown() {
    this.stopCountdown();
    if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null; }
    if (this.shootingStarTimer) this.shootingStarTimer.destroy();
  }
}