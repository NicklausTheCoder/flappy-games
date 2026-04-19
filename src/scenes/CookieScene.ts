// src/scenes/CookieScene.ts
import Phaser from 'phaser';
import CryptoJS from 'crypto-js';


// Add this at the top of CookieScene.ts, after the imports
declare global {
    interface Window {
        gameUser?: {
            username: string;
            displayName?: string;
            uid?: string;
            email?: string;
            loginTime?: number;
            rememberMe?: boolean;
        };
    }
}

export class CookieScene extends Phaser.Scene {
    // Same secret key as your login page
    private readonly SECRET_KEY = 'my-super-secret-key-123';

    // Session configuration
    private readonly SESSION_CONFIG = {
        SESSION_TIMEOUT: 30 * 60 * 1000,        // 30 minutes (in milliseconds)
        REMEMBER_ME_TIMEOUT: 7 * 24 * 60 * 60 * 1000, // 7 days (in milliseconds)
        MAX_IDLE_TIME: 15 * 60 * 1000,          // 15 minutes idle timeout
        RENEWAL_WINDOW: 5 * 60 * 1000            // Renew session if within 5 minutes of expiry
    };

    // Game display names - ADDED CHECKERS
    private readonly GAME_NAMES: Record<string, string> = {
        'flappy-bird': 'Flappy Bird',
        'sky-shooter': 'Sky Shooter',
        'ball-crush': 'Ball Crush',
        'checkers': 'Checkers'
    };

    // Game loader mapping - ADDED CHECKERS
    private readonly LOADER_MAP: Record<string, string> = {
        'flappy-bird': 'FlappyBirdLoaderScene',
        'sky-shooter': 'SkyShooterLoaderScene',
        'ball-crush': 'BallCrushLoaderScene',
        'checkers': 'CheckersLoaderScene'
    };

    constructor() {
        super({ key: 'CookieScene' });
    }

    async create() {
        console.log('🍪 CookieScene - checking for user data...');

        // Get gameId from registry (set in main.ts)
        const gameId = this.registry.get('gameId') || 'flappy-bird';
        console.log(`🎮 Game: ${gameId}`);

        // Check multiple sources for user data with expiration
        const userData = this.getUserFromStorage();

        if (userData) {
            console.log('✅ User found in storage:', userData);

            // Check if session is expired
            if (this.isSessionExpired(userData)) {
                console.log('⏰ Session expired, clearing data');
                this.clearUserData();
                this.showLoginScreen(gameId, 'Your session has expired. Please log in again.');
                return;
            }

            // Check if we should renew the session
            if (this.shouldRenewSession(userData)) {
                console.log('🔄 Renewing session');
                this.renewSession(userData);
            }

            // Store in registry for other scenes
            this.registry.set('username', userData.username);
            this.registry.set('userData', userData);
            this.registry.set('isAuthenticated', true);

            // Check for duplicate session
            const isDuplicate = await this.checkAndLockSession(userData.uid, userData.sessionId);
            if (isDuplicate) {
                this.clearUserData();
                this.showLoginScreen(gameId, '⚠️ This account is already logged in on another device.');
                return;
            }

            // Start idle timer monitoring
            this.startIdleTimer();

            // Route to the correct game loader
            this.routeToGameLoader(gameId, userData.username, userData.uid);

        } else {
            console.log('❌ No user found in storage');
            this.showLoginScreen(gameId);
        }
    }

    // In CookieScene.ts, add a flag:
    private isRouting: boolean = false;

    private routeToGameLoader(gameId: string, username: string, uid?: string) {
        console.log(`🚀 Routing to ${gameId} loader...`, { username, uid }); // Add this log

        const loaderScene = this.LOADER_MAP[gameId];

        if (loaderScene) {
            this.scene.start(loaderScene, {
                username: username,
                uid: uid  // This is still coming through as undefined!
            });
        } else {
            console.warn(`No loader found for game: ${gameId}, defaulting to Flappy Bird`);
            this.scene.start('FlappyBirdLoaderScene', {
                username: username,
                uid: uid
            });
        }
    }

