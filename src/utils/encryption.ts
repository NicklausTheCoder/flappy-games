// src/utils/encryption.ts
import CryptoJS from 'crypto-js';

// This is like a secret password - both pages need the same one
const SECRET_KEY = 'my-super-secret-key-123';

export class URLEncryption {
    // Turn data into a safe URL string
    static encrypt(data: any): string {
        // 1. Convert to JSON string
        const jsonString = JSON.stringify(data);
        
        // 2. Encrypt it
        const encrypted = CryptoJS.AES.encrypt(jsonString, SECRET_KEY).toString();
        
        // 3. Make it URL-safe (replace / and + which break URLs)
        const urlSafe = encrypted
            .replace(/\//g, '_')
            .replace(/\+/g, '-');
        
        return urlSafe;
    }
    
    // Turn the URL string back into data
    static decrypt(encryptedData: string): any | null {
        try {
            // 1. Restore the original encrypted string
            const base64 = encryptedData
                .replace(/_/g, '/')
                .replace(/-/g, '+');
            
            // 2. Decrypt it
            const decrypted = CryptoJS.AES.decrypt(base64, SECRET_KEY);
            const jsonString = decrypted.toString(CryptoJS.enc.Utf8);
            
            // 3. Parse JSON back to object
            return JSON.parse(jsonString);
        } catch (error) {
            console.error('Decryption failed:', error);
            return null;
        }
    }
}