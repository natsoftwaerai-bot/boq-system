/**
 * run_import.mjs
 * Usage: node run_import.mjs "<password>"
 *
 * อ่าน ต้นทุน BOQ THE ECO_import_ready.xlsx แล้ว import เข้า Firestore
 * เป็น project ใหม่ชื่อ "THE ECO" โดยไม่กระทบโปรเจกต์เดิม
 */

import ExcelJS from 'exceljs';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Firebase config (จาก .env)
const firebaseConfig = {
    apiKey:            'AIzaSyDST4qYOlsdVUVjXL7KiMJtz2GXXCtEwTI',
    authDomain:        'boq-system-react.firebaseapp.com',
    projectId:         'boq-system-react',
    storageBucket:     'boq-system-react.firebasestorage.app',
    messagingSenderId: '987204716777',
    appId:             '1:987204716777:web:f716014c0d887737d1c878',
};

const EMAIL    = 'dev@nutcon.com';
const PASSWORD = process.argv[2];
const PROJECT_NAME = 'THE ECO';
const INPUT_FILE   = path.join(__dirname, 'ต้นทุน BOQ THE ECO_import_ready.xlsx');

if (!PASSWORD) {
    console.error('\n❌ กรุณาระบุรหัสผ่าน: node run_import.mjs "<password>"\n');
    process.exit(1);
}

// ── helpers ──────────────────────────────────────────────────────────────────
const toNum = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const toStr = v => (v == null ? '' : String(v).trim());

function sanitize(val) {
    return JSON.parse(JSON.stringify(val, (_, v) => (v === undefined ? null : v)));
}

// ── อ่าน import_ready.xlsx ─────────────────────────────────────────────────
async function readImportFile() {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(INPUT_FILE);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error('ไม่พบ Sheet ในไฟล์');

    const headers = [];
    const rows = [];

    ws.eachRow((row, rowNum) => {
        if (rowNum === 1) {
            // Row 1 = column headers
            row.eachCell({ includeEmpty: true }, (cell, colNum) => {
                headers[colNum] = toStr(cell.value);
            });
            return;
        }

        const r = {};
        row.eachCell({ includeEmpty: true }, (cell, colNum) => {
            const key = headers[colNum];
            if (key) {
                const v = cell.value;
                r[key] = (v && typeof v === 'object' && 'result' in v) ? v.result : v;
            }
        });

        if (!r['รายการ'] && r['type'] !== 'header') return; // ข้ามแถวว่าง

        rows.push({
            id:    Math.random().toString(36).substr(2, 9),
            type:  r['type'] || 'item',
            level: typeof r['level'] === 'number' ? r['level'] : undefined,
            code:  toStr(r['Code']),
            name:  toStr(r['รายการ']),
            unit:  toStr(r['หน่วย']),
            q:     toNum(r['ปริมาณ']),
            mP:    toNum(r['ค่าวัสดุ/หน่วย']),
            lP:    toNum(r['ค่าแรง/หน่วย']),
            con:   toStr(r['ผู้รับเหมา']),
            note:  toStr(r['หมายเหตุ']),
        });
    });

    return rows;
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
    console.log('\n📖 อ่านไฟล์ import...');
    const boq = await readImportFile();
    const items = boq.filter(r => r.type === 'item');
    const hdrs  = boq.filter(r => r.type === 'header');
    console.log(`   ✓ ${boq.length} แถว (headers: ${hdrs.length}, items: ${items.length})`);

    console.log('\n🔐 กำลัง login Firebase...');
    const app  = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db   = getFirestore(app);

    await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);
    console.log(`   ✓ เข้าสู่ระบบสำเร็จ: ${EMAIL}`);

    console.log('\n📥 อ่านข้อมูลปัจจุบันจาก Firestore...');
    const docRef  = doc(db, 'construction_data', 'main_system');
    const docSnap = await getDoc(docRef);

    let system;
    if (docSnap.exists()) {
        system = docSnap.data();
        console.log(`   ✓ พบข้อมูลเดิม — ${system.projects.length} โครงการ`);
    } else {
        system = { active: 0, projects: [] };
        console.log('   ⚠️  ไม่มีข้อมูลเดิม — สร้างใหม่');
    }

    // ตรวจว่ามีโปรเจกต์ชื่อ THE ECO อยู่แล้วหรือไม่
    const existing = system.projects.findIndex(p => p.name === PROJECT_NAME);
    const newProject = {
        name: PROJECT_NAME,
        data: {
            projectName: PROJECT_NAME,
            boq,
            trans: [],
            docs: [],
        },
    };

    if (existing !== -1) {
        console.log(`\n⚠️  พบโปรเจกต์ "${PROJECT_NAME}" อยู่แล้ว — จะ overwrite`);
        system.projects[existing] = newProject;
    } else {
        system.projects.push(newProject);
        console.log(`\n➕ เพิ่มโปรเจกต์ใหม่: "${PROJECT_NAME}"`);
    }

    console.log('\n💾 กำลังบันทึกไปยัง Firestore...');
    await setDoc(docRef, sanitize(system));

    console.log(`\n✅ Import สำเร็จ!`);
    console.log(`   โปรเจกต์: ${PROJECT_NAME}`);
    console.log(`   รายการทั้งหมด: ${items.length} items, ${hdrs.length} headers`);
    console.log(`   รวมโปรเจกต์ในระบบ: ${system.projects.length}\n`);

    process.exit(0);
}

main().catch(e => {
    console.error('\n❌ เกิดข้อผิดพลาด:', e.message, '\n');
    process.exit(1);
});
