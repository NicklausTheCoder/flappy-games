// src/main.ts
import Phaser from 'phaser';

// Import CookieScene (SHARED)
import { CookieScene } from './scenes/CookieScene';
import { checkersMultiplayer } from './firebase/checkersMultiplayer';
// Import Flappy Bird scenes
import { FlappyBirdLoaderScene } from './scenes/flappy-bird/FlappyBirdLoaderScene';
import { FlappyBirdStartScene } from './scenes/flappy-bird/FlappyBirdStartScene';
import { FlappyBirdGameScene } from './scenes/flappy-bird/FlappyBirdGameScene';
import { FlappyBirdScoresScene } from './scenes/flappy-bird/FlappyBirdScoresScene';
import { FlappyBirdGameOverScene } from './scenes/flappy-bird/FlappyBirdGameOverScene';
import { FlappyBirdProfileScene } from './scenes/flappy-bird/FlappyBirdProfileScene';
import { FlappyBirdLeaderboardScene } from './scenes/flappy-bird/FlappyBirdLeaderboardScene';

// Import Sky Shooter scenes
import { SkyShooterLoaderScene } from './scenes/sky-shooter/SkyShooterLoaderScene';
import { SkyShooterStartScene } from './scenes/sky-shooter/SkyShooterStartScene';
import { SkyShooterGameScene } from './scenes/sky-shooter/SkyShooterGameScene';
import { SkyShooterScoresScene } from './scenes/sky-shooter/SkyShooterScoresScene';
import { SkyShooterGameOverScene } from './scenes/sky-shooter/SkyShooterGameOverScene';
import { SkyShooterProfileScene } from './scenes/sky-shooter/SkyShooterProfileScene';
import { SkyShooterLeaderboardScene } from './scenes/sky-shooter/SkyShooterLeaderboardScene';
import { SkyShooterMatchmakingScene } from './scenes/sky-shooter/SkyShooterMatchmakingScene';
import { SkyShooterLobbyScene } from './scenes/sky-shooter/SkyShooterLobbyScene';

// Import Ball Crush scenes
import { BallCrushLoaderScene } from './scenes/ball-crush/BallCrushLoaderScene';
import { BallCrushStartScene } from './scenes/ball-crush/BallCrushStartScene';
import { BallCrushGameScene } from './scenes/ball-crush/BallCrushGameScene';
import {  BallCrushStatsScene } from './scenes/ball-crush/BallCrushScoresScene';
import { BallCrushGameOverScene } from './scenes/ball-crush/BallCrushGameOverScene';
import { BallCrushProfileScene } from './scenes/ball-crush/BallCrushProfileScene';
import { BallCrushLeaderboardScene } from './scenes/ball-crush/BallCrushLeaderboardScene';

import { URLEncryption } from './utils/encryption';
import { BallCrushLobbyScene } from './scenes/ball-crush/BallCrushLobbyScene';
import { BallCrushMatchmakingScene } from './scenes/ball-crush/BallCrushMatchmakingScene';
import { ballCrushMultiplayer } from './firebase/ballCrushMultiplayer';

import { CheckersStartScene } from './scenes/checkers/CheckersStartScene';
import { CheckersMultiplayerGameScene } from './scenes/checkers/CheckersMultiplayerGameScene';
import { CheckersLoaderScene } from './scenes/checkers/CheckersLoaderScene';
import { PrizeTournamentScene } from './scenes/flappy-bird/PrizeTournamentScene';
import { CheckersGameOverScene } from './scenes/checkers/CheckersGameOverScene';
import { CheckersLeaderboardScene } from './scenes/checkers/CheckersLeaderboardScene';
import { CheckersStatsScene } from './scenes/checkers/CheckersStatsScene';
import { CheckersProfileScene } from './scenes/checkers/CheckersProfileScene';
import { CheckersTestSkillScene } from './scenes/checkers/CheckersTestSkillScene';
import { CheckersLobbyScene } from './scenes/checkers/CheckersLobbyScene';
import { CheckersMatchmakingScene } from './scenes/checkers/CheckersMatchmakingScene';



