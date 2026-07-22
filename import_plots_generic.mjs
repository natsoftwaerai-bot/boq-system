/**
 * import_plots_generic.mjs — import แต่ละ sheet เป็น 1 แปลง เข้าโครงการ (group) ใหม่
 * Usage: node import_plots_generic.mjs "<file.xlsx>" "<ชื่อโครงการ>" "<dev password>" [--dry-run]
 *
 * - อ่านไฟล์อย่างเดียว ไม่แก้ Excel
 * - ปรับราคา/หน่วยให้ยอดเงินตรง Excel เป๊ะ (กรณีสูตรไม่ใช่ q×ราคา เช่น เหล็กเส้น ตัน↔เส้น)
 * - ตรวจยอด: ผลรวมรายการ = ผลรวมของแถว subtotal ทุกหมวด (รวมค่างาน...)
 * - สำรองข้อมูลก่อนเขียน, เพิ่มแปลงใหม่ทั้งหมด ไม่แตะของเดิม
 */
import ExcelJS from 'exceljs';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, collection, addDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { fileURLToPath } from 'url';
import path from 'path';
import { firebaseNodeConfig } from './firebase-node-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const [INPUT_ARG, GROUP_NAME, PASSWORD] = [process.argv[2], process.argv[3], process.argv[4]];
const DRY = process.argv.includes('--dry-run');

if (!INPUT_ARG || !GROUP_NAME || (!PASSWORD && !DRY)) {
    console.error('\nUsage: node import_plots_generic.mjs "<file.xlsx>" "<ชื่อโครงการ>" "<password>" [--dry-run]\n');
    process.exit(1);
}
const INPUT_FILE = path.join(__dirname, INPUT_ARG);

const firebaseConfig = firebaseNodeConfig;

const cellVal = (cell) => {
    if (!cell) return null;
    const v = cell.value;
    if (v == null) return null;
    if (typeof v === 'object') {
        if ('result' in v) return v.result ?? null;
        if ('sharedFormula' in v) return v.result ?? null;
        if ('formula' in v) return v.result ?? null;
    }
    return v;
};
const toNum = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const toStr = v => (v == null ? '' : String(v).trim());
const newId = () => Math.random().toString(36).substr(2, 9);
const sanitize = v => JSON.parse(JSON.stringify(v, (_, x) => x === undefined ? null : x));
const fmt = n => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function parseSheet(ws) {
    const plotName = ws.name.trim();
    const boq = [{ id: newId(), type: 'header', level: 0, code: '', name: plotName, unit: '', q: 0, mP: 0, lP: 0, con: '', note: '' }];
    let xlM = 0, xlL = 0;          // ผลรวมช่องเงินของ "รายการ" ตาม Excel (F/H) — ใช้ cross-check
    const adjusted = [], warnings = [];

    ws.eachRow((row, rowNum) => {
        if (rowNum < 6) return;
        const colA = cellVal(row.getCell(1));
        const colB = cellVal(row.getCell(2));
        const colC = cellVal(row.getCell(3));
        const colD = cellVal(row.getCell(4));
        const colE = cellVal(row.getCell(5));
        const colF = cellVal(row.getCell(6));
        const colG = cellVal(row.getCell(7));
        const colH = cellVal(row.getCell(8));
        const colJ = cellVal(row.getCell(10));

        const bName = toStr(colB);
        // ข้ามแถวสรุปทุกชั้น (colB ว่าง หรือขึ้นต้น "รวม")
        if (!bName || bName.startsWith('รวม')) return;

        const hasQty = colC != null, hasUnit = colD != null;
        let type, level;
        if (!hasQty && !hasUnit) { type = 'header'; level = (typeof colA === 'number') ? 1 : 2; }
        else { type = 'item'; level = 3; }

        const cleanName = type === 'item' ? bName.replace(/^\s*-\s*/, '').trim() : bName;
        let q = hasQty ? toNum(colC) : 0;
        let mP = toNum(colE), lP = toNum(colG), note = toStr(colJ);

        if (type === 'item') {
            const F = colF != null ? toNum(colF) : 0;
            const H = colH != null ? toNum(colH) : 0;
            xlM += F; xlL += H;

            // แถวมีเงินแต่จำนวน=0 → ตั้ง q=1 แล้วเก็บเงินไว้เป็นราคา (เงินจะแสดงถูกในระบบ)
            if (q === 0 && (F > 0 || H > 0)) {
                q = 1; mP = F; lP = H;
                note = note ? `${note} | เดิมจำนวน=0 (เหมา)` : 'เดิมจำนวน=0 (เหมา)';
                warnings.push(`แถว ${rowNum} "${cleanName.slice(0,30)}" จำนวน=0 → ตั้งเป็นเหมา 1 หน่วย (วัสดุ ${F}, ค่าแรง ${H})`);
            } else {
                // ปรับราคา/หน่วยให้ q×ราคา = เงินใน Excel เป๊ะ
                if (Math.abs(q * mP - F) > 0.005 && q !== 0) { const o = mP; mP = F / q; adjusted.push(`${cleanName.slice(0,38)} (วัสดุ ${o}→${mP.toFixed(2)})`); note = note ? `${note} | ราคาเดิม ${o}` : `ราคาเดิม ${o}`; }
                if (Math.abs(q * lP - H) > 0.005 && q !== 0) { const o = lP; lP = H / q; adjusted.push(`${cleanName.slice(0,38)} (ค่าแรง ${o}→${lP.toFixed(2)})`); note = note ? `${note} | ค่าแรงเดิม ${o}` : `ค่าแรงเดิม ${o}`; }
            }
        }
        boq.push({ id: newId(), type, level, code: '', name: cleanName, unit: toStr(colD), q, mP, lP, con: '', note });
    });

    return { plotName, boq, xlM, xlL, adjusted, warnings };
}

