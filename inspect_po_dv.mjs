// ตรวจว่าทำไมชื่อช่างจาก PO ไม่ขึ้นในหน้า DV (read-only)
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const app = initializeApp({
    apiKey: 'AIzaSyDST4qYOlsdVUVjXL7KiMJtz2GXXCtEwTI',
    authDomain: 'boq-system-react.firebaseapp.com',
    projectId: 'boq-system-react',
});
await signInWithEmailAndPassword(getAuth(app), 'dev@nutcon.com', process.argv[2]);
const s = (await getDoc(doc(getFirestore(app), 'construction_data', 'main_system'))).data();

for (const p of s.projects) {
    const pos = (p.data.docs || []).filter(d => d.type === 'PO');
    if (pos.length === 0) continue;
    console.log(`\n=== แปลง: ${p.name} [${p.group || 'ไม่มี group'}] — PO ${pos.length} ใบ ===`);
    const boq = p.data.boq || [];
    const boqById = new Map(boq.map(i => [i.id, i]));
    for (const po of pos.slice(-5)) {
        console.log(`  PO ${po.no} | ผู้รับจ้าง: "${po.contractor}" | ${po.date} | ${po.items?.length ?? 0} รายการ`);
        (po.items || []).forEach(i => {
            const b = boqById.get(i.id);
            console.log(`     - ${String(i.name).substring(0, 40)} | cart lPrice=${i.lPrice ?? '-'} | BOQ: ${b ? `พบ (lP=${b.lP}, con="${b.con}")` : '❌ ไม่พบ id ใน BOQ'}`);
        });
    }
    // จำลอง logic DV: รายชื่อช่าง
    const contractors = new Set();
    boq.forEach(i => { if (i.type !== 'header' && i.con && parseFloat(i.lP) > 0) contractors.add(i.con); });
    pos.forEach(po => {
        const name = (po.contractor || '').trim();
        if (!name) return;
        const ids = new Set((po.items || []).map(i => i.id));
        if (boq.some(i => i.type !== 'header' && parseFloat(i.lP) > 0 && ids.has(i.id))) contractors.add(name);
    });
    console.log(`  → รายชื่อช่างที่ DV ควรแสดง: [${[...contractors].join(', ') || 'ว่าง'}]`);
}
process.exit(0);
