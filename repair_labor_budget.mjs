// ซ่อมข้อมูล: รายการ BOQ ที่ราคาค่าแรง/วัสดุ = 0 แต่เคยตกลงราคาไว้ในใบ PO
// → ตั้งราคาจาก PO เป็นงบใน BOQ (แก้ช่อง "เหลือ" ติดลบจากข้อมูลเก่า)
// Usage: node repair_labor_budget.mjs "<dev password>" [--dry-run]
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, collection, addDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { firebaseNodeConfig } from './firebase-node-config.mjs';

const DRY = process.argv.includes('--dry-run');
const app = initializeApp(firebaseNodeConfig);
await signInWithEmailAndPassword(getAuth(app), 'dev@nutcon.com', process.argv[2]);
const db = getFirestore(app);
const ref = doc(db, 'construction_data', 'main_system');
const system = (await getDoc(ref)).data();
const sanitize = v => JSON.parse(JSON.stringify(v, (_, x) => x === undefined ? null : x));
const originalSnapshot = sanitize(system); // เก็บสำเนาเดิมไว้สำรอง ก่อนแก้ไขใดๆ

let totalFix = 0;
const log = [];

for (const p of system.projects) {
    const boq = p.data?.boq || [];
    const pos = (p.data?.docs || []).filter(d => d.type === 'PO');
    if (!pos.length) continue;

    // ราคาสูงสุดที่เคยตกลงใน PO ต่อ item
    const poLp = new Map(), poMp = new Map();
    pos.forEach(po => (po.items || []).forEach(i => {
        const k = String(i.id);
        const lp = parseFloat(i.lPrice) || 0, mp = parseFloat(i.mPrice) || 0;
        if (lp > (poLp.get(k) || 0)) poLp.set(k, lp);
        if (mp > (poMp.get(k) || 0)) poMp.set(k, mp);
    }));

    p.data.boq = boq.map(item => {
        if (item.type !== 'item') return item;
        const k = String(item.id);
        let next = item;
        const lp = poLp.get(k) || 0, mp = poMp.get(k) || 0;
        if ((parseFloat(next.lP) || 0) <= 0 && lp > 0) {
            next = { ...next, lP: lp };
            log.push(`[${p.group || '-'} / ${p.name}] ${String(item.name).substring(0, 40)} : ค่าแรง 0 → ${lp}`);
            totalFix++;
        }
        if ((parseFloat(next.mP) || 0) <= 0 && mp > 0) {
            next = { ...next, mP: mp };
            log.push(`[${p.group || '-'} / ${p.name}] ${String(item.name).substring(0, 40)} : วัสดุ 0 → ${mp}`);
            totalFix++;
        }
        return next;
    });
}

console.log(log.length ? log.join('\n') : 'ไม่พบรายการที่ต้องซ่อม');
console.log(`\nรวมแก้ ${totalFix} จุด`);

if (DRY) { console.log('🧪 dry-run — ไม่เขียนข้อมูล'); process.exit(0); }
if (totalFix === 0) process.exit(0);

console.log('\n🛟 สำรองข้อมูลก่อนซ่อม...');
await addDoc(collection(db, 'backups'), {
    createdAt: new Date().toISOString(),
    createdBy: 'repair_labor_budget.mjs',
    label: `ก่อนซ่อมงบค่าแรง ${new Date().toLocaleString('th-TH')}`,
    projectCount: originalSnapshot.projects.length,
    data: originalSnapshot,
});
console.log('💾 บันทึก...');
await setDoc(ref, sanitize(system));
console.log('✅ ซ่อมเรียบร้อย');
process.exit(0);
