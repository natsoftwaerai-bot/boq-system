import ExcelJS from 'exceljs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INPUT  = path.join(__dirname, 'ต้นทุน BOQ THE ECO.xlsx');
const OUTPUT = path.join(__dirname, 'ต้นทุน BOQ THE ECO_import_ready.xlsx');

// Extract value from cell — handles shared/array formulas
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

// ปัดเศษ 4 ตำแหน่ง เพื่อตัด floating-point noise (10/6 → 1.6667 แทน 1.6666666666666667)
const toNum = v => {
    const n = parseFloat(v);
    if (isNaN(n)) return 0;
    return Math.round(n * 10000) / 10000;
};
const toStr = v => (v == null ? '' : String(v).trim());

async function main() {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(INPUT);

    const rows = [];
    let totalSheets = 0;

    for (const ws of wb.worksheets) {
        const sheetName = ws.name.trim();
        if (!sheetName || ws.rowCount < 6) continue;
        totalSheets++;

        // Level-0 header: ชื่อ Sheet = ประเภทบ้าน
        rows.push({
            type: 'header', level: 0,
            Code: '',
            'รายการ': sheetName,
            'หน่วย': '', 'ปริมาณ': '',
            'ค่าวัสดุ/หน่วย': '', 'ค่าแรง/หน่วย': '',
            'ผู้รับเหมา': '', 'หมายเหตุ': '',
        });

        ws.eachRow((row, rowNum) => {
            if (rowNum < 6) return; // ข้าม title + header rows (row 1-5)

            const colA = cellVal(row.getCell(1));  // ลำดับที่ (seq number = main section)
            const colB = cellVal(row.getCell(2));  // รายการ
            const colC = cellVal(row.getCell(3));  // จำนวน (qty)
            const colD = cellVal(row.getCell(4));  // หน่วย
            const colE = cellVal(row.getCell(5));  // ราคาวัสดุ/หน่วย
            const colG = cellVal(row.getCell(7));  // ราคาแรง/หน่วย
            const colJ = cellVal(row.getCell(10)); // หมายเหตุ

            const name = toStr(colB);
            if (!name) return;
            if (name.startsWith('รวม')) return; // ข้ามแถวสรุป

            const hasQty  = colC !== null && colC !== undefined;
            const hasUnit = colD !== null && colD !== undefined;

            let type, level;

            if (!hasQty && !hasUnit) {
                type = 'header';
                // Main section: col A มีตัวเลข (ลำดับหมวดใหญ่)
                // Sub-section: ชื่อขึ้นต้นด้วย "X.X " pattern
                if (typeof colA === 'number') {
                    level = 1;
                } else {
                    level = 2;
                }
            } else {
                type  = 'item';
                level = 3;
            }

            // ทำความสะอาดชื่อรายการ: ตัด "- " นำหน้าของ items
            const cleanName = type === 'item'
                ? name.replace(/^\s*-\s*/, '').trim()
                : name.trim();

            rows.push({
                type, level,
                Code: '',
                'รายการ': cleanName,
                'หน่วย': toStr(colD),
                'ปริมาณ': hasQty ? toNum(colC) : '',
                'ค่าวัสดุ/หน่วย': toNum(colE),
                'ค่าแรง/หน่วย': toNum(colG),
                'ผู้รับเหมา': '',
                'หมายเหตุ': toStr(colJ),
            });
        });
    }

    // เขียน Excel output ในรูปแบบที่ระบบ import ได้
    const outWb = new ExcelJS.Workbook();
    const outWs = outWb.addWorksheet('Master BOQ');

    outWs.columns = [
        { header: 'type',           key: 'type',           width: 8  },
        { header: 'level',          key: 'level',          width: 6  },
        { header: 'Code',           key: 'Code',           width: 10 },
        { header: 'รายการ',         key: 'รายการ',         width: 55 },
        { header: 'หน่วย',          key: 'หน่วย',          width: 10 },
        { header: 'ปริมาณ',         key: 'ปริมาณ',         width: 12 },
        { header: 'ค่าวัสดุ/หน่วย', key: 'ค่าวัสดุ/หน่วย', width: 16 },
        { header: 'ค่าแรง/หน่วย',   key: 'ค่าแรง/หน่วย',   width: 15 },
        { header: 'ผู้รับเหมา',     key: 'ผู้รับเหมา',     width: 15 },
        { header: 'หมายเหตุ',       key: 'หมายเหตุ',       width: 20 },
    ];

    rows.forEach(r => outWs.addRow(r));

    await outWb.xlsx.writeFile(OUTPUT);

    const headers = rows.filter(r => r.type === 'header');
    const items   = rows.filter(r => r.type === 'item');
    console.log(`\n✅ แปลงสำเร็จ — รวม ${rows.length} แถว จาก ${totalSheets} sheets`);
    console.log(`   🗂  headers : ${headers.length} (level-0: ${headers.filter(h=>h.level===0).length}, level-1: ${headers.filter(h=>h.level===1).length}, level-2: ${headers.filter(h=>h.level===2).length})`);
    console.log(`   📋 items   : ${items.length} รายการ`);
    console.log(`\n📁 ไฟล์พร้อม import: ${OUTPUT}\n`);
}

main().catch(console.error);
