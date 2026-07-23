import * as XLSX from 'xlsx'; // ใช้สำหรับ Import เหมือนเดิม
import ExcelJS from 'exceljs'; // ใช้สำหรับ Export แบบสวยๆ
import { saveAs } from 'file-saver';
import { materialBudget, laborBudget } from './boqMath';

// --- ฟังก์ชัน Export แบบสวยงาม (ExcelJS) ---
export const exportToExcel = async (currentProjectData, currentProjectName) => {
    const workbook = new ExcelJS.Workbook();
    
    // ==========================================
    // 1. สร้าง Sheet "Master BOQ"
    // ==========================================
    const ws = workbook.addWorksheet('Master BOQ');

    // กำหนดความกว้างคอลัมน์
    ws.columns = [
        { header: '#', key: 'index', width: 8 },
        { header: 'Code', key: 'code', width: 12 },
        { header: 'รายการ', key: 'name', width: 40 },
        { header: 'หน่วย', key: 'unit', width: 10 },
        { header: 'ปริมาณ', key: 'q', width: 12 },
        { header: 'ค่าวัสดุ/หน่วย', key: 'mP', width: 15 },
        { header: 'รวมค่าวัสดุ', key: 'mTotal', width: 15 },
        { header: 'ค่าแรง/หน่วย', key: 'lP', width: 15 },
        { header: 'รวมค่าแรง', key: 'lTotal', width: 15 },
        { header: 'รวมทั้งสิ้น', key: 'grandTotal', width: 18 },
        { header: 'ผู้รับเหมา', key: 'con', width: 15 },
        { header: 'หมายเหตุ', key: 'rem', width: 15 },
    ];

    // แต่งหัวตาราง (Row 1)
    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell) => {
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF1E293B' } // สีพื้นหลัง (Slate-800)
        };
        cell.font = {
            color: { argb: 'FFFFFFFF' }, // สีตัวอักษรขาว
            bold: true,
            size: 12,
            name: 'Sarabun'
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
            top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
        };
    });
    headerRow.height = 30; // ความสูงแถวหัวข้อ

    // ใส่ข้อมูล BOQ
    const boqData = currentProjectData.boq || [];
    let rowIndex = 0; // ตัวนับลำดับที่โชว์ใน Excel

    boqData.forEach((item) => {
        if (item.type === 'header') {
            // --- แถวหมวดงาน (Header) ---
            const row = ws.addRow([
                '', 
                item.code, 
                item.name, 
                '', '', '', '', '', '', '', '', item.rem
            ]);
            
            // จัด Style แถวหมวดงาน (สีเทา)
            row.eachCell((cell) => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } }; // สีเทาอ่อน
                cell.font = { bold: true, name: 'Sarabun' };
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });
        } else {
            // --- แถวรายการ (Item) ---
            rowIndex++;
            const q = parseFloat(item.q) || 0;
            const mP = parseFloat(item.mP) || 0;
            const lP = parseFloat(item.lP) || 0;
            const mTotal = materialBudget(item);
            const lTotal = laborBudget(item);
            const grandTotal = mTotal + lTotal;

            const row = ws.addRow({
                index: rowIndex,
                code: item.code,
                name: item.name,
                unit: item.unit,
                q: q,
                mP: mP,
                mTotal: mTotal,
                lP: lP,
                lTotal: lTotal,
                grandTotal: grandTotal,
                con: item.con,
                rem: item.rem,
                // เก็บ System ID ไว้ใน Hidden Column (ถ้าต้องการ Import กลับ)
                systemId: item.id, 
                type: item.type
            });

            // จัด Style รายการปกติ
            row.eachCell((cell, colNumber) => {
                cell.font = { name: 'Sarabun' };
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                
                // จัดกึ่งกลางสำหรับคอลัมน์ที่ไม่ใช่ชื่อรายการ
                if (colNumber !== 3) cell.alignment = { vertical: 'middle', horizontal: 'center' };
                else cell.alignment = { vertical: 'middle', horizontal: 'left' }; // ชื่อรายการชิดซ้าย

                // Format ตัวเลข (คอลัมน์ 5 ถึง 10)
                if (colNumber >= 5 && colNumber <= 10) {
                    cell.numFmt = '#,##0.00';
                    cell.alignment = { vertical: 'middle', horizontal: 'right' };
                }
            });
        }
    });

    // ==========================================
    // 2. Sheet Transactions (Log) - เก็บไว้ใช้ตอน Import กลับ
    // ==========================================
    const wsTrans = workbook.addWorksheet('Transactions_Log');
    wsTrans.columns = [
        { header: 'ID', key: 'id' }, { header: 'Type', key: 'type' },
        { header: 'ItemID', key: 'itemId' }, { header: 'Qty', key: 'q' },
        { header: 'Amount', key: 'a' }, { header: 'Date', key: 'date' }
    ];
    (currentProjectData.trans || []).forEach(t => wsTrans.addRow(t));

    // ==========================================
    // 3. Sheet Documents (Log)
    // ==========================================
    const wsDocs = workbook.addWorksheet('Documents_Log');
    wsDocs.columns = [
        { header: 'ID', key: 'id' }, { header: 'Type', key: 'type' },
        { header: 'No', key: 'no' }, { header: 'Date', key: 'date' },
        { header: 'Contractor', key: 'contractor' }, { header: 'Ref', key: 'ref' },
        { header: 'Payee', key: 'payee' }, { header: 'Status', key: 'status' },
        { header: 'ItemsJSON', key: 'items' }
    ];
    (currentProjectData.docs || []).forEach(d => {
        wsDocs.addRow({ ...d, items: JSON.stringify(d.items) });
    });

    // ==========================================
    // 4. Generate & Save File
    // ==========================================
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `${currentProjectName || 'Project_Data'}_${new Date().toISOString().split('T')[0]}.xlsx`;
    saveAs(new Blob([buffer]), fileName);
};


