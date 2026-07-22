// ตรวจสอบข้อมูลใน Firestore หลัง import (read-only)
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { firebaseNodeConfig } from './firebase-node-config.mjs';

const app = initializeApp(firebaseNodeConfig);
await signInWithEmailAndPassword(getAuth(app), 'dev@nutcon.com', process.argv[2]);
const s = (await getDoc(doc(getFirestore(app), 'construction_data', 'main_system'))).data();
const fmt = n => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
console.log(`ทั้งระบบ: ${s.projects.length} แปลง\n`);
for (const p of s.projects) {
    const items = (p.data.boq || []).filter(i => i.type === 'item');
    const m = items.reduce((a, i) => a + i.q * i.mP, 0);
    const l = items.reduce((a, i) => a + i.q * i.lP, 0);
    console.log(`[${p.group || 'โครงการหลัก (ไม่มี group)'}] ${p.name} | items=${items.length} | วัสดุ=${fmt(m)} | ค่าแรง=${fmt(l)}`);
}
process.exit(0);
