import Phaser from 'phaser';
import { 
  firebaseQueries, 
  CompleteUser,
  LeaderboardEntry,
  SearchResult,
  Transaction
} from '../firebase/firebase.queries';

export class TestScene extends Phaser.Scene {
  // UI Elements
  private titleText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private resultsContainer!: Phaser.GameObjects.Container;
  private resultsText: Phaser.GameObjects.Text[] = [];
  private loadingIndicator!: Phaser.GameObjects.Text;
  
  // Buttons
  private buttons: Phaser.GameObjects.Text[] = [];
  private backButton!: Phaser.GameObjects.Text;
  private categoryButtons: Phaser.GameObjects.Text[] = [];
  
  // Current data
  private currentUser: CompleteUser | null = null;
  private currentCategory: string = 'users';
  
  constructor() {
    super({ key: 'TestScene' });
  }
  
  create() {
    console.log('🧪 TestScene created');
    
    // Set background
    this.cameras.main.setBackgroundColor('#1a1a2e');
    
    // Add title
    this.addTitle();
    
    // Add category selector
    this.createCategorySelector();
    
    // Add status display
    this.createStatusDisplay();
    
    // Create test buttons
    this.createTestButtons();
    
    // Create results container
    this.createResultsContainer();
    
    // Add back button
    this.createBackButton();
    
    // Add instructions
    this.addInstructions();
    
    // Set default category
    this.selectCategory('users');
  }
  
  private addTitle() {
    this.titleText = this.add.text(400, 40, '🔥 FIREBASE QUERY TESTER', {
      fontSize: '32px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
      shadow: { offsetX: 2, offsetY: 2, color: '#000000', blur: 2, fill: true }
    }).setOrigin(0.5);
  }
  
  private createCategorySelector() {
    const categories = [
      { text: '👤 USERS', y: 80, color: '#4CAF50', category: 'users' },
      { text: '🏆 LEADERBOARD', y: 80, color: '#FF9800', category: 'leaderboard' },
      { text: '💰 WALLET', y: 80, color: '#2196F3', category: 'wallet' },
      { text: '📊 STATS', y: 80, color: '#9C27B0', category: 'stats' }
    ];
    
    categories.forEach((cat, index) => {
      const button = this.add.text(150 + (index * 130), cat.y, cat.text, {
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: cat.color,
        padding: { x: 8, y: 4 }
      })
      .setInteractive({ useHandCursor: true })
      .setVisible(false); // Hidden initially
      
      button.on('pointerdown', () => this.selectCategory(cat.category));
      
      this.categoryButtons.push(button);
    });
  }
  
  private createStatusDisplay() {
    // Status background
    const statusBg = this.add.graphics();
    statusBg.fillStyle(0x16213e, 0.8);
    statusBg.fillRoundedRect(20, 110, 760, 60, 10);
    
    // Status text
    this.statusText = this.add.text(40, 130, '⏳ Ready to test queries...', {
      fontSize: '18px',
      color: '#ffff00'
    });
    
    // Loading indicator
    this.loadingIndicator = this.add.text(700, 130, '🔄', {
      fontSize: '24px',
      color: '#00ff00'
    });
    this.loadingIndicator.setVisible(false);
  }
  