    private getUserFromStorage(): any | null {
        // PRIORITY 0: Check window.gameUser (set by main.ts from URL)
        const windowUser = this.getUserFromWindow();
        if (windowUser) {
            console.log('✅ Using user from window.gameUser:', windowUser);

            // Save to storage for future use
            this.saveUserToStorage(windowUser, windowUser.rememberMe || false);

            // Clear the window.gameUser to avoid using it again
            if (typeof window !== 'undefined') {
                (window as any).gameUser = null;
            }

            return windowUser;
        }

        // Priority 1: Check sessionStorage (cleared when browser closes)
        // In the sessionStorage section (around line 130-140):
        // In the sessionStorage section
        const sessionUser = sessionStorage.getItem('gameUser');
        if (sessionUser) {
            try {
                const userData = JSON.parse(sessionUser);
                console.log('📦 Found in sessionStorage:', userData);

                if (this.isValidSession(userData)) {
                    // Make sure uid exists
                    if (!userData.uid) {
                        console.warn('⚠️ No uid in sessionStorage');
                    }
                    return userData;
                }
            } catch (e) {
                console.error('Failed to parse sessionStorage data');
            }
        }

        // Similar for localStorage
        const localUser = localStorage.getItem('gameUser');
        if (localUser) {
            try {
                const userData = JSON.parse(localUser);
                console.log('💾 Found in localStorage:', userData);

                if (this.isValidSession(userData)) {
                    if (!userData.uid) {
                        console.warn('⚠️ No uid in localStorage');
                    }
                    return userData;
                }
            } catch (e) {
                console.error('Failed to parse localStorage data');
            }
        }

        // Priority 3: Check URL parameters (for first-time login) - WITH DECRYPTION
        const urlUser = this.getUserFromUrl();
        if (urlUser) {
            return urlUser;
        }

        // Priority 4: Check cookies (fallback)
        const cookieUser = this.getCookie('username');
        if (cookieUser) {
            console.log('🍪 Found in cookies:', cookieUser);

            // Migrate cookie to storage for future use
            const userData = this.createUserData(cookieUser, false);
            this.saveUserToStorage(userData, false);
            return userData;
        }

        return null;
    }

    private isValidSession(userData: any): boolean {
        // Check if userData has required fields
        if (!userData || !userData.username || !userData.loginTime) {
            return false;
        }

        // Check if session is expired
        return !this.isSessionExpired(userData);
    }

    private isSessionExpired(userData: any): boolean {
        const now = Date.now();
        const loginTime = userData.loginTime;
        const rememberMe = userData.rememberMe || false;

        // Choose timeout based on remember me
        const timeout = rememberMe ?
            this.SESSION_CONFIG.REMEMBER_ME_TIMEOUT :
            this.SESSION_CONFIG.SESSION_TIMEOUT;

        // Check if session has expired
        const expired = (now - loginTime) > timeout;

        if (expired) {
            console.log(`⏰ Session expired after ${timeout / (60 * 1000)} minutes`);
        }

        return expired;
    }

    private shouldRenewSession(userData: any): boolean {
        const now = Date.now();
        const loginTime = userData.loginTime;
        const rememberMe = userData.rememberMe || false;

        const timeout = rememberMe ?
            this.SESSION_CONFIG.REMEMBER_ME_TIMEOUT :
            this.SESSION_CONFIG.SESSION_TIMEOUT;

        // Renew if within renewal window of expiry
        const timeUntilExpiry = (loginTime + timeout) - now;
        return timeUntilExpiry < this.SESSION_CONFIG.RENEWAL_WINDOW;
    }

    private renewSession(userData: any) {
        // Update login time to now
        userData.loginTime = Date.now();
        userData.renewedAt = Date.now();

        // Save updated data
        this.saveUserToStorage(userData, userData.rememberMe);

        console.log('🔄 Session renewed until:', new Date(userData.loginTime +
            (userData.rememberMe ?
                this.SESSION_CONFIG.REMEMBER_ME_TIMEOUT :
                this.SESSION_CONFIG.SESSION_TIMEOUT
            )).toLocaleString());
    }

    private startIdleTimer() {
        let idleTime = 0;

        // Reset idle time on user activity
        const resetIdle = () => {
            idleTime = 0;
        };

        // Add event listeners for user activity
        window.addEventListener('mousemove', resetIdle);
        window.addEventListener('keypress', resetIdle);
        window.addEventListener('touchstart', resetIdle);
        window.addEventListener('click', resetIdle);
        window.addEventListener('scroll', resetIdle);

        // Check idle time every minute
        const idleInterval = setInterval(() => {
            idleTime += 60000; // Add 1 minute

            if (idleTime >= this.SESSION_CONFIG.MAX_IDLE_TIME) {
                console.log('💤 User idle for too long, logging out');

                // Clear interval and remove listeners
                clearInterval(idleInterval);
                window.removeEventListener('mousemove', resetIdle);
                window.removeEventListener('keypress', resetIdle);
                window.removeEventListener('touchstart', resetIdle);
                window.removeEventListener('click', resetIdle);
                window.removeEventListener('scroll', resetIdle);

                // Log out the user
                this.logout('idle');
            }
        }, 60000);

        // Store interval ID for cleanup
        (window as any).idleInterval = idleInterval;
    }