// --- ฟังก์ชัน Import โครงการ: แต่ละ sheet = 1 แปลงบ้าน ---
// รูปแบบไฟล์ต้นทุน BOQ: หัวตารางแถว 1-5, คอลัมน์ A=ลำดับ B=รายการ C=จำนวน D=หน่วย
// E=ค่าวัสดุ/หน่วย F=จำนวนเงินวัสดุ G=ค่าแรง/หน่วย H=จำนวนเงินค่าแรง J=หมายเหตุ
// - ปรับราคา/หน่วยให้ยอดตรง Excel เป๊ะ (กรณีสูตรไม่ใช่ q×ราคา เช่น เหล็กเส้น ตัน↔เส้น)
// - แถวจำนวน=0 แต่มีค่าเงิน → ตั้งเป็นเหมา 1 หน่วย
export const importPlotsFromExcel = (file, groupName) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const newId = () => Math.random().toString(36).substr(2, 9);
            const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
            const str = (v) => (v == null ? '' : String(v).trim());
            const plots = [], report = [];

            wb.SheetNames.forEach(sn => {
                const ws = wb.Sheets[sn];
                if (!ws) return;
                const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: true });
                if (rows.length < 6) return;
                const name = sn.trim();
                const boq = [{ id: newId(), type: 'header', level: 0, code: '', name, unit: '', q: 0, mP: 0, lP: 0, con: '', note: '' }];
                let xlM = 0, xlL = 0, warns = 0;

                for (let r = 5; r < rows.length; r++) {   // r=5 → แถว Excel ที่ 6
                    const row = rows[r] || [];
                    const [colA, colB, colC, colD, colE, colF, colG, colH, , colJ] = row;
                    const bName = str(colB);
                    if (!bName || bName.startsWith('รวม')) continue;   // ข้ามแถวสรุปทุกชั้น

                    const hasQty = colC != null && colC !== '';
                    const hasUnit = colD != null && colD !== '';
                    let type, level;
                    if (!hasQty && !hasUnit) { type = 'header'; level = (typeof colA === 'number') ? 1 : 2; }
                    else { type = 'item'; level = 3; }

                    const clean = type === 'item' ? bName.replace(/^\s*-\s*/, '').trim() : bName;
                    let q = hasQty ? num(colC) : 0;
                    let mP = num(colE), lP = num(colG), note = str(colJ);

                    if (type === 'item') {
                        const F = num(colF), H = num(colH);
                        xlM += F; xlL += H;
                        if (q === 0 && (F > 0 || H > 0)) warns++;
                        boq.push({ id: newId(), type, level, code: '', name: clean, unit: str(colD), q, mP, lP, mTotal: F, lTotal: q * lP, con: '', note });
                        continue;
                    }
                    boq.push({ id: newId(), type, level, code: '', name: clean, unit: str(colD), q, mP, lP, con: '', note });
                }

                const items = boq.filter(b => b.type === 'item');
                const calcM = items.reduce((s, i) => s + materialBudget(i), 0);
                const calcL = items.reduce((s, i) => s + laborBudget(i), 0);
                report.push({
                    name, items: items.length, calcM, calcL,
                    okM: Math.abs(calcM - xlM) < 1, okL: Math.abs(calcL - xlL) < 1, adj: 0, warns,
                });
                plots.push({ name, group: groupName, data: { projectName: name, boq, trans: [], docs: [] } });
            });

            resolve({ plots, report });
        } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    reader.readAsArrayBuffer(file);
});

