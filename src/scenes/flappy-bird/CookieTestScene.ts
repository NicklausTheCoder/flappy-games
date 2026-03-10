import Phaser from 'phaser';

export class CookieTestScene extends Phaser.Scene {
  private cookies: { name: string; value: string }[] = [];
  private cookieTexts: Phaser.GameObjects.Text[] = [];
  private statusText!: Phaser.GameObjects.Text;
  
  constructor() {
    super({ key: 'CookieTestScene' });
  }
  
  create() {
    // Background
    this.cameras.main.setBackgroundColor('#1a1a2e');
    
    // Title
    this.add.text(180, 30, '🍪 COOKIE TESTER', {
      fontSize: '24px',
      color: '#ffd700',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);
    
    // Instructions
    this.add.text(180, 70, 'Check and manage cookies', {
      fontSize: '14px',
      color: '#cccccc'
    }).setOrigin(0.5);
    
    // Status display
    this.statusText = this.add.text(180, 110, 'Loading cookies...', {
      fontSize: '16px',
      color: '#ffff00'
    }).setOrigin(0.5);
    
    // Cookies container background
    const cookiesBg = this.add.graphics();
    cookiesBg.fillStyle(0x16213e, 0.8);
    cookiesBg.fillRoundedRect(20, 140, 320, 300, 10);
    cookiesBg.lineStyle(1, 0xffd700);
    cookiesBg.strokeRoundedRect(20, 140, 320, 300, 10);
    
    // Cookies header
    this.add.text(40, 150, 'Current Cookies:', {
      fontSize: '16px',
      color: '#ffd700',
      fontStyle: 'bold'
    });
    
    // Refresh cookies button
    const refreshBtn = this.add.text(280, 150, '🔄', {
      fontSize: '20px',
      color: '#ffffff'
    })
    .setInteractive({ useHandCursor: true });
    
    refreshBtn.on('pointerover', () => refreshBtn.setStyle({ color: '#ffff00' }));
    refreshBtn.on('pointerout', () => refreshBtn.setStyle({ color: '#ffffff' }));
    refreshBtn.on('pointerdown', () => this.loadCookies());
    
    // Load cookies
    this.loadCookies();
    
    // Create test buttons
    this.createTestButtons();
    
    // Back button
    this.createBackButton();
  }
  
  private loadCookies() {
    // Clear old texts
    this.cookieTexts.forEach(text => text.destroy());
    this.cookieTexts = [];
    
    // Parse cookies
    this.cookies = [];
    const cookieString = document.cookie;
    
    if (cookieString) {
      const cookiePairs = cookieString.split(';');
      cookiePairs.forEach(pair => {
        const trimmed = pair.trim();
        if (trimmed) {
          const separatorIndex = trimmed.indexOf('=');
          if (separatorIndex > 0) {
            const name = trimmed.substring(0, separatorIndex);
            const value = trimmed.substring(separatorIndex + 1);
            this.cookies.push({ name, value });
          }
        }
      });
    }
    
    // Update status
    if (this.cookies.length > 0) {
      this.statusText.setText(`✅ Found ${this.cookies.length} cookie(s)`);
      this.statusText.setColor('#00ff00');
    } else {
      this.statusText.setText('❌ No cookies found');
      this.statusText.setColor('#ff0000');
    }
    
    // Display cookies
    let yPos = 190;
    if (this.cookies.length === 0) {
      const text = this.add.text(40, yPos, 'No cookies set', {
        fontSize: '14px',
        color: '#888888',
        fontStyle: 'italic'
      });
      this.cookieTexts.push(text);
    } else {
      this.cookies.forEach((cookie, index) => {
        // Cookie name
        const nameText = this.add.text(40, yPos + (index * 30), `${cookie.name}:`, {
          fontSize: '14px',
          color: '#ffd700',
          fontStyle: 'bold'
        });
        this.cookieTexts.push(nameText);
        
        // Cookie value
        const valueText = this.add.text(120, yPos + (index * 30), cookie.value, {
          fontSize: '14px',
          color: cookie.name === 'username' ? '#00ff00' : '#ffffff',
          fontStyle: cookie.name === 'username' ? 'bold' : 'normal'
        });
        this.cookieTexts.push(valueText);
        
        // Delete button for this cookie
        const deleteBtn = this.add.text(280, yPos + (index * 30) - 5, '❌', {
          fontSize: '16px',
          color: '#ff6666'
        })
        .setInteractive({ useHandCursor: true });
        
        deleteBtn.on('pointerover', () => deleteBtn.setStyle({ color: '#ff0000' }));
        deleteBtn.on('pointerout', () => deleteBtn.setStyle({ color: '#ff6666' }));
        deleteBtn.on('pointerdown', () => this.deleteCookie(cookie.name));
        
        this.cookieTexts.push(deleteBtn);
      });
    }
  }
  
  private createTestButtons() {
    // Set test cookie button
    const setBtn = this.add.text(100, 460, '🍪 SET TEST COOKIE', {
      fontSize: '16px',
      color: '#ffffff',
      backgroundColor: '#4CAF50',
      padding: { x: 10, y: 5 }
    })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });
    