  private createTestButtons() {
    const buttonStyle = {
      fontSize: '16px',
      color: '#ffffff',
      backgroundColor: '#0f3460',
      padding: { x: 8, y: 6 },
      stroke: '#4a4a4a',
      strokeThickness: 2
    };
    
    const buttonHoverStyle = {
      color: '#ffff00',
      backgroundColor: '#1a4a8a'
    };
    
    // User category buttons
    const userTests = [
      { text: '👤 Get "nicklaus"', y: 190, action: () => this.testGetUser('nicklaus') },
      { text: '📧 Get by Email', y: 240, action: () => this.testGetUserByEmail() },
      { text: '🔍 Search "nick"', y: 290, action: () => this.testSearchUsers('nick') },
      { text: '📋 Get by UID', y: 340, action: () => this.testGetUserByUid() },
      { text: '👥 All Users', y: 390, action: () => this.testGetAllUsers() },
      { text: '🆕 User Count', y: 440, action: () => this.testGetUserCount() }
    ];
    
    // Leaderboard category buttons
    const leaderboardTests = [
      { text: '🏆 Top 10 Players', y: 190, action: () => this.testGetLeaderboard(10) },
      { text: '🥇 Gold Rank', y: 240, action: () => this.testGetLeaderboardByRank('Gold') },
      { text: '🥈 Silver Rank', y: 290, action: () => this.testGetLeaderboardByRank('Silver') },
      { text: '🥉 Bronze Rank', y: 340, action: () => this.testGetLeaderboardByRank('Bronze') },
      { text: '📊 My Rank', y: 390, action: () => this.testGetMyRank() }
    ];
    
    // Wallet category buttons
    const walletTests = [
      { text: '💰 Get Balance', y: 190, action: () => this.testGetBalance('nicklaus') },
      { text: '💳 Wallet Details', y: 240, action: () => this.testGetWallet('nicklaus') },
      { text: '📜 Transactions', y: 290, action: () => this.testGetTransactions('nicklaus') },
      { text: '➕ Add Funds', y: 340, action: () => this.testAddFunds() },
      { text: '➖ Spend Funds', y: 390, action: () => this.testSpendFunds() }
    ];
    
    // Stats category buttons
    const statsTests = [
      { text: '📊 Get Stats', y: 190, action: () => this.testGetStats('nicklaus') },
      { text: '🎮 Update Game', y: 240, action: () => this.testUpdateGameStats() },
      { text: '🏆 Check Achievements', y: 290, action: () => this.testCheckAchievements() },
      { text: '📈 Experience', y: 340, action: () => this.testGetExperience() }
    ];
    
    // Store all buttons
    this.buttons = [];
    
    // Create all button sets
    [...userTests, ...leaderboardTests, ...walletTests, ...statsTests].forEach((test) => {
      const button = this.add.text(200, test.y, test.text, buttonStyle)
        .setInteractive({ useHandCursor: true })
        .setVisible(false);
      
      button.on('pointerover', () => {
        button.setStyle(buttonHoverStyle);
        button.setScale(1.05);
      });
      
      button.on('pointerout', () => {
        button.setStyle(buttonStyle);
        button.setScale(1);
      });
      
      button.on('pointerdown', () => {
        this.clearResults();
        this.showLoading();
        test.action();
      });
      
      this.buttons.push(button);
    });
    
    // Store button sets for category switching
    (this as any).userButtons = userTests.map((_, i) => this.buttons[i]);
    (this as any).leaderboardButtons = leaderboardTests.map((_, i) => this.buttons[userTests.length + i]);
    (this as any).walletButtons = walletTests.map((_, i) => this.buttons[userTests.length + leaderboardTests.length + i]);
    (this as any).statsButtons = statsTests.map((_, i) => this.buttons[userTests.length + leaderboardTests.length + walletTests.length + i]);
  }
  
  private selectCategory(category: string) {
    this.currentCategory = category;
    
    // Update category buttons
    this.categoryButtons.forEach((btn, i) => {
      btn.setStyle({ backgroundColor: i === ['users', 'leaderboard', 'wallet', 'stats'].indexOf(category) ? '#ffd700' : '#4a4a4a' });
    });
    
    // Show/hide relevant buttons
    (this as any).userButtons.forEach((btn: Phaser.GameObjects.Text) => btn.setVisible(category === 'users'));
    (this as any).leaderboardButtons.forEach((btn: Phaser.GameObjects.Text) => btn.setVisible(category === 'leaderboard'));
    (this as any).walletButtons.forEach((btn: Phaser.GameObjects.Text) => btn.setVisible(category === 'wallet'));
    (this as any).statsButtons.forEach((btn: Phaser.GameObjects.Text) => btn.setVisible(category === 'stats'));
    
    this.statusText.setText(`📂 Category: ${category.toUpperCase()}`);
  }
  
