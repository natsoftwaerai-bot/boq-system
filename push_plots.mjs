// อ่าน _import_plots.json แล้ว push เข้า Firebase
// Usage: node push_plots.mjs "<dev password>" "<ชื่อโครงการ>" [--merge]
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, collection, addDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { readFileSync } from 'fs';
import { firebaseNodeConfig } from './firebase-node-config.mjs';

const PASSWORD = process.argv[2];
const GROUP = process.argv[3];
const MERGE = process.argv.includes('--merge');
if (!PASSWORD || !GROUP) { console.error('Usage: node push_plots.mjs "<password>" "<group>" [--merge]'); process.exit(1); }

const app = initializeApp(firebaseNodeConfig);
const sanitize = v => JSON.parse(JSON.stringify(v, (_, x) => x === undefined ? null : x));

const plots = JSON.parse(readFileSync('_import_plots.json', 'utf8'));
console.log(`อ่าน ${plots.length} แปลง จาก _import_plots.json (โครงการ "${GROUP}")`);

await signInWithEmailAndPassword(getAuth(app), 'dev@nutcon.com', PASSWORD);
const db = getFirestore(app);
const ref = doc(db, 'construction_data', 'main_system');
const system = (await getDoc(ref)).data();
console.log(`ปัจจุบัน ${system.projects.length} แปลง`);

const exists = system.projects.some(p => (p.group || '') === GROUP);
if (exists && !MERGE) { console.error(`⚠️ มีโครงการ "${GROUP}" แล้ว — ใส่ --merge`); process.exit(1); }

await addDoc(collection(db, 'backups'), {
    createdAt: new Date().toISOString(), createdBy: 'push_plots.mjs',
    label: `ก่อน import ${GROUP} ${new Date().toLocaleString('th-TH')}`,
    projectCount: system.projects.length, data: sanitize(system),
});
console.log('🛟 สำรองข้อมูลแล้ว');

if (MERGE && exists) {
    const before = system.projects.length;
    system.projects = system.projects.filter(p =>
        !((p.group || '') === GROUP && (p.data?.boq || []).filter(i => i.type === 'item').length === 0)
    );
    const removed = before - system.projects.length;
    if (removed) console.log(`🧹 ลบแปลงว่างในโครงการเดิม ${removed} แปลง`);
}
system.projects = [...system.projects, ...plots];
await setDoc(ref, sanitize(system));
console.log(`\n✅ สำเร็จ! เพิ่ม ${plots.length} แปลงในโครงการ "${GROUP}" — รวม ${system.projects.length} แปลง`);
process.exit(0);
