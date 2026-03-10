// src/scenes/ball-crush/BallCrushGameScene.ts
import Phaser from 'phaser';
import { multiplayer, Lobby } from '../../firebase/multiplayerQueries';

export class BallCrushGameScene extends Phaser.Scene {
  private username: string = '';
  private uid: string = '';
  private lobbyId: string = '';
  private lobby: Lobby | null = null;
  private unsubscribe: (() => void) | null = null;
  
  // Game objects
  private player1!: Phaser.GameObjects.Image; // Bottom player
  private player2!: Phaser.GameObjects.Image; // Top player
  private ball!: Phaser.GameObjects.Image;
  private ballVelocity: { x: number; y: number } = { x: 3, y: 3 };
  
  // UI Elements
  private player1ScoreText!: Phaser.GameObjects.Text;
  private player2ScoreText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private gameTime: number = 0;
  
  // Game state
  private player1Score: number = 0;
  private player2Score: number = 0;
  private gameActive: boolean = true;
  
  // Controls
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private moveSpeed: number = 5;
  
  constructor() {
    super({ key: 'BallCrushGameScene' });
  }
  
  init(data: { username: string; uid: string; lobbyId: string; lobby: Lobby }) {
    this.username = data.username;
    this.uid = data.uid;
    this.lobbyId = data.lobbyId;
    this.lobby = data.lobby;
    
    console.log('⚽ BallCrushGameScene started for:', this.username);
  }
  
  create() {
    // Background
    this.cameras.main.setBackgroundColor('#1a3a1a');
    this.addBackgroundEffects();
    
    // Create players
    this.createPlayers();
    
    // Create ball
    this.createBall();
    
    // Create UI
    this.createUI();
    
    // Set up input
    this.setupInput();
    
    // Subscribe to lobby updates for multiplayer sync
    this.unsubscribe = multiplayer.subscribeToLobby(this.lobbyId, (lobby) => {
      this.onGameUpdate(lobby);
    });
  }
  
