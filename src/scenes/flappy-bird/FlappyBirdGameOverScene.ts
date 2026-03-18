import Phaser from 'phaser';
import {
  FlappyBirdUserData,
  updateFlappyBirdWalletBalance,
  saveFlappyBirdScore
} from '../../firebase/flappyBirdSimple';

export class FlappyBirdGameOverScene extends Phaser.Scene {
  private userData!: FlappyBirdUserData;
  private username: string = '';
  private uid: string = '';
  private score: number = 0;
  private newHighScore: boolean = false;

  constructor() {
    super({ key: 'FlappyBirdGameOverScene' });
  }

  init(data: { userData: FlappyBirdUserData; score: number; uid: string; newHighScore: boolean }) {
    console.log('💀 GameOverScene initialized with data:', data);

    if (!data || !data.userData) {
      console.error('❌ No userData provided to GameOverScene');
      this.scene.start('FlappyBirdStartScene');
      return;
    }

    this.userData = data.userData;
    this.score = data.score || 0;
    this.uid = data.uid || '';
    this.newHighScore = data.newHighScore || false;



    // Store the score in database immediately
    this.storeScoreInDatabase();
  }

// In FlappyBirdGameOverScene.ts, after saving score:
private async storeScoreInDatabase() {
    try {
        if (!this.uid) {
            console.error('❌ Cannot save score: No UID available');
            return;
        }

        console.log(`💾 Saving score for UID: ${this.uid}, score: ${this.score}`);
        
        const success = await saveFlappyBirdScore(
            this.uid,
            this.score,
            false,
            0,
            0
        );
        
        if (success) {
            console.log('✅ Score saved successfully');
            
            // RECORD TOURNAMENT DATA HERE
            const { recordTournamentGame } = await import('../../firebase/flappyBirdTournament');
            await recordTournamentGame(
                this.uid,
                this.username,
                this.userData.displayName,
                this.score
            );
            
        } else {
            console.log('❌ Failed to save score');
        }
    } catch (error) {
        console.error('❌ Error saving score:', error);
    }
}

  create() {
    // Dark background
    this.cameras.main.setBackgroundColor('#1a1a2e');

    // Game over title
    this.add.text(180, 100, 'GAME OVER', {
      fontSize: '36px',
      color: '#ff0000',
      fontStyle: 'bold',
      stroke: '#ffffff',
      strokeThickness: 4
    }).setOrigin(0.5);

    // Score card background
    const scoreCard = this.add.graphics();
    scoreCard.fillStyle(0x16213e, 0.9);
    scoreCard.fillRoundedRect(30, 150, 300, 120, 15);
    scoreCard.lineStyle(2, 0xffd700);
    scoreCard.strokeRoundedRect(30, 150, 300, 120, 15);

    // Current score
    this.add.text(180, 180, 'YOUR SCORE', {
      fontSize: '18px',
      color: '#aaaaaa'
    }).setOrigin(0.5);

    this.add.text(180, 220, this.score.toString(), {
      fontSize: '48px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // New high score indicator
    if (this.newHighScore) {
      this.add.text(180, 280, '🏆 NEW HIGH SCORE!', {
        fontSize: '20px',
        color: '#ffd700',
        fontStyle: 'bold'
      }).setOrigin(0.5);

      // Confetti effect
      if (this.textures.exists('coin')) {
        this.add.particles(180, 100, 'coin', {
          speed: 100,
          scale: { start: 0.2, end: 0 },
          blendMode: 'ADD',
          lifespan: 2000,
          gravityY: 50,
          quantity: 5,
          frequency: 200
        });
      }
    }

    // Stats
    this.add.text(180, 320, `Total Games: ${this.userData.totalGames || 0}`, {
      fontSize: '14px',
      color: '#888888'
    }).setOrigin(0.5);

    this.add.text(180, 340, `Best Score: ${this.userData.highScore || 0}`, {
      fontSize: '14px',
      color: '#888888'
    }).setOrigin(0.5);

    // Play Again button
    const playAgainBtn = this.createButton(180, 400, '🔄 PLAY AGAIN', '#4CAF50', () => {
      this.deductAndPlay();
    });

    // Scores button
    const scoresBtn = this.createButton(180, 470, '📊 VIEW SCORES', '#2196F3', () => {
      this.scene.start('FlappyBirdScoresScene', {
        userData: this.userData,
        uid: this.uid
      });
    });

    // Menu button
    const menuBtn = this.createButton(180, 540, '🏠 MAIN MENU', '#9C27B0', () => {
      this.scene.start('FlappyBirdStartScene', {
        username: this.userData.username,
        uid: this.uid,
        userData: this.userData
      });
    });
  }

  private createButton(x: number, y: number, text: string, color: string, callback: () => void): Phaser.GameObjects.Text {
    const button = this.add.text(x, y, text, {
      fontSize: '20px',
      color: '#ffffff',
      backgroundColor: color,
      padding: { x: 20, y: 10 }
    })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    button.on('pointerover', () => {
      button.setStyle({ color: '#ffff00' });
      button.setScale(1.05);
    });

    button.on('pointerout', () => {
      button.setStyle({ color: '#ffffff' });
      button.setScale(1);
    });

    button.on('pointerdown', callback);

    return button;
  }

  private async deductAndPlay() {

    this.scene.start('FlappyBirdStartScene', {
      username: this.userData.username,
      uid: this.uid,

    });
  }


}