  private createResultsContainer() {
    // Results background
    const resultsBg = this.add.graphics();
    resultsBg.fillStyle(0x16213e, 0.9);
    resultsBg.fillRoundedRect(420, 170, 360, 400, 10);
    resultsBg.lineStyle(2, 0x4a4a4a, 1);
    resultsBg.strokeRoundedRect(420, 170, 360, 400, 10);
    
    // Results title
    this.add.text(600, 180, '📊 RESULTS', {
      fontSize: '20px',
      color: '#ffd700',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    
    // Results container
    this.resultsContainer = this.add.container(440, 210);
  }
  
  private createBackButton() {
    this.backButton = this.add.text(50, 550, '← BACK TO MENU', {
      fontSize: '18px',
      color: '#ffffff',
      backgroundColor: '#e94560',
      padding: { x: 12, y: 6 }
    })
    .setInteractive({ useHandCursor: true });
    
    this.backButton.on('pointerover', () => {
      this.backButton.setStyle({ color: '#ffff00', backgroundColor: '#c73e54' });
      this.backButton.setScale(1.05);
    });
    
    this.backButton.on('pointerout', () => {
      this.backButton.setStyle({ color: '#ffffff', backgroundColor: '#e94560' });
      this.backButton.setScale(1);
    });
    
    this.backButton.on('pointerdown', () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('StartScene');
      });
    });
  }
  
  private addInstructions() {
    this.add.text(600, 580, 'Click buttons to test queries', {
      fontSize: '12px',
      color: '#888888'
    }).setOrigin(0.5);
  }
  
  private showLoading() {
    this.loadingIndicator.setVisible(true);
    this.statusText.setText('⏳ Running query...');
    this.statusText.setColor('#ffff00');
    
    this.tweens.add({
      targets: this.loadingIndicator,
      angle: 360,
      duration: 1000,
      repeat: -1
    });
  }
  
  private hideLoading() {
    this.loadingIndicator.setVisible(false);
    this.tweens.killTweensOf(this.loadingIndicator);
    this.loadingIndicator.angle = 0;
  }
  
  private clearResults() {
    this.resultsContainer.removeAll(true);
    this.resultsText = [];
  }
  
  private displayResult(lines: string[], isError: boolean = false) {
    this.hideLoading();
    
    if (isError) {
      this.statusText.setText('❌ Query failed');
      this.statusText.setColor('#ff0000');
    } else {
      this.statusText.setText('✅ Query successful');
      this.statusText.setColor('#00ff00');
    }
    
    lines.forEach((line, index) => {
      const text = this.add.text(0, index * 22, line, {
        fontSize: '13px',
        color: isError ? '#ff8888' : '#ffffff',
        fontFamily: 'monospace',
        wordWrap: { width: 340 }
      });
      this.resultsContainer.add(text);
      this.resultsText.push(text);
    });
  }
  
  // =========== USER TESTS ===========
  
  private async testGetUser(username: string) {
    try {
      const user = await firebaseQueries.getUserByUsername(username);
      
      if (user) {
        this.currentUser = user;
        this.displayResult([
          '✅ USER FOUND:',
          `🆔 UID: ${user.uid}`,
          `👤 Username: ${user.public.username}`,
          `📛 Display: ${user.public.displayName}`,
          `📧 Email: ${user.private.email}`,
          `🏅 Rank: ${user.public.rank}`,
          `📊 Level: ${user.public.level}`,
          `💰 Balance: $${user.wallet.balance}`,
          `🏆 High Score: ${user.stats.highScore}`,
          `🎮 Games: ${user.stats.totalGames}`,
          `📅 Joined: ${new Date(user.public.createdAt).toLocaleDateString()}`
        ]);
      } else {
        this.displayResult([`❌ User "${username}" not found`], true);
      }
    } catch (error) {
      this.displayResult(['❌ Error:', String(error)], true);
    }
  }
  
  private async testGetUserByEmail() {
    const email = 'nicklaus@example.com';
    try {
      const user = await firebaseQueries.getUserByEmail(email);
      
      if (user) {
        this.displayResult([
          '✅ USER FOUND BY EMAIL:',
          `👤 ${user.public.displayName}`,
          `📧 ${user.private.email}`,
          `🆔 ${user.uid}`
        ]);
      } else {
        this.displayResult([`❌ Email "${email}" not found`], true);
      }
    } catch (error) {
      this.displayResult(['❌ Error:', String(error)], true);
    }
  }
  
  private async testGetUserByUid() {
    if (!this.currentUser) {
      this.displayResult(['❌ No user selected', 'Run "Get nicklaus" first'], true);
      return;
    }
    
    try {
      const user = await firebaseQueries.getUserByUid(this.currentUser.uid);
      
      if (user) {
        this.displayResult([
          '✅ USER BY UID:',
          `🆔 ${user.uid}`,
          `👤 ${user.public.username}`,
          `✅ Verified`
        ]);
      }
    } catch (error) {
      this.displayResult(['❌ Error:', String(error)], true);
    }
  }
  
  private async testSearchUsers(term: string) {
    try {
      const results = await firebaseQueries.searchUsers(term);
      
      if (results.length > 0) {
        const lines = [`✅ Found ${results.length} users:`, ''];
        results.forEach((user, i) => {
          lines.push(`${i + 1}. ${user.displayName} (@${user.username}) - ${user.rank}`);
        });
        this.displayResult(lines);
      } else {
        this.displayResult([`❌ No users matching "${term}"`], true);
      }
    } catch (error) {
      this.displayResult(['❌ Error:', String(error)], true);
    }
  }
  
  private async testGetAllUsers() {
    try {
      const users = await firebaseQueries.getAllUsers();
      
      const lines = [`👥 TOTAL USERS: ${users.length}`, ''];
      users.slice(0, 8).forEach((user, i) => {
        lines.push(`${i + 1}. ${user.public.displayName} (Lvl ${user.public.level})`);
      });
      
      if (users.length > 8) {
        lines.push(`... and ${users.length - 8} more`);
      }
      
      this.displayResult(lines);
    } catch (error) {
      this.displayResult(['❌ Error:', String(error)], true);
    }
  }
  
  private async testGetUserCount() {
    try {
      const count = await firebaseQueries.getUserCount();
      const active = await firebaseQueries.getActiveUsers();
      
      this.displayResult([
        '📊 USER STATISTICS:',
        `👥 Total Users: ${count}`,
        `🟢 Active Now: ${active}`,
        `📈 Growth: +${Math.floor(count * 0.1)} this week`
      ]);
    } catch (error) {
      this.displayResult(['❌ Error:', String(error)], true);
    }
  }
  
  // =========== LEADERBOARD TESTS ===========
  
  private async testGetLeaderboard(limit: number) {
    try {
      const leaderboard = await firebaseQueries.getLeaderboard(limit);
      
      if (leaderboard.length > 0) {
        const lines = ['🏆 TOP PLAYERS:', ''];
        leaderboard.forEach((player, i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
          lines.push(`${medal} ${player.displayName} - ${player.highScore} pts (Lvl ${player.level})`);
        });
        this.displayResult(lines);
      }
    } catch (error) {
      this.displayResult(['❌ Error:', String(error)], true);
    }
  }
  
  private async testGetLeaderboardByRank(rank: string) {
    try {
      const players = await firebaseQueries.getLeaderboardByRank(rank, 5);
      
      const lines = [`🏆 TOP ${rank.toUpperCase()} PLAYERS:`, ''];
      players.forEach((player, i) => {
        lines.push(`${i + 1}. ${player.displayName} - ${player.highScore} pts`);
      });
      
      this.displayResult(lines);
    } catch (error) {
      this.displayResult(['❌ Error:', String(error)], true);
    }
  }
  
  private async testGetMyRank() {
    if (!this.currentUser) {
      this.displayResult(['❌ No user selected', 'Run "Get nicklaus" first'], true);
      return;
    }
    
    try {
      const leaderboard = await firebaseQueries.getLeaderboard(100);
      const myRank = leaderboard.findIndex(p => p.uid === this.currentUser?.uid) + 1;
      
      this.displayResult([
        `👤 ${this.currentUser.public.displayName}'s RANK:`,
        `🏆 Global Rank: #${myRank}`,
        `📊 High Score: ${this.currentUser.stats.highScore}`,
        `🏅 Rank: ${this.currentUser.public.rank}`,
        `📈 Better than ${Math.round((1 - myRank/leaderboard.length) * 100)}% of players`
      ]);
    } catch (error) {
      this.displayResult(['❌ Error:', String(error)], true);
    }
  }
  
  // =========== WALLET TESTS ===========
  
  private async testGetBalance(username: string) {
    try {
      const user = await firebaseQueries.getUserByUsername(username);
      
      if (user) {
        const balance = await firebaseQueries.getWalletBalance(user.uid);
        this.displayResult([
          `💰 WALLET BALANCE:`,
          `👤 User: ${username}`,
          `💵 Balance: $${balance.toFixed(2)}`,
          `💱 Currency: USD`,
          `⏱️ Updated: ${new Date(user.wallet.lastUpdated).toLocaleString()}`
        ]);
      }
    } catch (error) {
      this.displayResult(['❌ Error:', String(error)], true);
    }
  }
  
  private async testGetWallet(username: string) {
    try {
      const user = await firebaseQueries.getUserByUsername(username);
      
      if (user) {
        this.displayResult([
          '💳 WALLET DETAILS:',
          `💰 Balance: $${user.wallet.balance}`,
          `🎁 Bonus: $${user.wallet.totalBonus}`,
          `🏆 Won: $${user.wallet.totalWon}`,
          `💸 Lost: $${user.wallet.totalLost}`,
          `📥 Deposited: $${user.wallet.totalDeposited}`,
          `📤 Withdrawn: $${user.wallet.totalWithdrawn}`
        ]);
      }
    } catch (error) {
      this.displayResult(['❌ Error:', String(error)], true);
    }
  }
  
  private async testGetTransactions(username: string) {
    try {
      const user = await firebaseQueries.getUserByUsername(username);
      
      if (user) {
        const transactions = await firebaseQueries.getUserTransactions(user.uid, 5);
        
        if (transactions.length > 0) {
          const lines = ['📜 RECENT TRANSACTIONS:', ''];
          transactions.forEach((tx, i) => {
            const sign = tx.amount > 0 ? '+' : '';
            lines.push(`${i + 1}. ${sign}$${tx.amount} - ${tx.description}`);
          });
          this.displayResult(lines);
        } else {
          this.displayResult(['📜 No transactions found']);
        }
      }
    } catch (error) {
      this.displayResult(['❌ Error:', String(error)], true);
    }
  }
  
  private async testAddFunds() {
    if (!this.currentUser) {
      this.displayResult(['❌ No user selected'], true);
      return;
    }
    
    try {
      const success = await firebaseQueries.updateWalletBalance(
        this.currentUser.uid,
        10.00,
        'bonus',
        'Test bonus'
      );
      
      if (success) {
        const newBalance = await firebaseQueries.getWalletBalance(this.currentUser.uid);
        this.displayResult([
          '✅ FUNDS ADDED:',
          `➕ Added: $10.00`,
          `💰 New Balance: $${newBalance}`,
          `⏱️ ${new Date().toLocaleTimeString()}`
        ]);
        
        // Refresh user data
        this.currentUser = await firebaseQueries.getUserByUid(this.currentUser.uid);
      }
    } catch (error) {
      this.displayResult(['❌ Error:', String(error)], true);
    }
  }
  
  private async testSpendFunds() {
    if (!this.currentUser) {
      this.displayResult(['❌ No user selected'], true);
      return;
    }
    
    try {
      const success = await firebaseQueries.updateWalletBalance(
        this.currentUser.uid,
        -5.00,
        'loss',
        'Game entry fee'
      );
      
      if (success) {
        const newBalance = await firebaseQueries.getWalletBalance(this.currentUser.uid);
        this.displayResult([
          '✅ FUNDS SPENT:',
          `➖ Spent: $5.00`,
          `💰 New Balance: $${newBalance}`,
          `⏱️ ${new Date().toLocaleTimeString()}`
        ]);
        
        // Refresh user data
        this.currentUser = await firebaseQueries.getUserByUid(this.currentUser.uid);
      } else {
        this.displayResult(['❌ Insufficient funds'], true);
      }
    } catch (error) {
      this.displayResult(['❌ Error:', String(error)], true);
    }
  }
  
  // =========== STATS TESTS ===========
  
  private async testGetStats(username: string) {
    try {
      const user = await firebaseQueries.getUserByUsername(username);
      
      if (user) {
        this.displayResult([
          '📊 PLAYER STATS:',
          `🏆 High Score: ${user.stats.highScore}`,
          `🎮 Total Games: ${user.stats.totalGames}`,
          `🏅 Wins: ${user.stats.totalWins}`,
          `💔 Losses: ${user.stats.totalLosses}`,
          `🔥 Win Streak: ${user.stats.winStreak}`,
          `✨ Experience: ${user.stats.experience}`,
          `🏅 Rank: ${user.public.rank}`,
          `📈 Level: ${user.public.level}`,
          `🎯 Achievements: ${user.stats.achievements.length}`
        ]);
      }
    } catch (error) {
      this.displayResult(['❌ Error:', String(error)], true);
    }
  }
  
  private async testUpdateGameStats() {
    if (!this.currentUser) {
      this.displayResult(['❌ No user selected'], true);
      return;
    }
    
    try {
      const newScore = Math.floor(Math.random() * 200) + 50;
      const won = Math.random() > 0.5;
      
      await firebaseQueries.updateUserStats(this.currentUser.uid, newScore, won);
      
      // Refresh user data
      this.currentUser = await firebaseQueries.getUserByUid(this.currentUser.uid);
      
      this.displayResult([
        '✅ GAME STATS UPDATED:',
        `🎮 New Score: ${newScore}`,
        `🏆 Result: ${won ? 'WIN' : 'LOSS'}`,
        `📊 High Score: ${this.currentUser?.stats.highScore}`,
        `🔥 Win Streak: ${this.currentUser?.stats.winStreak}`
      ]);
    } catch (error) {
      this.displayResult(['❌ Error:', String(error)], true);
    }
  }
  
  private async testCheckAchievements() {
    if (!this.currentUser) {
      this.displayResult(['❌ No user selected'], true);
      return;
    }
    
    try {
      const unlocked = await firebaseQueries.checkAchievements(
        this.currentUser.uid,
        this.currentUser.stats.highScore
      );
      
      if (unlocked.length > 0) {
        this.displayResult([
          '🏆 ACHIEVEMENTS UNLOCKED:',
          ...unlocked.map(a => `  ✨ ${a}`),
          '',
          `💰 Bonus: $${unlocked.length * 5}.00 added!`
        ]);
        
        // Refresh user data
        this.currentUser = await firebaseQueries.getUserByUid(this.currentUser.uid);
      } else {
        this.displayResult(['📋 No new achievements']);
      }
    } catch (error) {
      this.displayResult(['❌ Error:', String(error)], true);
    }
  }
  
  private async testGetExperience() {
    if (!this.currentUser) {
      this.displayResult(['❌ No user selected'], true);
      return;
    }
    
    const nextLevelExp = this.currentUser.public.level * 100;
    const expToNext = nextLevelExp - this.currentUser.stats.experience;
    
    this.displayResult([
      '📈 EXPERIENCE PROGRESS:',
      `✨ Current EXP: ${this.currentUser.stats.experience}`,
      `📊 Level: ${this.currentUser.public.level}`,
      `🎯 Next Level: ${nextLevelExp} EXP`,
      `📉 Need: ${expToNext} more EXP`,
      `📈 Progress: ${Math.round((this.currentUser.stats.experience / nextLevelExp) * 100)}%`
    ]);
  }
}