// Determine which game to load based on URL path
(function () {
    console.log('🔍 Checking URL path and user data...');

    const path = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    const encryptedUser = urlParams.get('user');

    // Parse game from URL path (e.g., /flappy-bird or /sky-shooter or /ball-crush)
    let gameId = 'flappy-bird'; // default
    const pathMatch = path.match(/\/([a-z-]+)(\/?$|\/?\?)/);

    if (pathMatch) {
        gameId = pathMatch[1];
        console.log(`🎮 Game detected from path: ${gameId}`);
    } else {
        console.log(`🎮 No game in path, defaulting to: ${gameId}`);
    }

    // Store game config
    window.gameConfig = {
        gameId: gameId,
        encryptedUser: encryptedUser || null
    };

    // Decrypt user data if present
    if (encryptedUser) {
        console.log('Found encrypted data:', encryptedUser);
        const userData = URLEncryption.decrypt(encryptedUser);

        if (userData) {
            console.log('✅ Successfully decrypted:', userData);
            window.gameUser = userData;
        } else {
            console.log('❌ Failed to decrypt');
            window.gameUser = null;
        }
    } else {
        console.log('No user data in URL');

        // Check sessionStorage for existing user
        const sessionUser = sessionStorage.getItem('gameUser');
        if (sessionUser) {
            try {
                window.gameUser = JSON.parse(sessionUser);
                console.log('📦 Found user in sessionStorage:', window.gameUser);
            } catch (e) {
                window.gameUser = null;
            }
        } else {
            window.gameUser = null;
        }
    }

    console.log('📦 Game config:', window.gameConfig);
})();


// Tell TypeScript about our window globals
declare global {
    interface Window {
        gameUser: any;
        gameConfig: {
            gameId: string;
            encryptedUser: string | null;
        };
    }
}

// Debug HMR
if (import.meta.hot) {
    import.meta.hot.on('vite:beforeUpdate', () => {
        console.log('🔴 HMR Update triggered!');
    });
}

// Build scenes array based on gameId
const getGameScenes = () => {
    const gameId = window.gameConfig.gameId;



    // Always include CookieScene first
    const scenes = [CookieScene];
    // const scenes = [CheckersStartScene,CheckersGameScene];
    // Add game-specific scenes based on gameId
    switch (gameId) {
        case 'flappy-bird':
            scenes.push(
                FlappyBirdLoaderScene,
                FlappyBirdStartScene,
                FlappyBirdGameScene,
                FlappyBirdScoresScene,
                FlappyBirdGameOverScene,
                FlappyBirdProfileScene,
                PrizeTournamentScene,
                FlappyBirdLeaderboardScene
            );
            break;

        // case 'sky-shooter':
        //     scenes.push(
        //         SkyShooterLoaderScene,
        //         SkyShooterStartScene,
        //         // SkyShooterGameScene,
        //         SkyShooterScoresScene,
        //         SkyShooterGameOverScene,
        //         SkyShooterProfileScene,
        //         SkyShooterMatchmakingScene,
        //         SkyShooterLobbyScene,
        //         SkyShooterLeaderboardScene
        //     );
        //     break;

        case 'ball-crush':
            ballCrushMultiplayer.startMatchmakingService();

            scenes.push(
                BallCrushLoaderScene,
                BallCrushStartScene,
                BallCrushMatchmakingScene,
                BallCrushLobbyScene,
                BallCrushGameScene,
                BallCrushStatsScene,
                BallCrushGameOverScene,
                BallCrushProfileScene,
                BallCrushLeaderboardScene
            );
            break;

        case 'checkers':

        checkersMultiplayer.startMatchmakingService();
            scenes.push(
                CheckersLoaderScene,  // Add this first
                CheckersStartScene,
                CheckersMatchmakingScene,  // Add this
                CheckersLobbyScene,        // Add this
                CheckersMultiplayerGameScene, // Rename this to CheckersMultiplayerGameScene
                CheckersProfileScene,  // Add this
                CheckersGameOverScene,
                CheckersLeaderboardScene,  // Add this
                CheckersStatsScene,  // Add this
                CheckersTestSkillScene,  // Add this before the real game
            );
            break;

        default:
            console.warn(`Unknown game: ${gameId}, defaulting to Flappy Bird`);
            scenes.push(
                FlappyBirdLoaderScene,
                FlappyBirdStartScene,
                FlappyBirdGameScene,
                FlappyBirdScoresScene,
                FlappyBirdGameOverScene,
                FlappyBirdProfileScene,
                PrizeTournamentScene,
                FlappyBirdLeaderboardScene
            );
    }

    return scenes;
};

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: 360,
    height: 640,
    // Dynamically load scenes based on gameId
    scene: getGameScenes(),
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { x: 0, y: 800 },
            debug: false
        }
    },
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    backgroundColor: '#000000',
    callbacks: {
        preBoot: (game) => {
            // Pass the user data to all scenes
            if (window.gameUser) {
                game.registry.set('username', window.gameUser.username);
                game.registry.set('loginTime', window.gameUser.loginTime);
                game.registry.set('isAuthenticated', true);
                game.registry.set('userData', window.gameUser);
            } else {
                game.registry.set('username', null);
                game.registry.set('isAuthenticated', false);
                game.registry.set('userData', null);
            }

            // Pass game config
            game.registry.set('gameId', window.gameConfig.gameId);
        }
    }
};

const game = new Phaser.Game(config);

console.log(`🎮 Game initialized: ${window.gameConfig.gameId}`);