    private getUserFromUrl(): any | null {
        const urlParams = new URLSearchParams(window.location.search);
        const encryptedData = urlParams.get('user');

        if (encryptedData) {
            console.log('🔗 Found encrypted data in URL:', encryptedData);

            try {
                // Decrypt the data
                const decrypted = this.decryptData(encryptedData);
                console.log('🔓 Decrypted data:', decrypted);

                if (decrypted && decrypted.username) {
                    // Create user data with the UID from decrypted data
                    const userData = this.createUserData(
                        decrypted.username,
                        decrypted.rememberMe || false,
                        decrypted.uid  // Pass the UID here!
                    );

                    // Save to storage for future visits
                    this.saveUserToStorage(userData, userData.rememberMe);

                    // Clean URL (remove the parameter)
                    const cleanUrl = window.location.pathname;
                    window.history.replaceState({}, document.title, cleanUrl);

                    return userData;
                }
            } catch (e) {
                console.error('Failed to decrypt URL data:', e);
            }
        }
        return null;
    }

    private createUserData(username: string, rememberMe: boolean, existingUid?: string): any {
        return {
            username: username,
            uid: existingUid || `temp_${Date.now()}`, // Use existing UID if provided
            loginTime: Date.now(),
            sessionId: Math.random().toString(36).substring(2, 15),
            rememberMe: rememberMe,
            createdAt: Date.now(),
            lastActivity: Date.now(),
            userAgent: navigator.userAgent
        };
    }

    private decryptData(encryptedData: string): any | null {
        try {
            // First, restore the URL-safe characters
            const base64 = encryptedData
                .replace(/_/g, '/')
                .replace(/-/g, '+');

            console.log('🔄 Restored base64:', base64);

            // Decrypt
            const bytes = CryptoJS.AES.decrypt(base64, this.SECRET_KEY);
            const decryptedString = bytes.toString(CryptoJS.enc.Utf8);

            console.log('📄 Decrypted string:', decryptedString);

            if (!decryptedString) {
                throw new Error('Decryption failed - empty result');
            }

            // Parse JSON
            return JSON.parse(decryptedString);
        } catch (error) {
            console.error('❌ Decryption error:', error);
            return null;
        }
    }

    private saveUserToStorage(userData: any, remember: boolean = true) {
        // Make sure UID is included
        if (!userData.uid) {
            console.warn('⚠️ Attempting to save user without UID!');
        }

        // Add last updated timestamp
        userData.lastUpdated = Date.now();

        // Always save to sessionStorage
        sessionStorage.setItem('gameUser', JSON.stringify(userData));

        // If remember me is true, also save to localStorage
        if (remember) {
            localStorage.setItem('gameUser', JSON.stringify(userData));
            console.log('💾 Saved to localStorage (remembered) with UID:', userData.uid);
        } else {
            // Clear any existing localStorage
            localStorage.removeItem('gameUser');
            console.log('📦 Saved to sessionStorage only with UID:', userData.uid);
        }
    }

    private getCookie(name: string): string | null {
        const cookieString = document.cookie;
        if (!cookieString) return null;

        const cookies = cookieString.split(';');
        for (let cookie of cookies) {
            const trimmed = cookie.trim();
            const separatorIndex = trimmed.indexOf('=');
            if (separatorIndex > 0) {
                const cookieName = trimmed.substring(0, separatorIndex);
                const cookieValue = trimmed.substring(separatorIndex + 1);
                if (cookieName === name) {
                    return cookieValue;
                }
            }
        }
        return null;
    }

    private clearUserData() {
        sessionStorage.removeItem('gameUser');
        localStorage.removeItem('gameUser');
        document.cookie = 'username=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';

        this.registry.set('username', null);
        this.registry.set('userData', null);
        this.registry.set('isAuthenticated', false);
    }

