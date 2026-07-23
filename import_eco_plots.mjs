/**
 * import_eco_plots.mjs
 * Usage: node import_eco_plots.mjs "<dev password>" [--dry-run]
 *
 * อ่าน "ต้นทุน BOQ THE ECO.xlsx" (อ่านอย่างเดียว — ไม่แก้ไฟล์)
 * แต่ละ Sheet = 1 แปลงบ้าน ใส่เข้าโครงการ (group) "THE ECO"
 * โหมด: สร้างใหม่ทั้งหมด ไม่แตะแปลงเดิมที่มีอยู่
 * ก่อนเขียนจะสำรองข้อมูลปัจจุบันเข้า collection 'backups' อัตโนมัติ
 * ตัวเลขเก็บค่าดิบจาก Excel เต็มทศนิยม ไม่ปัดเศษ
 */

import ExcelJS from 'exceljs';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, collection, addDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { fileURLToPath } from 'url';
import path from 'path';
import { firebaseNodeConfig } from './firebase-node-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const firebaseConfig = firebaseNodeConfig;

const EMAIL      = 'dev@nutcon.com';
const PASSWORD   = process.argv[2];
const DRY_RUN    = process.argv.includes('--dry-run');
const GROUP_NAME = 'THE ECO';
const INPUT_FILE = path.join(__dirname, 'ต้นทุน BOQ THE ECO.xlsx');
const SKIP_SHEETS = ['จำนวนโครงการ']; // sheet สรุปจำนวนหลัง — ไม่ใช่ BOQ

if (!PASSWORD && !DRY_RUN) {
    console.error('\n❌ กรุณาระบุรหัสผ่าน: node import_eco_plots.mjs "<password>"  (หรือใช้ --dry-run เพื่อทดสอบ)\n');
    process.exit(1);
}

