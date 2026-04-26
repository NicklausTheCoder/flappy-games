// src/scenes/CookieScene.ts
//
// Zero Firebase SDK — session lock now goes through POST /api/session/:uid/claim
// All other logic (localStorage / sessionStorage / cookies / URL decrypt) unchanged.

import Phaser from 'phaser';
import CryptoJS from 'crypto-js';
import { api } from '../firebase/api';

declare global {
  interface Window {
    gameUser?: {
      username: string; displayName?: string; uid?: string;
      email?: string; loginTime?: number; rememberMe?: boolean;
    };
  }
}

export class CookieScene extends Phaser.Scene {
  private readonly SECRET_KEY = 'my-super-secret-key-123';

  private readonly SESSION_CONFIG = {
    SESSION_TIMEOUT:      30 * 60 * 1000,
    REMEMBER_ME_TIMEOUT:  7 * 24 * 60 * 60 * 1000,
    MAX_IDLE_TIME:        15 * 60 * 1000,
    RENEWAL_WINDOW:        5 * 60 * 1000,
  };

  private readonly GAME_NAMES: Record<string, string> = {
    'flappy-bird': 'Flappy Bird',
    'sky-shooter':  'Sky Shooter',
    'ball-crush':   'Ball Crush',
    'checkers':     'Checkers',
  };

  private readonly LOADER_MAP: Record<string, string> = {
    'flappy-bird': 'FlappyBirdLoaderScene',
    'sky-shooter':  'SkyShooterLoaderScene',
    'ball-crush':   'BallCrushLoaderScene',
    'checkers':     'CheckersLoaderScene',
  };

  private isRouting: boolean = false;

  constructor() {
    super({ key: 'CookieScene' });
  }

  async create() {
    console.log('🍪 CookieScene - checking for user data...');
    const gameId = this.registry.get('gameId') || 'flappy-bird';
    console.log(`🎮 Game: ${gameId}`);

    const userData = this.getUserFromStorage();

    if (userData) {
      console.log('✅ User found in storage:', userData);

      if (this.isSessionExpired(userData)) {
        console.log('⏰ Session expired, clearing data');
        this.clearUserData();
        this.showLoginScreen(gameId, 'Your session has expired. Please log in again.');
        return;
      }

      if (this.shouldRenewSession(userData)) {
        console.log('🔄 Renewing session');
        this.renewSession(userData);
      }

      this.registry.set('username', userData.username);
      this.registry.set('userData', userData);
      this.registry.set('isAuthenticated', true);

      // ── Session lock check — now via server, zero Firebase on client ──────
      const isDuplicate = await this.checkAndLockSession(userData.uid, userData.sessionId);
      if (isDuplicate) {
        this.clearUserData();
        this.showLoginScreen(gameId, '⚠️ This account is already logged in on another device.');
        return;
      }

      // Release the session lock when this tab closes
      this.registerSessionRelease(userData.uid, userData.sessionId);

      this.startIdleTimer();
      this.routeToGameLoader(gameId, userData.username, userData.uid);
    } else {
      console.log('❌ No user found in storage');
      this.showLoginScreen(gameId);
    }
  }

  // ── Session lock — server-side atomic transaction, no Firebase SDK ──────────

  private async checkAndLockSession(uid: string, sessionId: string): Promise<boolean> {
    if (!uid || uid.startsWith('temp_')) return false; // anonymous — never block

    try {
      const res = await api.claimSession(uid, sessionId, navigator.userAgent);
      if (res.blocked) {
        console.warn('🚫 Duplicate session detected for uid:', uid);
      }
      return res.blocked ?? false;
    } catch (err) {
      // Fail open — an API error should never lock a user out
      console.error('Session lock check failed:', err);
      return false;
    }
  }

  private registerSessionRelease(uid: string, sessionId: string) {
    if (!uid || uid.startsWith('temp_')) return;

    // sendBeacon is fire-and-forget — works even during unload
    const releaseUrl = `${(import.meta as any).env?.VITE_SOCKET_URL ?? 'https://game-server-xvdu.onrender.com'}/api/session/${uid}/release`;

    const release = () => {
      const payload = JSON.stringify({ sessionId });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(releaseUrl, new Blob([payload], { type: 'application/json' }));
      } else {
        // Fallback for browsers without sendBeacon
        api.releaseSession(uid, sessionId).catch(() => {});
      }
    };

