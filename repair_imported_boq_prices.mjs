/**
 * ซ่อมราคา BOQ ของสองโครงการที่นำเข้าไปแล้วให้ตรงกับ Excel ต้นทาง
 *
 * ตรวจอย่างเดียว:
 *   $env:BOQ_DEV_PASSWORD = (Get-Credential dev@nutcon.com).GetNetworkCredential().Password
 *   node repair_imported_boq_prices.mjs
 *
 * เขียนจริง (สร้าง Firebase backup ก่อนเสมอ):
 *   node repair_imported_boq_prices.mjs --apply
 */
import XLSX from 'xlsx';
import { initializeApp } from 'firebase/app';
import { collection, addDoc, doc, getDoc, getFirestore, setDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import path from 'path';
import { fileURLToPath } from 'url';
import { firebaseNodeConfig } from './firebase-node-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');
const EXCEL_ONLY = process.argv.includes('--excel-only');
const EMAIL = process.env.BOQ_DEV_EMAIL || 'dev@nutcon.com';
const PASSWORD = process.env.BOQ_DEV_PASSWORD;

const SOURCES = [
    {
        file: 'ต้นทุนบ้านแถว Prime Life Ayutthaya.xlsx',
        group: 'โครงการ Prime Life Ayutthaya',
    },
    {
        file: 'ต้นทุนบ้านแถว THE ECO NAKONLUANG.xlsx',
        group: 'โครงการ THE ECO NAKONLUANG',
    },
];

const number = (value) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
};
const text = (value) => value == null ? '' : String(value).trim();
const normalize = (value) => text(value)
    .replace(/^\s*-\s*/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
const sanitize = (value) => JSON.parse(JSON.stringify(value, (_, item) => item === undefined ? null : item));

async function readSource(source) {
    const workbook = XLSX.readFile(path.join(__dirname, source.file), { cellFormula: true });
    const plots = new Map();

    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, blankrows: true });
        if (rows.length < 6) continue;
        const occurrence = new Map();
        const items = [];

        for (let index = 5; index < rows.length; index++) {
            const row = rows[index] || [];
            const rowNumber = index + 1;
            const rawName = text(row[1]);
            if (!rawName || rawName.startsWith('รวม')) continue;

            const rawQty = row[2];
            const rawUnit = row[3];
            const isItem = rawQty != null || rawUnit != null;
            if (!isItem) continue;

            const name = rawName.replace(/^\s*-\s*/, '').trim();
            const normalizedName = normalize(name);
            const sequence = (occurrence.get(normalizedName) || 0) + 1;
            occurrence.set(normalizedName, sequence);

            items.push({
                key: `${normalizedName}#${sequence}`,
                name,
                rowNumber,
                unit: text(rawUnit),
                q: number(rawQty),
                mP: number(row[4]),
                mTotal: number(row[5]),
                lP: number(row[6]),
                lTotal: number(row[7]),
            });
        }

        plots.set(normalize(sheetName), { sheetName: sheetName.trim(), items });
    }
    return { ...source, plots };
}

function findProject(system, source, sheetName) {
    const targetSheet = normalize(sheetName);
    const targetGroup = normalize(source.group).replace(/^โครงการ\s*/, '');
    return system.projects.find(project => {
        const projectGroup = normalize(project.group || '').replace(/^โครงการ\s*/, '');
        return normalize(project.name) === targetSheet && projectGroup === targetGroup;
    });
}

function repairProject(project, sourcePlot, sourceFile) {
    const sourceByKey = new Map(sourcePlot.items.map(item => [item.key, item]));
    const occurrence = new Map();
    const missing = [];
    let changed = 0;

    const boq = (project.data?.boq || []).map(item => {
        if (item.type !== 'item') return item;
        const normalizedName = normalize(item.name);
        const sequence = (occurrence.get(normalizedName) || 0) + 1;
        occurrence.set(normalizedName, sequence);
        const source = sourceByKey.get(`${normalizedName}#${sequence}`);
        if (!source) {
            missing.push(item.name);
            return item;
        }

        const differs = ['q', 'mP', 'mTotal', 'lP', 'lTotal', 'unit']
            .some(field => String(item[field] ?? '') !== String(source[field] ?? ''));
        if (differs) changed++;

        return {
            ...item,
            unit: source.unit,
            q: source.q,
            mP: source.mP,
            mTotal: source.mTotal,
            lP: source.lP,
            lTotal: source.lTotal,
            sourceExcel: {
                file: sourceFile,
                sheet: sourcePlot.sheetName,
                row: source.rowNumber,
            },
        };
    });

    const currentKeys = new Set();
    occurrence.clear();
    for (const item of project.data?.boq || []) {
        if (item.type !== 'item') continue;
        const name = normalize(item.name);
        const sequence = (occurrence.get(name) || 0) + 1;
        occurrence.set(name, sequence);
        currentKeys.add(`${name}#${sequence}`);
    }
    const unused = sourcePlot.items.filter(item => !currentKeys.has(item.key)).map(item => item.name);

    project.data = { ...project.data, boq };
    return { changed, missing, unused };
}