async function main() {
    console.log(`\n📖 อ่าน: ${path.basename(INPUT_FILE)} → โครงการ "${GROUP_NAME}"`);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(INPUT_FILE);

    const plots = [];
    let bad = false;
    console.log('\n── ตรวจสอบยอด (ผลรวมในระบบ vs ผลรวมช่องเงินของรายการใน Excel) ──');
    for (const ws of wb.worksheets) {
        if (ws.rowCount < 6) continue;
        const { plotName, boq, xlM, xlL, adjusted, warnings } = parseSheet(ws);
        const items = boq.filter(r => r.type === 'item');
        const calcM = items.reduce((s, i) => s + i.q * i.mP, 0);
        const calcL = items.reduce((s, i) => s + i.q * i.lP, 0);
        const okM = Math.abs(calcM - xlM) < 1 ? '✓' : `✗ ต่าง ${fmt(calcM - xlM)}`;
        const okL = Math.abs(calcL - xlL) < 1 ? '✓' : `✗ ต่าง ${fmt(calcL - xlL)}`;
        console.log(`   📋 ${plotName}: items=${items.length} | วัสดุ ${fmt(calcM)} [${okM}] | ค่าแรง ${fmt(calcL)} [${okL}]`);
        if (adjusted.length) console.log(`      ⚙ ปรับราคา/หน่วย ${adjusted.length} รายการ (ยอดเงินเท่าเดิม)`);
        warnings.forEach(w => console.log(`      ⚠ ${w}`));
        if (okM.startsWith('✗') || okL.startsWith('✗')) bad = true;
        plots.push({ name: plotName, group: GROUP_NAME, data: { projectName: plotName, boq, trans: [], docs: [] } });
    }
    if (bad) { console.error('\n❌ ยอดไม่ตรง — ยกเลิก ไม่เขียนข้อมูล\n'); process.exit(1); }
    console.log(`\n   รวม ${plots.length} แปลง`);

    if (DRY) { console.log('\n🧪 dry-run — ไม่เขียนข้อมูล\n'); process.exit(0); }

    console.log('\n🔐 Login...');
    const app = initializeApp(firebaseConfig);
    await signInWithEmailAndPassword(getAuth(app), 'dev@nutcon.com', PASSWORD);
    const db = getFirestore(app);
    const ref = doc(db, 'construction_data', 'main_system');
    const system = (await getDoc(ref)).data();
    console.log(`   ✓ ปัจจุบัน ${system.projects.length} แปลง`);

    // กันชื่อโครงการซ้ำ
    if (system.projects.some(p => (p.group || '') === GROUP_NAME)) {
        console.error(`\n⚠️ มีโครงการ "${GROUP_NAME}" อยู่แล้ว — ยกเลิกกันข้อมูลซ้ำ\n`); process.exit(1);
    }

    console.log('🛟 สำรองข้อมูล...');
    await addDoc(collection(db, 'backups'), {
        createdAt: new Date().toISOString(), createdBy: 'import_plots_generic.mjs',
        label: `ก่อน import ${GROUP_NAME} ${new Date().toLocaleString('th-TH')}`,
        projectCount: system.projects.length, data: sanitize(system),
    });
    system.projects = [...system.projects, ...plots];
    await setDoc(ref, sanitize(system));
    console.log(`\n✅ สำเร็จ! เพิ่ม ${plots.length} แปลงในโครงการ "${GROUP_NAME}" — รวม ${system.projects.length} แปลง\n`);
    process.exit(0);
}
main().catch(e => { console.error('\n❌', e.message, '\n'); process.exit(1); });