    setBtn.on('pointerover', () => {
      setBtn.setStyle({ color: '#ffff00', backgroundColor: '#45a049' });
    });
    
    setBtn.on('pointerout', () => {
      setBtn.setStyle({ color: '#ffffff', backgroundColor: '#4CAF50' });
    });
    
    setBtn.on('pointerdown', () => {
      this.setTestCookie();
    });
    
    // Set username cookie button
    const setUserBtn = this.add.text(260, 460, '👤 SET USERNAME', {
      fontSize: '16px',
      color: '#ffffff',
      backgroundColor: '#2196F3',
      padding: { x: 10, y: 5 }
    })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });
    
    setUserBtn.on('pointerover', () => {
      setUserBtn.setStyle({ color: '#ffff00', backgroundColor: '#1976D2' });
    });
    
    setUserBtn.on('pointerout', () => {
      setUserBtn.setStyle({ color: '#ffffff', backgroundColor: '#2196F3' });
    });
    
    setUserBtn.on('pointerdown', () => {
      this.setUsernameCookie();
    });
    
    // Clear all cookies button
    const clearBtn = this.add.text(180, 520, '🗑️ CLEAR ALL COOKIES', {
      fontSize: '16px',
      color: '#ffffff',
      backgroundColor: '#f44336',
      padding: { x: 10, y: 5 }
    })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });
    
    clearBtn.on('pointerover', () => {
      clearBtn.setStyle({ color: '#ffff00', backgroundColor: '#d32f2f' });
    });
    
    clearBtn.on('pointerout', () => {
      clearBtn.setStyle({ color: '#ffffff', backgroundColor: '#f44336' });
    });
    
    clearBtn.on('pointerdown', () => {
      this.clearAllCookies();
    });
  }
  
  private setTestCookie() {
    const name = `test_${Math.floor(Math.random() * 1000)}`;
    const value = `value_${Date.now()}`;
    document.cookie = `${name}=${value}; path=/; max-age=3600`;
    console.log(`✅ Set cookie: ${name}=${value}`);
    this.loadCookies();
  }
  
  private setUsernameCookie() {
    const username = `user_${Math.floor(Math.random() * 100)}`;
    document.cookie = `username=${username}; path=/; max-age=604800`; // 7 days
    console.log(`✅ Set username cookie: ${username}`);
    this.loadCookies();
  }
  
  private deleteCookie(name: string) {
    document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    console.log(`✅ Deleted cookie: ${name}`);
    this.loadCookies();
  }
  
  private clearAllCookies() {
    const cookies = document.cookie.split(';');
    cookies.forEach(cookie => {
      const name = cookie.split('=')[0].trim();
      document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    });
    console.log('✅ Cleared all cookies');
    this.loadCookies();
  }
  
  private createBackButton() {
    const backBtn = this.add.text(60, 580, '← BACK', {
      fontSize: '18px',
      color: '#ffffff',
      backgroundColor: '#9C27B0',
      padding: { x: 15, y: 8 }
    })
    .setInteractive({ useHandCursor: true });
    
    backBtn.on('pointerover', () => {
      backBtn.setStyle({ color: '#ffff00', backgroundColor: '#7B1FA2' });
    });
    
    backBtn.on('pointerout', () => {
      backBtn.setStyle({ color: '#ffffff', backgroundColor: '#9C27B0' });
    });
    
    backBtn.on('pointerdown', () => {
      this.scene.start('StartScene');
    });
  }
}