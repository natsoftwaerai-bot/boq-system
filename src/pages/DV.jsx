import React, { useState, useMemo } from 'react';
import { useProject } from '../context/ProjectContext';
import { FaHardHat, FaSave } from 'react-icons/fa';

const DV = ({ setActivePage }) => {
    const {
        currentProjectData, updateProjectData,
        user, approvalConfig, createApprovalRequest, currentProjectName, activeGroup,
    } = useProject();
    
    // 1. ดึงข้อมูล BOQ และประวัติการจ่าย (DV Docs)
    const boqItems = currentProjectData.boq || [];
    const dvDocs = useMemo(() => 
        (currentProjectData.docs || []).filter(d => d.type === 'DV'), 
    [currentProjectData.docs]);

    // รายการ BOQ ที่แต่ละผู้รับจ้างเคยถูกสั่งจ้างผ่าน PO (จำค่าแรง/หน่วยที่กรอกใน PO ไว้ด้วย
    // เพราะบางรายการ BOQ ค่าแรงเป็น 0 แล้วตกลงราคากันตอนเปิด PO)
    const poLaborByContractor = useMemo(() => {
        const map = {};
        (currentProjectData.docs || []).filter(d => d.type === 'PO').forEach(doc => {
            const name = (doc.contractor || '').trim();
            if (!name) return;
            if (!map[name]) map[name] = new Map();
            (doc.items || []).forEach(i => {
                const lp = parseFloat(i.lPrice) || 0;
                const prev = map[name].get(i.id) || 0;
                map[name].set(i.id, Math.max(prev, lp));
            });
        });
        return map;
    }, [currentProjectData.docs]);

    // 2. ดึงรายชื่อช่าง จากคอลัมน์ "ช่าง" ใน BOQ + ชื่อผู้รับจ้างจากใบ PO ที่มีค่าแรง
    const contractors = useMemo(() => {
        const list = new Set();
        boqItems.forEach(item => {
            if (item.type !== 'header' && item.con && parseFloat(item.lP) > 0) {
                list.add(item.con);
            }
        });
        Object.entries(poLaborByContractor).forEach(([name, m]) => {
            const hasLabor =
                [...m.values()].some(lp => lp > 0) ||
                boqItems.some(i => i.type !== 'header' && parseFloat(i.lP) > 0 && m.has(i.id));
            if (hasLabor) list.add(name);
        });
        return Array.from(list);
    }, [boqItems, poLaborByContractor]);

    // State
    const NEW_CONTRACTOR = '__NEW__';
    const [selectedContractor, setSelectedContractor] = useState('');
    const [newContractorName, setNewContractorName] = useState('');
    const [payAmounts, setPayAmounts] = useState({}); // เก็บยอดที่จะจ่าย { itemId: amount }

    // รายการที่มีค่าแรงแต่ยังไม่ระบุช่างใน BOQ
    const unassignedItems = useMemo(() =>
        boqItems.filter(item => item.type !== 'header' && !item.con && parseFloat(item.lP) > 0),
    [boqItems]);

    // ค่าแรง/หน่วยจาก PO ของช่างที่เลือก (ใช้เมื่อ BOQ ค่าแรง = 0)
    const selPoLabor = selectedContractor !== NEW_CONTRACTOR
        ? poLaborByContractor[selectedContractor]
        : null;

    // 3. กรองรายการงานของช่างที่เลือก (โหมดช่างใหม่ = รายการที่ยังไม่ระบุช่าง)
    //    รวมรายการที่ระบุในคอลัมน์ "ช่าง" หรือเคยสั่งจ้างผ่าน PO (นับค่าแรงที่กรอกใน PO ด้วย)
    const workItems = useMemo(() => {
        if (!selectedContractor) return [];
        if (selectedContractor === NEW_CONTRACTOR) return unassignedItems;
        return boqItems.filter(item => {
            if (item.type === 'header') return false;
            const inPo  = selPoLabor && selPoLabor.has(item.id);
            const poLp  = inPo ? selPoLabor.get(item.id) : 0;
            const hasLabor = parseFloat(item.lP) > 0 || poLp > 0;
            return hasLabor && (item.con === selectedContractor || inPo);
        });
    }, [boqItems, selectedContractor, unassignedItems, selPoLabor]);

    // 4. คำนวณยอดจ่ายแล้วของแต่ละรายการ — อ่านจาก trans (แหล่งเดียวกับ Master BOQ)
    //    ครอบคลุมทั้งใบ DV และค่าแรงที่เคยถูกจ่ายผ่าน PU ในข้อมูลเก่า → กันเบิกซ้ำ
    const getPaidAmount = (itemId) => {
        return (currentProjectData.trans || [])
            .filter(t => (t.type === 'EXPENSE' || t.type === 'DV') && t.itemId === itemId)
            .reduce((sum, t) => sum + (parseFloat(t.a) || 0), 0);
    };

    // ฟังก์ชันเปลี่ยนยอดเงินใน Input
    const handleAmountChange = (id, value, maxLimit) => {
        let val = parseFloat(value);
        if (isNaN(val) || val < 0) val = 0;
        // (Optional) ถ้าไม่อยากให้เบิกเกินงบ ให้เปิดคอมเมนต์บรรทัดล่างนี้
        // if (val > maxLimit) val = maxLimit; 
        
        setPayAmounts(prev => ({ ...prev, [id]: val }));
    };

    // บันทึก DV
    const saveDV = async () => {
        const itemsToPay = [];
        let totalPay = 0;

        // วนลูปเก็บข้อมูลรายการที่จะจ่าย
        Object.keys(payAmounts).forEach(itemId => {
            const amount = parseFloat(payAmounts[itemId]);
            if (amount > 0) {
                const originalItem = workItems.find(i => i.id === itemId);
                itemsToPay.push({ 
                    id: itemId, 
                    amount,
                    // เก็บรายละเอียดไปด้วย เพื่อใช้ตอน Print
                    name: originalItem.name,
                    code: originalItem.code,
                    unit: originalItem.unit
                });
                totalPay += amount;
            }
        });

        if (itemsToPay.length === 0) return alert("กรุณาระบุยอดเงินที่จะจ่ายอย่างน้อย 1 รายการ");

        // กันเบิกเกินงบคงเหลือ: วิศวกรห้ามเกิน / ADMIN+DEV ยืนยันก่อน
        const overItems = itemsToPay.filter(pay => {
            const w = workItems.find(i => i.id === pay.id);
            if (!w) return false;
            const qty = parseFloat(w.q) || 0;
            const boqLp = parseFloat(w.lP) || 0;
            const poLp = selPoLabor?.get(w.id) || 0;
            const budget = qty * (boqLp > 0 ? boqLp : poLp);
            return pay.amount > budget - getPaidAmount(w.id) + 0.005;
        });
        if (overItems.length > 0) {
            const msg = `มีรายการเบิกเกินงบคงเหลือ ${overItems.length} รายการ:\n` +
                overItems.map(i => `- ${i.name}`).join('\n');
            const isAdminRole = user?.role === 'ADMIN' || user?.role === 'DEV';
            if (!isAdminRole) {
                return alert(msg + '\n\n❌ ไม่สามารถเบิกเกินงบได้ กรุณาปรับยอด หรือแจ้งผู้ดูแลเพิ่มงบใน Master BOQ ก่อน');
            }
            if (!confirm(msg + '\n\n⚠️ ยืนยันเบิกเกินงบ? ช่อง "เหลือ" ใน Master BOQ จะติดลบ')) return;
        }

        // รายการที่งบค่าแรงใน BOQ เป็น 0 แต่ใช้ราคาจาก PO → ตั้งราคานั้นเป็นงบใน BOQ ด้วย
        // (กันช่อง "เหลือ" ใน Master BOQ ติดลบหลังจ่าย)
        const lpFixes = {};
        itemsToPay.forEach(pay => {
            const w = workItems.find(i => i.id === pay.id);
            if (!w) return;
            const boqLp = parseFloat(w.lP) || 0;
            const poLp = selPoLabor?.get(w.id) || 0;
            if (boqLp <= 0 && poLp > 0) lpFixes[w.id] = poLp;
        });

        // โหมดช่างใหม่: ต้องพิมพ์ชื่อก่อน
        const isNewMode = selectedContractor === NEW_CONTRACTOR;
        const payeeName = isNewMode ? newContractorName.trim() : selectedContractor;
        if (!payeeName) return alert("กรุณาพิมพ์ชื่อช่าง/ผู้รับเหมาก่อนบันทึก");

        // วิศวกร (PROJECT) → ส่งคำขอรออนุมัติแทนการบันทึกตรง (ถ้าเปิดใช้ในแผง DEV)
        if (user?.role === 'PROJECT' && approvalConfig?.dv) {
            if (!confirm(`ส่งคำขอเบิกค่าแรง "${payeeName}" ยอดรวม ${totalPay.toLocaleString()} บาท เพื่อรอผู้ดูแลอนุมัติ?`)) return;
            const ok = await createApprovalRequest(
                'DV', currentProjectName, activeGroup,
                { payee: payeeName, items: itemsToPay, stampCon: isNewMode, lpFixes },
                `จ่ายให้: ${payeeName} | ${itemsToPay.length} รายการ | รวม ${totalPay.toLocaleString('th-TH')} บาท`
            );
            if (ok) {
                alert('ส่งคำขอเรียบร้อย — รอผู้ดูแลอนุมัติ\nดูสถานะได้ที่เมนู "รออนุมัติ"');
                setPayAmounts({});
                setActivePage('approvals');
            } else {
                alert('ส่งคำขอไม่สำเร็จ กรุณาลองใหม่');
            }
            return;
        }

        if (confirm(`ยืนยันการเบิกจ่ายค่าแรง "${payeeName}" ยอดรวม ${totalPay.toLocaleString()} บาท?`)) {
            const newDoc = {
                id: Math.random().toString(36).substr(2, 9),
                type: 'DV',
                no: `DV${String((currentProjectData.docs || []).filter(d => d.type === 'DV').length + 1).padStart(3, '0')}`,
                date: new Date().toISOString(),
                payee: payeeName, // จ่ายให้ช่างคนนี้
                items: itemsToPay,
                status: 'PAID'
            };

            const newDocs = [...(currentProjectData.docs || []), newDoc];
            
            // บันทึก Log
            const newTrans = [
                ...(currentProjectData.trans || []),
                ...itemsToPay.map(i => ({
                    id: Math.random().toString(36).substr(2, 9),
                    type: 'EXPENSE',
                    itemId: i.id,
                    q: 0,
                    a: i.amount,
                    date: new Date().toISOString(),
                    docId: newDoc.id, // ผูกกับใบ DV เพื่อให้ยกเลิกได้แม่นยำ
                }))
            ];

            // อัปเดต BOQ: ตั้งงบค่าแรงจากราคา PO (ถ้างบเดิม 0) + บันทึกชื่อช่าง (โหมดช่างใหม่)
            const paidIds = new Set(itemsToPay.map(i => i.id));
            const newBoq = (currentProjectData.boq || []).map(i => {
                let next = i;
                if (lpFixes[i.id]) {
                    next = { ...next, lP: lpFixes[i.id], lTotal: (parseFloat(i.q) || 0) * lpFixes[i.id] };
                }
                if (isNewMode && paidIds.has(i.id)) next = { ...next, con: payeeName };
                return next;
            });

            updateProjectData(
                { ...currentProjectData, boq: newBoq, docs: newDocs, trans: newTrans },
                'LABOR_PAYMENT',
                `เบิกค่าแรง ${newDoc.no} | ช่าง/ผู้รับเหมา: ${payeeName} | ยอดรวม ${totalPay.toLocaleString('th-TH')} บาท | ${itemsToPay.length} รายการ`
            );
            alert("บันทึกเบิกค่าแรงเรียบร้อย!" + (isNewMode ? `\n(บันทึกชื่อ "${payeeName}" ลงคอลัมน์ช่างใน BOQ แล้ว)` : ''));
            setActivePage('dv-hist'); // เด้งไปหน้าประวัติ
        }
    };

    return (
        <div className="max-w-6xl mx-auto h-full flex flex-col">
            <h2 className="text-xl font-bold text-slate-700 mb-4 flex items-center gap-2">
                <FaHardHat className="text-purple-600" /> เบิกจ่ายค่าแรง (Labor Payment)
            </h2>

            {/* 1. ส่วนเลือกช่าง */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-4">
                <label className="block text-sm font-bold text-slate-700 mb-2">เลือกผู้รับเหมา / ช่าง:</label>
                <div className="flex flex-col md:flex-row gap-2 md:items-center">
                    <select
                        value={selectedContractor}
                        onChange={(e) => {
                            setSelectedContractor(e.target.value);
                            setPayAmounts({}); // เคลียร์ยอดเมื่อเปลี่ยนคน
                        }}
                        className="w-full md:w-1/2 p-2 border border-slate-300 rounded bg-slate-50 outline-purple-500 font-bold"
                    >
                        <option value="">-- กรุณาเลือกช่าง --</option>
                        {contractors.map((c, i) => <option key={i} value={c}>{c}</option>)}
                        {unassignedItems.length > 0 && (
                            <option value={NEW_CONTRACTOR}>➕ ช่างใหม่ (จากรายการที่ยังไม่ระบุช่าง {unassignedItems.length} รายการ)</option>
                        )}
                    </select>
                    {selectedContractor === NEW_CONTRACTOR && (
                        <input
                            type="text"
                            value={newContractorName}
                            onChange={(e) => setNewContractorName(e.target.value)}
                            placeholder="พิมพ์ชื่อช่าง/ผู้รับเหมาใหม่..."
                            className="w-full md:w-1/3 p-2 border-2 border-purple-300 rounded outline-purple-500 font-bold bg-purple-50/40"
                            autoFocus
                        />
                    )}
                </div>
                {contractors.length === 0 && unassignedItems.length === 0 && (
                    <p className="text-xs text-slate-400 mt-2">
                        ไม่มีรายการค่าแรงใน BOQ ของแปลงนี้ (ต้องมีรายการที่ "ค่าแรง/หน่วย" มากกว่า 0)
                    </p>
                )}
                {contractors.length === 0 && unassignedItems.length > 0 && (
                    <p className="text-xs text-amber-600 mt-2 font-medium">
                        💡 ยังไม่มีการระบุชื่อช่างใน BOQ — เลือก "➕ ช่างใหม่" เพื่อเบิกจ่ายและบันทึกชื่อช่างอัตโนมัติ
                        หรือไปกำหนดช่างรายหมวดได้ที่หน้า Master BOQ (คอลัมน์ "ช่าง")
                    </p>
                )}
                {selectedContractor === NEW_CONTRACTOR && (
                    <p className="text-xs text-purple-500 mt-2">
                        แสดงเฉพาะรายการที่ยังไม่ระบุช่าง — รายการที่จ่ายจะถูกบันทึกชื่อช่างนี้ลง BOQ ให้อัตโนมัติ
                    </p>
                )}
            </div>

            {/* 2. ตารางรายการงาน (แสดงเมื่อเลือกช่างแล้ว) */}
            {selectedContractor && (
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                    <div className="overflow-auto flex-1">
                        <table className="w-full text-sm">
                            <thead className="bg-purple-50 text-purple-900 font-bold sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="p-3 border-b text-center w-10">#</th>
                                    <th className="p-3 border-b text-left min-w-[200px]">รายการงาน</th>
                                    {/* --- เพิ่มคอลัมน์ใหม่ตรงนี้ --- */}
                                    <th className="p-3 border-b text-center w-24">ปริมาณ</th>
                                    <th className="p-3 border-b text-right w-24">ค่าแรง/หน่วย</th>
                                    {/* --------------------------- */}
                                    <th className="p-3 border-b text-right w-28">งบรวม</th>
                                    <th className="p-3 border-b text-right w-28 text-green-700">จ่ายแล้ว</th>
                                    <th className="p-3 border-b text-center w-32 bg-purple-100 text-purple-800 border-purple-200">ขอเบิก (บาท)</th>
                                    <th className="p-3 border-b text-right w-28 text-slate-500">คงเหลือ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {workItems.map((item, index) => {
                                    const qty = parseFloat(item.q) || 0;
                                    // ถ้า BOQ ไม่มีค่าแรง ใช้ค่าแรงที่ตกลงไว้ในใบ PO แทน
                                    const boqLp = parseFloat(item.lP) || 0;
                                    const poLp  = selPoLabor?.get(item.id) || 0;
                                    const laborPrice = boqLp > 0 ? boqLp : poLp;
                                    const fromPO = boqLp <= 0 && poLp > 0;
                                    const totalBudget = qty * laborPrice;
                                    
                                    const paid = getPaidAmount(item.id);
                                    const requesting = parseFloat(payAmounts[item.id]) || 0;
                                    const remaining = totalBudget - paid - requesting;

                                    return (
                                        <tr key={item.id} className="hover:bg-purple-50/20 transition">
                                            <td className="p-3 text-center text-slate-400">{index + 1}</td>
                                            <td className="p-3">
                                                <div className="font-bold text-slate-700">{item.name}</div>
                                                <div className="text-xs text-slate-400">{item.code}</div>
                                            </td>
                                            
                                            {/* --- แสดงข้อมูลปริมาณและราคาต่อหน่วย --- */}
                                            <td className="p-3 text-center font-mono text-slate-600">
                                                {qty.toLocaleString()} <span className="text-[10px] text-slate-400">{item.unit}</span>
                                            </td>
                                            <td className="p-3 text-right font-mono text-slate-600">
                                                {laborPrice.toLocaleString()}
                                                {fromPO && <span className="ml-1 text-[9px] text-orange-500 font-bold" title="ค่าแรงจากใบสั่งจ้าง (BOQ ไม่ได้ตั้งค่าแรงไว้)">PO</span>}
                                            </td>
                                            {/* -------------------------------------- */}

                                            <td className="p-3 text-right font-mono font-bold text-slate-700">
                                                {totalBudget.toLocaleString(undefined, {minimumFractionDigits:2})}
                                            </td>
                                            <td className="p-3 text-right font-mono font-bold text-green-600">
                                                {paid.toLocaleString(undefined, {minimumFractionDigits:2})}
                                            </td>
                                            
                                            <td className="p-2 text-center bg-purple-50/30">
                                                <input 
                                                    type="number" 
                                                    className="w-full text-right p-1.5 border border-purple-300 rounded focus:outline-none focus:border-purple-600 font-bold text-purple-700 bg-white"
                                                    placeholder="0.00"
                                                    value={payAmounts[item.id] || ''}
                                                    onChange={(e) => handleAmountChange(item.id, e.target.value, totalBudget - paid)}
                                                />
                                            </td>
                                            
                                            <td className={`p-3 text-right font-mono font-bold ${remaining < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                                                {remaining.toLocaleString(undefined, {minimumFractionDigits:2})}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="bg-slate-50 font-bold text-slate-700 border-t-2 border-slate-200">
                                <tr>
                                    <td colSpan="6" className="p-3 text-right">รวมยอดขอเบิกครั้งนี้:</td>
                                    <td className="p-3 text-right text-lg text-purple-700 bg-purple-100 border-b-4 border-purple-200">
                                        {Object.values(payAmounts).reduce((a, b) => a + (parseFloat(b) || 0), 0).toLocaleString(undefined, {minimumFractionDigits:2})}
                                    </td>
                                    <td className="p-3">บาท</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    <div className="p-4 bg-white border-t border-slate-200 flex justify-end">
                        <button 
                            onClick={saveDV}
                            className="bg-purple-600 text-white px-6 py-3 rounded-lg font-bold shadow-lg hover:bg-purple-700 hover:shadow-xl transition flex items-center gap-2 transform active:scale-95"
                        >
                            <FaSave /> บันทึกการเบิกจ่าย
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DV;