// --- ฟังก์ชัน Import (ใช้ XLSX อ่านเหมือนเดิม เพราะเร็วกว่า) ---
export const importFromExcel = (file, callback) => {
    const reader = new FileReader();
    reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        
        if (wb.Sheets['Master BOQ'] || wb.Sheets['BOQ_Data']) {
            // รองรับทั้งชื่อ Sheet เก่าและใหม่
            const sheetName = wb.Sheets['Master BOQ'] ? 'Master BOQ' : 'BOQ_Data';
            
            // แปลงข้อมูลเป็น JSON
            const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]); 
            
            // เนื่องจาก Excel ใหม่เราจัด Format สวยงาม (มี Header ภาษาไทย) 
            // เราต้อง Map กลับมาเป็น key ภาษาอังกฤษของระบบเรา
            const str = (v) => (v === undefined || v === null) ? '' : String(v);
            const num = (v) => parseFloat(v) || 0;
            const newBOQ = rawRows.map(r => ({
                id: r['systemId'] || Math.random().toString(36).substr(2, 9),
                type: r['type'] || (r['ปริมาณ'] !== undefined && r['ปริมาณ'] !== '' ? 'item' : 'header'),
                level: typeof r['level'] === 'number' ? r['level'] : undefined,
                code: str(r['Code']),
                name: str(r['รายการ'] ?? r['Name']),
                unit: str(r['หน่วย'] ?? r['Unit']),
                q:    num(r['ปริมาณ']       ?? r['Qty']),
                mP:   num(r['ค่าวัสดุ/หน่วย'] ?? r['MatPrice']),
                lP:   num(r['ค่าแรง/หน่วย']  ?? r['LabPrice']),
                con:  str(r['ผู้รับเหมา']    ?? r['Contractor']),
                note: str(r['หมายเหตุ']     ?? r['Note']),
            }));

            const rawTrans = wb.Sheets['Transactions_Log'] ? XLSX.utils.sheet_to_json(wb.Sheets['Transactions_Log']) : [];
            const rawDocs = wb.Sheets['Documents_Log'] ? XLSX.utils.sheet_to_json(wb.Sheets['Documents_Log']) : [];
            const newDocs = rawDocs.map(d => ({ ...d, items: JSON.parse(d.items || d.ItemsJSON || '[]') }));

            callback({
                boq: newBOQ,
                trans: rawTrans,
                docs: newDocs
            });
        } else {
            alert("ไม่พบ Sheet ข้อมูล (Master BOQ)");
        }
    };
    reader.readAsArrayBuffer(file);
};