    private logout(reason: string = 'user') {
        console.log(`🚪 Logging out, reason: ${reason}`);
        this.clearUserData();

        // Clear idle timer
        if ((window as any).idleInterval) {
            clearInterval((window as any).idleInterval);
        }

        // Get gameId for login screen
        const gameId = this.registry.get('gameId') || 'flappy-bird';

        // Show login screen with reason
        let message = 'Please log in to play';
        if (reason === 'expired') {
            message = 'Your session has expired. Please log in again.';
        } else if (reason === 'idle') {
            message = 'You were idle too long. Please log in again.';
        }

        this.showLoginScreen(gameId, message);
    }

    private showLoginScreen(gameId: string = 'flappy-bird', message: string = 'Please log in to play') {
        // Clear any existing content
        this.cameras.main.setBackgroundColor('#0a0a2a');

        // Get game display name
        const gameName = this.GAME_NAMES[gameId] || 'Game';

        // Title
        this.add.text(180, 120, `🎮 ${gameName}`, {
            fontSize: '36px',
            color: '#ffd700',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Message
        this.add.text(180, 200, message, {
            fontSize: '16px',
            color: '#ffff00',
            wordWrap: { width: 280 }
        }).setOrigin(0.5);

        // Login button
        const loginBtn = this.add.text(180, 280, '🔐 LOGIN', {
            fontSize: '24px',
            color: '#ffffff',
            backgroundColor: '#4CAF50',
            padding: { x: 40, y: 15 }
        })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });

        loginBtn.on('pointerdown', () => {
            window.location.href = `https://wintapgames.com/games`;
        });

        // Demo login button
        const demoBtn = this.add.text(180, 360, '👤 DEMO LOGIN', {
            fontSize: '16px',
            color: '#ffffff',
            backgroundColor: '#2196F3',
            padding: { x: 20, y: 10 }
        })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });

        demoBtn.on('pointerdown', () => {
            const demoData = this.createUserData(`demo_${gameId}`, false);
            this.saveUserToStorage(demoData, false);
            this.registry.set('username', demoData.username);
            this.registry.set('userData', demoData);
            this.registry.set('isAuthenticated', true);

            // Route to game loader
            this.routeToGameLoader(gameId, demoData.username);
        });

        // Session info
        this.add.text(180, 440, '⏱️ Session: 30 minutes\n💤 Idle timeout: 15 minutes\n💾 Remember me: 7 days', {
            fontSize: '12px',
            color: '#888888',
            align: 'center'
        }).setOrigin(0.5);
    }
    private getUserFromWindow(): any | null {
        if (typeof window !== 'undefined' && (window as any).gameUser) {
            const userData = (window as any).gameUser;
            console.log('🪟 Found user data in window.gameUser:', userData);

            if (userData.username) {
                // Pass the existing UID to createUserData
                const formattedUser = this.createUserData(
                    userData.username,
                    userData.rememberMe || false,
                    userData.uid  // Pass the UID here!
                );

                // Add any additional fields
                if (userData.displayName) formattedUser.displayName = userData.displayName;
                if (userData.email) formattedUser.email = userData.email;

                return formattedUser;
            }
        }
        return null;
    }
    private async checkAndLockSession(uid: string, sessionId: string): Promise<boolean> {
        if (!uid || uid.startsWith('temp_')) return false;

        try {
            const { ref, get, set, onDisconnect } = await import('firebase/database');
            const { db } = await import('../firebase/init');

            const sessionRef = ref(db, `active_sessions/${uid}`);
            const snapshot = await get(sessionRef);

            if (snapshot.exists()) {
                const existing = snapshot.val();
                // If same sessionId it's the same device refreshing — allow it
                if (existing.sessionId === sessionId) {
                    // Refresh the lock timestamp
                    await set(sessionRef, {
                        sessionId,
                        lockedAt: Date.now(),
                        userAgent: navigator.userAgent
                    });
                    return false;
                }
                // Different sessionId = different device/browser
                const timeSinceLock = Date.now() - (existing.lockedAt || 0);
                // Give 60 seconds grace in case of page refresh creating new sessionId
                if (timeSinceLock < 60000) {
                    console.warn('🚫 Duplicate session detected for uid:', uid);
                    return true; // Block this login
                }
            }

            // No existing session or it's stale — write ours
            await set(sessionRef, {
                sessionId,
                lockedAt: Date.now(),
                userAgent: navigator.userAgent
            });

            // Auto-remove session lock when this tab closes
            onDisconnect(sessionRef).remove();

            return false;
        } catch (e) {
            console.error('Session lock check failed:', e);
            return false; // Fail open so a Firebase error doesn't lock everyone out
        }
    }
}