    window.addEventListener('beforeunload', release, { once: true });
    window.addEventListener('pagehide',     release, { once: true });
  }

  // ── Routing ────────────────────────────────────────────────────────────────

  private routeToGameLoader(gameId: string, username: string, uid?: string) {
    console.log(`🚀 Routing to ${gameId} loader...`, { username, uid });
    const loaderScene = this.LOADER_MAP[gameId];
    const target = loaderScene || 'FlappyBirdLoaderScene';
    if (!loaderScene) console.warn(`No loader found for game: ${gameId}, defaulting to Flappy Bird`);
    this.scene.start(target, { username, uid });
  }

  // ── Storage helpers (unchanged from original) ──────────────────────────────

  private getUserFromStorage(): any | null {
    const windowUser = this.getUserFromWindow();
    if (windowUser) {
      console.log('✅ Using user from window.gameUser:', windowUser);
      this.saveUserToStorage(windowUser, windowUser.rememberMe || false);
      if (typeof window !== 'undefined') (window as any).gameUser = null;
      return windowUser;
    }

    const sessionUser = sessionStorage.getItem('gameUser');
    if (sessionUser) {
      try {
        const userData = JSON.parse(sessionUser);
        if (this.isValidSession(userData)) return userData;
      } catch { console.error('Failed to parse sessionStorage data'); }
    }

    const localUser = localStorage.getItem('gameUser');
    if (localUser) {
      try {
        const userData = JSON.parse(localUser);
        if (this.isValidSession(userData)) return userData;
      } catch { console.error('Failed to parse localStorage data'); }
    }

    const urlUser = this.getUserFromUrl();
    if (urlUser) return urlUser;

    const cookieUser = this.getCookie('username');
    if (cookieUser) {
      const userData = this.createUserData(cookieUser, false);
      this.saveUserToStorage(userData, false);
      return userData;
    }

    return null;
  }

  private isValidSession(userData: any): boolean {
    if (!userData || !userData.username || !userData.loginTime) return false;
    return !this.isSessionExpired(userData);
  }

  private isSessionExpired(userData: any): boolean {
    const now     = Date.now();
    const timeout = userData.rememberMe
      ? this.SESSION_CONFIG.REMEMBER_ME_TIMEOUT
      : this.SESSION_CONFIG.SESSION_TIMEOUT;
    const expired = (now - userData.loginTime) > timeout;
    if (expired) console.log(`⏰ Session expired after ${timeout / 60_000} minutes`);
    return expired;
  }

  private shouldRenewSession(userData: any): boolean {
    const now     = Date.now();
    const timeout = userData.rememberMe
      ? this.SESSION_CONFIG.REMEMBER_ME_TIMEOUT
      : this.SESSION_CONFIG.SESSION_TIMEOUT;
    return (userData.loginTime + timeout) - now < this.SESSION_CONFIG.RENEWAL_WINDOW;
  }

  private renewSession(userData: any) {
    userData.loginTime  = Date.now();
    userData.renewedAt  = Date.now();
    this.saveUserToStorage(userData, userData.rememberMe);
  }

  private startIdleTimer() {
    let idleTime = 0;
    const resetIdle = () => { idleTime = 0; };

    ['mousemove', 'keypress', 'touchstart', 'click', 'scroll'].forEach(e =>
      window.addEventListener(e, resetIdle)
    );

    const idleInterval = setInterval(() => {
      idleTime += 60_000;
      if (idleTime >= this.SESSION_CONFIG.MAX_IDLE_TIME) {
        clearInterval(idleInterval);
        ['mousemove', 'keypress', 'touchstart', 'click', 'scroll'].forEach(e =>
          window.removeEventListener(e, resetIdle)
        );
        this.logout('idle');
      }
    }, 60_000);

    (window as any).idleInterval = idleInterval;
  }

  private getUserFromUrl(): any | null {
    const encryptedData = new URLSearchParams(window.location.search).get('user');
    if (!encryptedData) return null;

    console.log('🔗 Found encrypted data in URL:', encryptedData);
    try {
      const decrypted = this.decryptData(encryptedData);
      if (decrypted?.username) {
        const userData = this.createUserData(
          decrypted.username, decrypted.rememberMe || false,
          decrypted.uid, decrypted.sessionId
        );
        this.saveUserToStorage(userData, userData.rememberMe);
        window.history.replaceState({}, document.title, window.location.pathname);
        return userData;
      }
    } catch (e) { console.error('Failed to decrypt URL data:', e); }
    return null;
  }

  private createUserData(
    username: string, rememberMe: boolean,
    existingUid?: string, existingSessionId?: string
  ): any {
    return {
      username,
      uid:          existingUid      || `temp_${Date.now()}`,
      loginTime:    Date.now(),
      sessionId:    existingSessionId || Math.random().toString(36).substring(2, 15),
      rememberMe,
      createdAt:    Date.now(),
      lastActivity: Date.now(),
      userAgent:    navigator.userAgent,
    };
  }

  private decryptData(encryptedData: string): any | null {
    try {
      const base64 = encryptedData.replace(/_/g, '/').replace(/-/g, '+');
      const bytes  = CryptoJS.AES.decrypt(base64, this.SECRET_KEY);
      const str    = bytes.toString(CryptoJS.enc.Utf8);
      if (!str) throw new Error('Decryption failed - empty result');
      return JSON.parse(str);
    } catch (err) {
      console.error('❌ Decryption error:', err);
      return null;
    }
  }

  private saveUserToStorage(userData: any, remember = true) {
    if (!userData.uid) console.warn('⚠️ Saving user without UID!');
    userData.lastUpdated = Date.now();
    sessionStorage.setItem('gameUser', JSON.stringify(userData));
    if (remember) {
      localStorage.setItem('gameUser', JSON.stringify(userData));
      console.log('💾 Saved to localStorage with UID:', userData.uid);
    } else {
      localStorage.removeItem('gameUser');
      console.log('📦 Saved to sessionStorage only with UID:', userData.uid);
    }
  }

  private getCookie(name: string): string | null {
    for (const cookie of document.cookie.split(';')) {
      const sep = cookie.trim().indexOf('=');
      if (sep > 0 && cookie.trim().substring(0, sep) === name) {
        return cookie.trim().substring(sep + 1);
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

  private logout(reason = 'user') {
    console.log(`🚪 Logging out, reason: ${reason}`);
    this.clearUserData();
    if ((window as any).idleInterval) clearInterval((window as any).idleInterval);
    const gameId = this.registry.get('gameId') || 'flappy-bird';
    const messages: Record<string, string> = {
      expired: 'Your session has expired. Please log in again.',
      idle:    'You were idle too long. Please log in again.',
    };
    this.showLoginScreen(gameId, messages[reason] || 'Please log in to play');
  }

  private showLoginScreen(gameId = 'flappy-bird', message = 'Please log in to play') {
    this.cameras.main.setBackgroundColor('#0a0a2a');
    const gameName = this.GAME_NAMES[gameId] || 'Game';

    this.add.text(180, 120, `🎮 ${gameName}`, {
      fontSize: '36px', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(180, 200, message, {
      fontSize: '16px', color: '#ffff00', wordWrap: { width: 280 },
    }).setOrigin(0.5);

    this.add.text(180, 280, '🔐 LOGIN', {
      fontSize: '24px', color: '#ffffff',
      backgroundColor: '#4CAF50', padding: { x: 40, y: 15 },
    })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => { window.location.href = 'https://wintapgames.com/games'; });

    this.add.text(180, 440,
      '⏱️ Session: 30 minutes\n💤 Idle timeout: 15 minutes\n💾 Remember me: 7 days', {
        fontSize: '12px', color: '#888888', align: 'center',
      }).setOrigin(0.5);
  }

  private getUserFromWindow(): any | null {
    if (typeof window === 'undefined' || !(window as any).gameUser) return null;
    const userData = (window as any).gameUser;
    if (!userData.username) return null;

    const formatted = this.createUserData(
      userData.username, userData.rememberMe || false, userData.uid, userData.sessionId
    );
    if (userData.displayName) formatted.displayName = userData.displayName;
    if (userData.email)       formatted.email       = userData.email;
    return formatted;
  }
}