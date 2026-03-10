# Create Ball Crush scene files
$basePath = "src\scenes\ball-crush"

# Create folder
New-Item -ItemType Directory -Path $basePath -Force | Out-Null

Write-Host "🎯 Creating Ball Crush scene files..." -ForegroundColor Cyan

# BallCrushLoaderScene.ts
@"
import Phaser from 'phaser';

export class BallCrushLoaderScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BallCrushLoaderScene' });
    }
    
    init(data: { username: string }) {
        console.log('⚽ BallCrushLoaderScene - Loading for:', data.username);
    }
    
    preload() {
        // Ball Crush specific loading UI
        this.cameras.main.setBackgroundColor('#1a3a1a');
        
        this.add.text(180, 140, '⚽ BALL CRUSH', {
            fontSize: '32px',
            color: '#ffaa00',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        
        this.add.text(180, 200, 'Loading...', {
            fontSize: '18px',
            color: '#ffffff'
        }).setOrigin(0.5);
    }
    
    create() {
        this.scene.start('BallCrushStartScene', { username: this.registry.get('username') });
    }
}
"@ | Out-File -FilePath "$basePath\BallCrushLoaderScene.ts" -Encoding utf8

Write-Host "  [OK] Created BallCrushLoaderScene.ts" -ForegroundColor Green

# BallCrushStartScene.ts
@"
import Phaser from 'phaser';

export class BallCrushStartScene extends Phaser.Scene {
    private username: string = '';
    
    constructor() {
        super({ key: 'BallCrushStartScene' });
    }
    
    init(data: { username: string }) {
        this.username = data.username || 'Guest';
        console.log('⚽ BallCrushStartScene -', this.username);
    }
    
    create() {
        this.cameras.main.setBackgroundColor('#1a3a1a');
        
        this.add.text(180, 120, '⚽ BALL CRUSH', {
            fontSize: '36px',
            color: '#ffaa00',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        
        this.add.text(180, 180, `Ready, ${this.username}!`, {
            fontSize: '20px',
            color: '#ffffff'
        }).setOrigin(0.5);
        
        const startBtn = this.add.text(180, 260, 'START GAME', {
            fontSize: '24px',
            color: '#ffffff',
            backgroundColor: '#4CAF50',
            padding: { x: 30, y: 15 }
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
        
        startBtn.on('pointerdown', () => {
            this.scene.start('BallCrushGameScene', { username: this.username });
        });
        
        // Leaderboard button
        const leaderboardBtn = this.add.text(180, 340, 'LEADERBOARD', {
            fontSize: '18px',
            color: '#ffffff',
            backgroundColor: '#2196F3',
            padding: { x: 20, y: 10 }
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
        
        leaderboardBtn.on('pointerdown', () => {
            this.scene.start('BallCrushLeaderboardScene', { username: this.username });
        });
        
        // Profile button
        const profileBtn = this.add.text(180, 400, 'PROFILE', {
            fontSize: '18px',
            color: '#ffffff',
            backgroundColor: '#9C27B0',
            padding: { x: 20, y: 10 }
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
        
        profileBtn.on('pointerdown', () => {
            this.scene.start('BallCrushProfileScene', { username: this.username });
        });
    }
}
"@ | Out-File -FilePath "$basePath\BallCrushStartScene.ts" -Encoding utf8

Write-Host "  [OK] Created BallCrushStartScene.ts" -ForegroundColor Green

# BallCrushGameScene.ts
@"
import Phaser from 'phaser';

export class BallCrushGameScene extends Phaser.Scene {
    private username: string = '';
    private score: number = 0;
    private scoreText!: Phaser.GameObjects.Text;
    
    constructor() {
        super({ key: 'BallCrushGameScene' });
    }
    
    init(data: { username: string }) {
        this.username = data.username || 'Guest';
        console.log('⚽ BallCrushGameScene - Starting for:', this.username);
    }
    
    create() {
        this.cameras.main.setBackgroundColor('#1a3a1a');
        
        this.add.text(180, 100, '⚽ BALL CRUSH', {
            fontSize: '28px',
            color: '#ffaa00',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        
        this.scoreText = this.add.text(180, 200, 'Score: 0', {
            fontSize: '32px',
            color: '#ffffff'
        }).setOrigin(0.5);
        
        // Placeholder instructions
        this.add.text(180, 300, 'Tap balls to crush them!', {
            fontSize: '16px',
            color: '#cccccc'
        }).setOrigin(0.5);
        
        // Back button
        const backBtn = this.add.text(60, 550, 'MENU', {
            fontSize: '16px',
            color: '#ffffff',
            backgroundColor: '#f44336',
            padding: { x: 10, y: 5 }
        })
        .setInteractive({ useHandCursor: true });
        
        backBtn.on('pointerdown', () => {
            this.scene.start('BallCrushStartScene', { username: this.username });
        });
    }
    
    update() {
        // Game logic here
    }
}
"@ | Out-File -FilePath "$basePath\BallCrushGameScene.ts" -Encoding utf8

Write-Host "  [OK] Created BallCrushGameScene.ts" -ForegroundColor Green

# BallCrushScoresScene.ts
@"
import Phaser from 'phaser';

export class BallCrushScoresScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BallCrushScoresScene' });
    }
    
    create() {
        this.cameras.main.setBackgroundColor('#1a3a1a');
        
        this.add.text(180, 120, 'MY SCORES', {
            fontSize: '28px',
            color: '#ffaa00',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        
        // Back button
        const backBtn = this.add.text(60, 550, 'BACK', {
            fontSize: '16px',
            color: '#ffffff',
            backgroundColor: '#f44336',
            padding: { x: 10, y: 5 }
        })
        .setInteractive({ useHandCursor: true });
        
        backBtn.on('pointerdown', () => {
            this.scene.start('BallCrushStartScene');
        });
    }
}
"@ | Out-File -FilePath "$basePath\BallCrushScoresScene.ts" -Encoding utf8

Write-Host "  [OK] Created BallCrushScoresScene.ts" -ForegroundColor Green

# BallCrushGameOverScene.ts
@"
import Phaser from 'phaser';

export class BallCrushGameOverScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BallCrushGameOverScene' });
    }
    
    init(data: { score: number; username: string }) {
        console.log('Game Over - Score:', data.score);
    }
    
    create() {
        this.cameras.main.setBackgroundColor('#1a3a1a');
        
        this.add.text(180, 150, 'GAME OVER', {
            fontSize: '36px',
            color: '#ff0000',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        
        // Play again button
        const playAgainBtn = this.add.text(180, 260, 'PLAY AGAIN', {
            fontSize: '24px',
            color: '#ffffff',
            backgroundColor: '#4CAF50',
            padding: { x: 30, y: 15 }
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
        
        playAgainBtn.on('pointerdown', () => {
            this.scene.start('BallCrushGameScene', { username: this.registry.get('username') });
        });
        
        // Menu button
        const menuBtn = this.add.text(180, 340, 'MAIN MENU', {
            fontSize: '18px',
            color: '#ffffff',
            backgroundColor: '#2196F3',
            padding: { x: 20, y: 10 }
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
        
        menuBtn.on('pointerdown', () => {
            this.scene.start('BallCrushStartScene', { username: this.registry.get('username') });
        });
    }
}
"@ | Out-File -FilePath "$basePath\BallCrushGameOverScene.ts" -Encoding utf8

Write-Host "  [OK] Created BallCrushGameOverScene.ts" -ForegroundColor Green

# BallCrushProfileScene.ts
@"
import Phaser from 'phaser';

export class BallCrushProfileScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BallCrushProfileScene' });
    }
    
    create() {
        this.cameras.main.setBackgroundColor('#1a3a1a');
        
        this.add.text(180, 120, 'PLAYER PROFILE', {
            fontSize: '28px',
            color: '#ffaa00',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        
        // Back button
        const backBtn = this.add.text(60, 550, 'BACK', {
            fontSize: '16px',
            color: '#ffffff',
            backgroundColor: '#f44336',
            padding: { x: 10, y: 5 }
        })
        .setInteractive({ useHandCursor: true });
        
        backBtn.on('pointerdown', () => {
            this.scene.start('BallCrushStartScene');
        });
    }
}
"@ | Out-File -FilePath "$basePath\BallCrushProfileScene.ts" -Encoding utf8

Write-Host "  [OK] Created BallCrushProfileScene.ts" -ForegroundColor Green

# BallCrushLeaderboardScene.ts
@"
import Phaser from 'phaser';

export class BallCrushLeaderboardScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BallCrushLeaderboardScene' });
    }
    
    create() {
        this.cameras.main.setBackgroundColor('#1a3a1a');
        
        this.add.text(180, 120, 'LEADERBOARD', {
            fontSize: '28px',
            color: '#ffaa00',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        
        // Back button
        const backBtn = this.add.text(60, 550, 'BACK', {
            fontSize: '16px',
            color: '#ffffff',
            backgroundColor: '#f44336',
            padding: { x: 10, y: 5 }
        })
        .setInteractive({ useHandCursor: true });
        
        backBtn.on('pointerdown', () => {
            this.scene.start('BallCrushStartScene');
        });
    }
}
"@ | Out-File -FilePath "$basePath\BallCrushLeaderboardScene.ts" -Encoding utf8

Write-Host "  [OK] Created BallCrushLeaderboardScene.ts" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " All Ball Crush scene files created!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Location: $basePath" -ForegroundColor Yellow