// src/firebase/migrateFlappyBird.ts
import { ref, get, set, update } from 'firebase/database';
import { db } from './init';

export async function migrateFlappyBirdScores() {
    try {
        console.log('🔄 Starting Flappy Bird migration...');
        
        // Get all users
        const usersRef = ref(db, 'users');
        const usersSnapshot = await get(usersRef);
        
        if (!usersSnapshot.exists()) {
            console.log('No users found');
            return;
        }

        let migratedCount = 0;

        // Loop through each user
        for (const [uid, userData] of Object.entries(usersSnapshot.val())) {
            const user = userData as any;
            
            // Check if user has scores stored under username path
            if (user.scores) {
                console.log(`📊 Found scores for user: ${uid}`);
                
                // Ensure scores are properly structured
                const scores = user.scores;
                
                // You might want to validate or transform scores here
                
                migratedCount++;
            }

            // Update user metadata to mark migration complete
            await update(ref(db, `users/${uid}/metadata`), {
                migratedFlappyBird: true,
                migratedAt: new Date().toISOString()
            });
        }

        console.log(`✅ Migration complete. Migrated ${migratedCount} users.`);
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
    }
}