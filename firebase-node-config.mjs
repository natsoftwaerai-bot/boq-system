import { loadEnvFile } from 'node:process';

try {
    loadEnvFile('.env');
} catch {
    // รองรับ environment ที่กำหนดค่าจากระบบไว้แล้วและไม่มีไฟล์ .env
}

const required = (name, fallbackName) => {
    const value = process.env[name] || (fallbackName ? process.env[fallbackName] : '');
    if (!value) throw new Error(`Missing environment variable: ${name}`);
    return value;
};

export const firebaseNodeConfig = {
    apiKey: required('VITE_FIREBASE_API_KEY', 'FIREBASE_API_KEY'),
    authDomain: required('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: required('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID,
};