// ── helpers ─────────────────────────────────────────────────────────────────
function cellVal(cell) {
    if (!cell) return null;
    const v = cell.value;
    if (v === null || v === undefined) return null;
    if (typeof v === 'object' && v !== null) {
        if ('result' in v) return v.result ?? null;
        if ('sharedFormula' in v) return v.result ?? null;
        if ('formula' in v) return v.result ?? null;
    }
    return v;
}
// ❗ ไม่ปัดเศษ — เก็บค่าดิบจาก Excel ให้ตรง 100%
const toNum = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const toStr = v => (v == null ? '' : String(v).trim());
const newId = () => Math.random().toString(36).substr(2, 9);
const sanitize = (val) => JSON.parse(JSON.stringify(val, (_, v) => (v === undefined ? null : v)));
const fmt = n => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── parse 1 sheet → boq rows ────────────────────────────────────────────────
function parseSheet(ws) {
    const plotName = ws.name.trim();
    const boq = [];

    // level-0 header = ชื่อแปลง (ใช้เป็นปุ่ม "ไปที่" + ย่อ/ขยายในหน้า BOQ)
    boq.push({
        id: newId(), type: 'header', level: 0,
        code: '', name: plotName, unit: '', q: 0, mP: 0, lP: 0, con: '', note: '',
    });

    // เก็บแถวสรุปท้าย sheet ไว้เทียบยอด (ไม่ import) + รายการที่ปรับราคา
    let statedM = null, statedL = null;
    const warnings = [];

    ws.eachRow((row, rowNum) => {
        if (rowNum < 6) return; // ข้าม title + header (row 1-5)

        const colA = cellVal(row.getCell(1));
        const colB = cellVal(row.getCell(2));
        const colC = cellVal(row.getCell(3));  // จำนวน
        const colD = cellVal(row.getCell(4));  // หน่วย
        const colE = cellVal(row.getCell(5));  // ค่าวัสดุ/หน่วย
        const colF = cellVal(row.getCell(6));  // จำนวนเงินวัสดุ
        const colG = cellVal(row.getCell(7));  // ค่าแรง/หน่วย
        const colH = cellVal(row.getCell(8));  // จำนวนเงินแรง
        const colJ = cellVal(row.getCell(10)); // หมายเหตุ

        const name = toStr(colB) || toStr(colA); // merged cell อาจอยู่ col A

        if (!name) return;
        if (name.startsWith('รวม')) {
            // แถวสรุป — จำค่าแถวล่าสุดไว้เป็นยอดรวมทั้ง sheet (แถวสุดท้ายคือ grand total)
            if (colF != null) statedM = toNum(colF);
            if (colH != null) statedL = toNum(colH);
            return;
        }
        if (!toStr(colB)) return; // ไม่ใช่แถวข้อมูล (colB ว่างจริง)

        const hasQty  = colC !== null && colC !== undefined;
        const hasUnit = colD !== null && colD !== undefined;

        let type, level;
        if (!hasQty && !hasUnit) {
            type  = 'header';
            level = (typeof colA === 'number') ? 1 : 2;
        } else {
            type  = 'item';
            level = 3;
        }

        const cleanName = type === 'item' ? name.replace(/^\s*-\s*/, '').trim() : name.trim();
        const q  = hasQty ? toNum(colC) : 0;
        let   mP = toNum(colE);
        let   lP = toNum(colG);
        let   note = toStr(colJ);

        if (type === 'item') {
            const F = colF != null ? toNum(colF) : null;
            const H = colH != null ? toNum(colH) : null;
            if (F != null && q === 0 && F !== 0) {
                    warnings.push(`แถว ${rowNum}: "${cleanName.substring(0, 40)}" จำนวน=0 แต่ยอดวัสดุ=${F} — เก็บตามหน้าตาราง`);
            }
            if (H != null && q === 0 && H !== 0) {
                    warnings.push(`แถว ${rowNum}: "${cleanName.substring(0, 40)}" จำนวน=0 แต่ยอดค่าแรง=${H} — เก็บตามหน้าตาราง`);
            }
        }

        boq.push({
            id: newId(), type, level,
            code: '',
            name: cleanName,
            unit: toStr(colD),
            q, mP, lP,
            ...(type === 'item' ? { mTotal: colF != null ? toNum(colF) : q * mP, lTotal: q * lP } : {}),
            con: '',
            note,
        });
    });

    return { plotName, boq, statedM, statedL, warnings };
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
    console.log(`\n📖 อ่านไฟล์: ${path.basename(INPUT_FILE)} (read-only)`);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(INPUT_FILE);

    const plots = [];
    console.log('\n── ตรวจสอบความถูกต้อง (ยอดคำนวณ vs ยอดใน Excel) ──');
    for (const ws of wb.worksheets) {
        const nameTrim = ws.name.trim();
        if (SKIP_SHEETS.includes(nameTrim)) { console.log(`   ⏭  ข้าม sheet "${nameTrim}" (ไม่ใช่ BOQ)`); continue; }
        if (ws.rowCount < 6) continue;

        const { plotName, boq, statedM, statedL, warnings } = parseSheet(ws);
        const items = boq.filter(r => r.type === 'item');
        const calcM = items.reduce((s, i) => s + (i.mTotal ?? i.q * i.mP), 0);
        const calcL = items.reduce((s, i) => s + (i.lTotal ?? i.q * i.lP), 0);

        const dM = statedM != null ? calcM - statedM : null;
        const dL = statedL != null ? calcL - statedL : null;
        const okM = dM == null ? 'ไม่พบยอดใน Excel' : (Math.abs(dM) < 0.01 ? '✓ ตรง' : `✗ ต่าง ${fmt(dM)}`);
        const okL = dL == null ? 'ไม่พบยอดใน Excel' : (Math.abs(dL) < 0.01 ? '✓ ตรง' : `✗ ต่าง ${fmt(dL)}`);

        console.log(`   📋 ${plotName}`);
        console.log(`      items: ${items.length} | วัสดุ: ${fmt(calcM)} [${okM}] | ค่าแรง: ${fmt(calcL)} [${okL}]`);
        warnings.forEach(w => console.log(`      ⚠ ${w}`));

        if (dM != null && Math.abs(dM) >= 0.01 || dL != null && Math.abs(dL) >= 0.01) {
            console.error(`\n❌ ยอด "${plotName}" ไม่ตรงกับ Excel — ยกเลิก ไม่เขียนข้อมูล\n`);
            process.exit(1);
        }

        plots.push({
            name: plotName,
            group: GROUP_NAME,
            data: { projectName: plotName, boq, trans: [], docs: [] },
        });
    }

    console.log(`\n   รวม ${plots.length} แปลง เข้าโครงการ "${GROUP_NAME}"`);

    if (DRY_RUN) { console.log('\n🧪 Dry-run — ไม่เขียนข้อมูล\n'); process.exit(0); }

    console.log('\n🔐 Login Firebase...');
    const app  = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db   = getFirestore(app);
    await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);
    console.log(`   ✓ ${EMAIL}`);

    const docRef  = doc(db, 'construction_data', 'main_system');
    const docSnap = await getDoc(docRef);
    const system  = docSnap.exists() ? docSnap.data() : { active: 0, projects: [] };
    console.log(`   ✓ ข้อมูลปัจจุบัน: ${system.projects.length} แปลง`);

    // 💾 สำรองข้อมูลก่อนเขียน
    console.log('\n🛟 สำรองข้อมูลปัจจุบันเข้า backups...');
    await addDoc(collection(db, 'backups'), {
        createdAt: new Date().toISOString(),
        createdBy: 'import_eco_plots.mjs',
        label: `ก่อน import THE ECO ${new Date().toLocaleString('th-TH')}`,
        projectCount: system.projects.length,
        data: sanitize(system),
    });
    console.log('   ✓ สำรองเรียบร้อย');

    // ➕ เพิ่มแปลงใหม่ทั้งหมด (ไม่แตะของเดิม)
    system.projects = [...system.projects, ...plots];

    console.log('\n💾 บันทึกไปยัง Firestore...');
    await setDoc(docRef, sanitize(system));

    console.log(`\n✅ สำเร็จ! เพิ่ม ${plots.length} แปลงในโครงการ "${GROUP_NAME}" — รวมทั้งระบบ ${system.projects.length} แปลง\n`);
    process.exit(0);
}

main().catch(e => { console.error('\n❌ ผิดพลาด:', e.message, '\n'); process.exit(1); });
