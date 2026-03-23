// src/scenes/TestStartScene.ts
import Phaser from 'phaser';
import { io } from 'socket.io-client';

export class TestStartScene extends Phaser.Scene {
    private username: string = '';
    private uid: string = '';
    private displayName: string = '';

    constructor() {
        super({ key: 'TestStartScene' });
    }

    init(data: { username?: string; uid?: string; displayName?: string }) {
        console.log('🎮 TestStartScene initialized');
        this.username = data?.username || 'TestPlayer';
        this.uid = data?.uid || 'test-' + Date.now();
        this.displayName = data?.displayName || this.username;
    }

    create() {
        // Background
        this.cameras.main.setBackgroundColor('#1a1a2e');

        // Title
        this.add.text(180, 60, '🧪 TEST CENTER', {
            fontSize: '28px',
            color: '#ffd700',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);

        // Subtitle
        this.add.text(180, 100, 'Select a test to run', {
            fontSize: '14px',
            color: '#cccccc'
        }).setOrigin(0.5);

        // User info
        this.add.text(180, 130, `Player: ${this.displayName}`, {
            fontSize: '12px',
            color: '#ffff00'
        }).setOrigin(0.5);

        // Test buttons
        const buttons = [
            {
                text: '🎮 CHECKERS ONLINE TEST',
                color: '#9C27B0',
                scene: 'CheckersTestLobbyScene',
                description: 'Full multiplayer test with lobby',
                requiresBalance: false
            },
            {
                text: '🔌 JOIN ROOM',
                color: '#2196F3',
                scene: 'CheckersTestLobbyScene',
                description: 'Join an existing game room',
                requiresBalance: false
            }
            ,
            {
                text: '🔌 CHECKERS SOCKET TEST',
                color: '#FF5722',
                scene: 'CheckersSocketTestScene',
                description: 'Direct game test (skip lobby)',
                requiresBalance: false
            },
            {
                text: '⚡ PRACTICE VS AI',
                color: '#4CAF50',
                scene: 'CheckersTestSkillScene',
                description: 'Play against AI (free practice)',
                requiresBalance: false
            },
            {
                text: '🏆 FLAPPY BIRD',
                color: '#2196F3',
                scene: 'FlappyBirdStartScene',
                description: 'Play Flappy Bird',
                requiresBalance: false
            },
            {
                text: '⚽ BALL CRUSH',
                color: '#FF9800',
                scene: 'BallCrushStartScene',
                description: 'Play Ball Crush',
                requiresBalance: false
            }
        ];

        let yPos = 170;
        buttons.forEach((btn, index) => {
            // Button background
            const bg = this.add.graphics();
            bg.fillStyle(Phaser.Display.Color.HexStringToColor(btn.color).color, 1);
            bg.fillRoundedRect(30, yPos, 300, 75, 12);
            bg.lineStyle(2, 0xffffff, 1);
            bg.strokeRoundedRect(30, yPos, 300, 75, 12);

            // Button text
            const button = this.add.text(180, yPos + 20, btn.text, {
                fontSize: '16px',
                color: '#ffffff',
                fontStyle: 'bold'
            }).setOrigin(0.5);

            // Description
            this.add.text(180, yPos + 48, btn.description, {
                fontSize: '10px',
                color: '#aaaaaa'
            }).setOrigin(0.5);

            // Make interactive
            const hitArea = new Phaser.Geom.Rectangle(30, yPos, 300, 75);
            const interactive = this.add.zone(180, yPos + 37, 300, 75)
                .setInteractive({ useHandCursor: true, hitArea });

            interactive.on('pointerover', () => {
                bg.clear();
                bg.fillStyle(Phaser.Display.Color.HexStringToColor(btn.color).color, 0.8);
                bg.fillRoundedRect(30, yPos, 300, 75, 12);
                bg.lineStyle(3, 0xffff00, 2);
                bg.strokeRoundedRect(30, yPos, 300, 75, 12);
                button.setStyle({ color: '#ffff00' });
            });

            interactive.on('pointerout', () => {
                bg.clear();
                bg.fillStyle(Phaser.Display.Color.HexStringToColor(btn.color).color, 1);
                bg.fillRoundedRect(30, yPos, 300, 75, 12);
                bg.lineStyle(2, 0xffffff, 1);
                bg.strokeRoundedRect(30, yPos, 300, 75, 12);
                button.setStyle({ color: '#ffffff' });
            });

            interactive.on('pointerdown', () => {
                console.log(`🔘 Starting: ${btn.text}`);
                this.startTest(btn);
            });

            yPos += 90;
        });

        // Footer
        this.add.text(180, 620, 'v1.0 - Testing Environment', {
            fontSize: '10px',
            color: '#666666'
        }).setOrigin(0.5);
    }

    // Also update the startTest method to handle this:
    private startTest(btn: any) {
        if (btn.scene === 'CheckersLobbyScene') {
            // Show prompt for room code
            const roomCode = prompt('Enter Room Code:');
            if (roomCode) {
                this.scene.start('CheckersLobbyScene', {
                    username: this.username,
                    uid: this.uid,
                    lobbyId: roomCode
                });
            }
        } else if (btn.scene === 'CheckersTestLobbyScene') {
            // Create new room (host)
            this.startOnlineTest();
        } else if (btn.scene === 'CheckersSocketTestScene') {
            this.scene.start('CheckersSocketTestScene', {
                username: this.username,
                uid: this.uid,
                displayName: this.displayName
            });
        } else {
            this.scene.start(btn.scene, {
                username: this.username,
                uid: this.uid
            });
        }
    }

    private startOnlineTest() {
        console.log('🎮 Starting online test - creating room...');

        const serverUrl = import.meta.env.VITE_SOCKET_SERVER_URL || 'http://localhost:3001';

        // Generate a random room ID
        const roomId = 'TEST_' + Math.random().toString(36).substring(2, 10).toUpperCase();

        // Create socket connection
        const socket = io(serverUrl, {
            transports: ['websocket'],
            query: {
                uid: this.uid,
                username: this.username,
                name: this.displayName,
                roomId: roomId
            }
        });

        // Store for later use
        (window as any).testSocket = socket;

        socket.on('connect', () => {
            console.log('✅ Socket connected, joining lobby...');

            // Join as host
            socket.emit('joinGame', {
                roomId: roomId,
                color: 'red',
                isHost: true,
                name: this.displayName
            });

            // Go to lobby scene
            this.scene.start('CheckersTestLobbyScene', {
                roomId: roomId,
                myColor: 'red',
                isHost: true,
                socket: socket
            });
        });

        socket.on('connect_error', (error) => {
            console.error('❌ Connection error:', error);
            this.showConnectionError();
        });

        // Timeout fallback
        this.time.delayedCall(5000, () => {
            if (!socket.connected) {
                console.error('❌ Connection timeout');
                this.showConnectionError();
                socket.disconnect();
            }
        });
    }

    private showConnectionError() {
        const popup = this.add.graphics();
        popup.fillStyle(0x000000, 0.9);
        popup.fillRoundedRect(40, 250, 280, 120, 10);
        popup.lineStyle(2, 0xff0000, 1);
        popup.strokeRoundedRect(40, 250, 280, 120, 10);

        this.add.text(180, 280, '❌ CONNECTION FAILED', {
            fontSize: '16px',
            color: '#ff0000',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.add.text(180, 320, 'Make sure server is running on port 3001', {
            fontSize: '12px',
            color: '#ffff00',
            wordWrap: { width: 260 }
        }).setOrigin(0.5);

        const closeBtn = this.add.text(180, 360, 'OK', {
            fontSize: '14px',
            color: '#ffffff',
            backgroundColor: '#4CAF50',
            padding: { x: 15, y: 5 }
        })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });

        closeBtn.on('pointerdown', () => {
            popup.destroy();
            closeBtn.destroy();
        });
    }
}