async function main() {
    const sources = [];
    for (const source of SOURCES) sources.push(await readSource(source));
    for (const source of sources) {
        console.log(`📘 ${source.file}: ${source.plots.size} แปลง`);
    }
    if (EXCEL_ONLY) return;

    const app = initializeApp(firebaseNodeConfig);
    const db = getFirestore(app);
    let credential = null;
    let profile = null;
    if (PASSWORD) {
        credential = await signInWithEmailAndPassword(getAuth(app), EMAIL, PASSWORD);
        profile = (await getDoc(doc(db, 'users', credential.user.uid))).data();
        if (profile?.role !== 'DEV') throw new Error('บัญชีที่ใช้ไม่ใช่ role DEV');
    } else if (APPLY) {
        throw new Error('ยังไม่ได้ตั้ง BOQ_DEV_PASSWORD — กรุณาตั้งผ่าน Get-Credential ตามตัวอย่างด้านบน');
    }

    const systemRef = doc(db, 'construction_data', 'main_system');
    const systemSnapshot = await getDoc(systemRef);
    if (!systemSnapshot.exists()) throw new Error('ไม่พบ construction_data/main_system');
    const originalSystem = systemSnapshot.data();
    const repairedSystem = sanitize(originalSystem);

    let totalChanged = 0;
    let missingProjects = 0;
    let systemOnly = 0;
    let excelOnly = 0;
    for (const source of sources) {
        console.log(`\n🏗️ ${source.group}`);
        for (const sourcePlot of source.plots.values()) {
            const project = findProject(repairedSystem, source, sourcePlot.sheetName);
            if (!project) {
                console.log(`   ❌ ไม่พบแปลง ${sourcePlot.sheetName}`);
                missingProjects++;
                continue;
            }
            const result = repairProject(project, sourcePlot, source.file);
            totalChanged += result.changed;
            systemOnly += result.missing.length;
            excelOnly += result.unused.length;
            console.log(`   ${sourcePlot.sheetName}: แก้ ${result.changed} | ในระบบหา Excel ไม่เจอ ${result.missing.length} | Excel ไม่พบในระบบ ${result.unused.length}`);
            result.missing.slice(0, 5).forEach(name => console.log(`      ⚠ ระบบเท่านั้น: ${name}`));
            result.unused.slice(0, 5).forEach(name => console.log(`      ⚠ Excel เท่านั้น: ${name}`));
        }
    }

    console.log(`\nสรุป: แก้ ${totalChanged} รายการ | ไม่พบแปลง ${missingProjects} | รายการสร้างเพิ่มในระบบ ${systemOnly} | Excel จับคู่ไม่ได้ ${excelOnly}`);
    if (missingProjects || excelOnly) {
        throw new Error('พบแปลงหรือรายการ Excel ที่จับคู่ไม่ได้ — ยกเลิกเพื่อป้องกันข้อมูลผิด');
    }
    if (!APPLY) {
        console.log('\n🧪 ตรวจสอบอย่างเดียว ยังไม่เขียนข้อมูล ใช้ --apply เมื่อต้องการซ่อมจริง');
        return;
    }

    const now = new Date().toISOString();
    await addDoc(collection(db, 'backups'), {
        createdAt: now,
        createdBy: profile.username || EMAIL,
        label: `ก่อนซ่อมราคา BOQ จาก Excel 2 โครงการ ${new Date().toLocaleString('th-TH')}`,
        projectCount: originalSystem.projects?.length || 0,
        data: sanitize(originalSystem),
    });
    await setDoc(systemRef, repairedSystem);
    await addDoc(collection(db, 'audit_logs'), {
        uid: credential.user.uid,
        email: EMAIL,
        username: profile.username || EMAIL,
        role: profile.role,
        action: 'REPAIR_IMPORTED_BOQ_PRICES',
        details: `ซ่อมราคาจาก Excel 2 โครงการ ${totalChanged} รายการ`,
        timestamp: now,
    });
    console.log(`\n✅ ซ่อมสำเร็จ ${totalChanged} รายการ พร้อมสร้าง backup แล้ว`);
}

main().catch(error => {
    console.error(`\n❌ ${error.stack || error.message}\n`);
    process.exit(1);
});