  private createPlayers() {
    // Get player positions from lobby
    const players = Object.values(this.lobby!.players);
    const me = players.find(p => p.uid === this.uid)!;
    const opponent = players.find(p => p.uid !== this.uid)!;
    
    // Determine who is top and who is bottom based on UID
    const isPlayer1 = this.uid === this.lobby!.playerIds[0];
    
    // Player 1 (Bottom) - using player sprite
    this.player1 = this.add.image(180, 550, 'player');
    this.player1.setScale(0.4);
    this.player1.setTint(isPlayer1 ? 0x00ff00 : 0xff0000); // Green for current player, red for opponent
    
    // Player 2 (Top) - using player sprite
    this.player2 = this.add.image(180, 90, 'player');
    this.player2.setScale(0.4);
    this.player2.setTint(!isPlayer1 ? 0x00ff00 : 0xff0000);
    
    // Add player names
    this.add.text(180, 590, isPlayer1 ? 'YOU' : opponent.displayName, {
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);
    
    this.add.text(180, 50, !isPlayer1 ? 'YOU' : opponent.displayName, {
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);
    
    // Add boundaries for players
    this.player1.setCollideWorldBounds(true);
    this.player2.setCollideWorldBounds(true);
    
    // Set immovable for collision
    (this.player1.body as Phaser.Physics.Arcade.Body)?.setImmovable(true);
    (this.player2.body as Phaser.Physics.Arcade.Body)?.setImmovable(true);
  }
  
  private createBall() {
    this.ball = this.add.image(180, 320, 'ball');
    this.ball.setScale(0.3);
    
    // Add physics to ball
    this.physics.world.enable(this.ball);
    (this.ball.body as Phaser.Physics.Arcade.Body).setVelocity(this.ballVelocity.x, this.ballVelocity.y);
    (this.ball.body as Phaser.Physics.Arcade.Body).setBounce(1, 1);
    (this.ball.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);
    
    // Add collision with players
    this.physics.add.collider(this.ball, this.player1, this.hitPlayer1, undefined, this);
    this.physics.add.collider(this.ball, this.player2, this.hitPlayer2, undefined, this);
    
    // Add ball trail effect
    this.addBallTrail();
  }
  
  private addBallTrail() {
    // Create a trail of fading balls
    for (let i = 1; i <= 3; i++) {
      const trail = this.add.image(180, 320, 'ball');
      trail.setScale(0.2);
      trail.setAlpha(0.3 / i);
      trail.setTint(0xffaa00);
      
      this.tweens.add({
        targets: trail,
        alpha: 0,
        duration: 500,
        repeat: -1
      });
    }
  }
  
  private hitPlayer1(ball: any, player: any) {
    if (!this.gameActive) return;
    
    // Play hit sound (if available)
    // this.sound.play('hit');
    
    // Add visual feedback
    this.tweens.add({
      targets: this.player1,
      scale: 0.5,
      duration: 100,
      yoyo: true
    });
    
    // Randomize ball direction slightly for unpredictability
    const velocity = ball.body.velocity;
    velocity.x += Phaser.Math.Between(-1, 1);
    velocity.y = Math.abs(velocity.y) * -1; // Send ball upward
    
    // Update ball velocity
    ball.body.setVelocity(velocity.x, velocity.y);
  }
  
  private hitPlayer2(ball: any, player: any) {
    if (!this.gameActive) return;
    
    // Play hit sound (if available)
    // this.sound.play('hit');
    
    // Add visual feedback
    this.tweens.add({
      targets: this.player2,
      scale: 0.5,
      duration: 100,
      yoyo: true
    });
    
    // Randomize ball direction slightly for unpredictability
    const velocity = ball.body.velocity;
    velocity.x += Phaser.Math.Between(-1, 1);
    velocity.y = Math.abs(velocity.y); // Send ball downward
    
    // Update ball velocity
    ball.body.setVelocity(velocity.x, velocity.y);
  }
  
  private createUI() {
    // Score display
    this.player1ScoreText = this.add.text(90, 30, '0', {
      fontSize: '32px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    
    this.player2ScoreText = this.add.text(270, 30, '0', {
      fontSize: '32px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    
    // VS text
    this.add.text(180, 30, 'VS', {
      fontSize: '24px',
      color: '#ffaa00',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    
    // Timer
    this.timerText = this.add.text(180, 610, '2:00', {
      fontSize: '20px',
      color: '#ffffff'
    }).setOrigin(0.5);
    
    // Middle line (net)
    const line = this.add.graphics();
    line.lineStyle(2, 0xffaa00, 0.5);
    line.lineBetween(0, 320, 360, 320);
    
    // Dashed line effect
    for (let i = 0; i < 360; i += 20) {
      const dash = this.add.graphics();
      dash.lineStyle(2, 0xffffff, 0.3);
      dash.lineBetween(i, 320, i + 10, 320);
    }
  }
  
  private setupInput() {
    // Keyboard controls
    this.cursors = this.input.keyboard!.createCursorKeys();
    
    // Touch controls for mobile
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) {
        this.movePlayerWithPointer(pointer);
      }
    });
    
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.movePlayerWithPointer(pointer);
    });
  }
  
  private movePlayerWithPointer(pointer: Phaser.Input.Pointer) {
    // Move current player based on pointer position
    const isPlayer1 = this.uid === this.lobby!.playerIds[0];
    const currentPlayer = isPlayer1 ? this.player1 : this.player2;
    
    // Constrain to screen width
    let newX = Phaser.Math.Clamp(pointer.x, 50, 310);
    currentPlayer.x = newX;
    
    // Send position update to opponent
    multiplayer.updatePosition(this.lobbyId, this.uid, newX, currentPlayer.y);
  }
  
  private onGameUpdate(lobby: Lobby | null) {
    if (!lobby) return;
    
    this.lobby = lobby;
    
    // Update opponent position
    const opponent = Object.values(lobby.players).find(p => p.uid !== this.uid);
    if (opponent) {
      const isPlayer1 = this.uid === this.lobby!.playerIds[0];
      const opponentPlayer = isPlayer1 ? this.player2 : this.player1;
      opponentPlayer.x = opponent.position.x;
    }
    
    // Update scores if available
    if (lobby.players[this.lobby!.playerIds[0]]?.score !== undefined) {
      this.player1Score = lobby.players[this.lobby!.playerIds[0]].score;
      this.player2Score = lobby.players[this.lobby!.playerIds[1]].score;
      this.player1ScoreText.setText(this.player1Score.toString());
      this.player2ScoreText.setText(this.player2Score.toString());
    }
  }
  
  update(time: number, delta: number) {
    if (!this.gameActive) return;
    
    // Update timer
    this.gameTime += delta;
    const remaining = Math.max(0, 120 - Math.floor(this.gameTime / 1000));
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    this.timerText.setText(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    
    // End game when timer reaches 0
    if (remaining <= 0) {
      this.endGame();
    }
    
    // Keyboard controls for current player
    const isPlayer1 = this.uid === this.lobby!.playerIds[0];
    const currentPlayer = isPlayer1 ? this.player1 : this.player2;
    
    if (this.cursors.left?.isDown) {
      currentPlayer.x = Math.max(50, currentPlayer.x - this.moveSpeed);
      multiplayer.updatePosition(this.lobbyId, this.uid, currentPlayer.x, currentPlayer.y);
    }
    if (this.cursors.right?.isDown) {
      currentPlayer.x = Math.min(310, currentPlayer.x + this.moveSpeed);
      multiplayer.updatePosition(this.lobbyId, this.uid, currentPlayer.x, currentPlayer.y);
    }
    
    // Check if ball passed a player (score)
    this.checkScore();
  }
  
  private checkScore() {
    const ballY = this.ball.y;
    
    // Player 1 (bottom) missed - ball went below
    if (ballY > 620) {
      this.player2Score++;
      this.player2ScoreText.setText(this.player2Score.toString());
      this.resetBall('top');
      
      // Send score update
      multiplayer.playerDied(this.lobbyId, this.lobby!.playerIds[0], this.lobby!.playerIds[1]);
    }
    
    // Player 2 (top) missed - ball went above
    if (ballY < 20) {
      this.player1Score++;
      this.player1ScoreText.setText(this.player1Score.toString());
      this.resetBall('bottom');
      
      // Send score update
      multiplayer.playerDied(this.lobbyId, this.lobby!.playerIds[1], this.lobby!.playerIds[0]);
    }
  }
  
  private resetBall(direction: 'top' | 'bottom') {
    // Reset ball position
    this.ball.x = 180;
    this.ball.y = 320;
    
    // Set initial velocity based on who scored
    const speed = 4;
    if (direction === 'top') {
      // Ball goes toward top player (player 2)
      this.ballVelocity = { x: Phaser.Math.Between(-3, 3), y: -speed };
    } else {
      // Ball goes toward bottom player (player 1)
      this.ballVelocity = { x: Phaser.Math.Between(-3, 3), y: speed };
    }
    
    (this.ball.body as Phaser.Physics.Arcade.Body).setVelocity(this.ballVelocity.x, this.ballVelocity.y);
    
    // Add a brief pause before ball moves
    this.gameActive = false;
    this.time.delayedCall(1000, () => {
      this.gameActive = true;
    });
  }
  
  private endGame() {
    this.gameActive = false;
    
    // Determine winner
    const winner = this.player1Score > this.player2Score ? 
      this.lobby!.playerIds[0] : 
      this.player2Score > this.player1Score ? 
        this.lobby!.playerIds[1] : 
        'tie';
    
    // Show game over screen
    this.cameras.main.fadeOut(1000, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('BallCrushGameOverScene', {
        username: this.username,
        uid: this.uid,
        score: this.player1Score,
        opponentScore: this.player2Score,
        won: winner === this.uid
      });
    });
  }
  
  private addBackgroundEffects() {
    // Add some decorative elements
    for (let i = 0; i < 10; i++) {
      const x = Phaser.Math.Between(0, 360);
      const y = Phaser.Math.Between(0, 640);
      const circle = this.add.circle(x, y, 5, 0xffaa00, 0.1);
      
      this.tweens.add({
        targets: circle,
        alpha: 0.2,
        scale: 1.5,
        duration: 2000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }
  }
  
  shutdown() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}