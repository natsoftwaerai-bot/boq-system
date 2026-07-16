import React, { useState, useMemo } from 'react';
import { useProject } from '../context/ProjectContext';
import { FaPlus, FaTrash, FaSave, FaFileContract, FaListAlt, FaPencilAlt } from 'react-icons/fa';

const PO = ({ setActivePage }) => {
    const {
        currentProjectData, updateProjectData,
        user, approvalConfig, createApprovalRequest, currentProjectName, activeGroup,
    } = useProject();
    const [cart, setCart] = useState([]);
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [contractor, setContractor] = useState('');

    // mode: 'boq' = เลือกจาก BOQ | 'new' = รายการใหม่
    const [addMode, setAddMode] = useState('boq');

    // Fields สำหรับ mode 'boq'
    const [selectedItemId, setSelectedItemId] = useState('');

    // Fields ที่ใช้ร่วมกัน
    const [qty, setQty] = useState('');
    const [mPrice, setMPrice] = useState('');
    const [lPrice, setLPrice] = useState('');

    // Fields สำหรับ mode 'new'
    const [customName, setCustomName] = useState('');
    const [customUnit, setCustomUnit] = useState('เหมา');

    const poNo = useMemo(() => {
        const docs = currentProjectData.docs || [];
        const poCount = docs.filter(d => d.type === 'PO').length + 1;
        const d = new Date();
        const yymm = `${d.getFullYear().toString().substr(-2)}${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        return `PO-${yymm}-${String(poCount).padStart(3, '0')}`;
    }, [currentProjectData.docs]);

    const boqOptions = useMemo(() => {
        const boq = currentProjectData.boq || [];
        const trans = currentProjectData.trans || [];
        return boq.filter(i => i.type === 'item').map(item => {
            const orderedQty = trans
                .filter(t => t.type === 'PO' && t.itemId === item.id)
                .reduce((sum, t) => sum + (parseFloat(t.q) || 0), 0);
            return {
                ...item,
                orderedQty,
                remainingQty: (parseFloat(item.q) || 0) - orderedQty,
            };
        });
    }, [currentProjectData]);

    // ป้องกันค่าติดลบในช่องตัวเลข
    const nonNeg = (setter) => (e) => {
        const v = e.target.value;
        if (v === '' || parseFloat(v) >= 0) setter(v);
    };

    const resetForm = () => {
        setSelectedItemId('');
        setQty('');
        setMPrice('');
        setLPrice('');
        setCustomName('');
        setCustomUnit('เหมา');
    };

    const handleSelectChange = (e) => {
        const id = e.target.value;
        setSelectedItemId(id);
        // eslint-disable-next-line eqeqeq
        const item = currentProjectData.boq?.find(i => i.id == id);
        if (item) {
            setMPrice(item.mP || '');
            setLPrice(item.lP || '');
            if (item.con && !contractor) setContractor(item.con);
        }
    };

    // เพิ่มจาก BOQ
    const addFromBOQ = () => {
        if (!selectedItemId || !qty || parseFloat(qty) <= 0)
            return alert('กรุณาเลือกรายการและระบุจำนวน');
        // eslint-disable-next-line eqeqeq
        const item = boqOptions.find(i => i.id == selectedItemId);
        const q = parseFloat(qty);
        const mp = parseFloat(mPrice) || 0;
        const lp = parseFloat(lPrice) || 0;
        setCart([...cart, {
            id: item.id,
            code: item.code,
            name: item.name,
            unit: item.unit,
            q, mPrice: mp, lPrice: lp,
            mTotal: q * mp, lTotal: q * lp,
            isNew: false,
        }]);
        resetForm();
    };

    // เพิ่มรายการใหม่ (จะเพิ่มใน BOQ ตอน Save)
    const addCustomItem = () => {
        if (!customName.trim()) return alert('กรุณาระบุชื่อรายการ');
        if (!qty || parseFloat(qty) <= 0) return alert('กรุณาระบุจำนวน');
        const q = parseFloat(qty);
        const mp = parseFloat(mPrice) || 0;
        const lp = parseFloat(lPrice) || 0;
        setCart([...cart, {
            id: `new_${Date.now()}`,   // id ชั่วคราว จะถูกแทนที่ตอน save
            code: '',
            name: customName.trim(),
            unit: customUnit || 'เหมา',
            q, mPrice: mp, lPrice: lp,
            mTotal: q * mp, lTotal: q * lp,
            isNew: true,
        }]);
        resetForm();
    };

    const totalM = cart.reduce((s, i) => s + i.mTotal, 0);
    const totalL = cart.reduce((s, i) => s + i.lTotal, 0);
    const grandTotal = totalM + totalL;

    const fmt = (n) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const savePO = async () => {
        if (cart.length === 0) return alert('ไม่มีรายการในตะกร้า');
        if (!date) return alert('กรุณาระบุวันที่');
        if (!contractor.trim()) return alert('กรุณาระบุชื่อร้านค้า/ผู้รับจ้าง');

        // วิศวกร (PROJECT) → ส่งคำขอรออนุมัติแทนการบันทึกตรง (ถ้าเปิดใช้ในแผง DEV)
        if (user?.role === 'PROJECT' && approvalConfig?.po) {
            if (!confirm('ยืนยันส่งใบสั่งจ้างเพื่อรอผู้ดูแลอนุมัติ?')) return;
            const total = cart.reduce((s, i) => s + i.mTotal + i.lTotal, 0);
            const ok = await createApprovalRequest(
                'PO', currentProjectName, activeGroup,
                { cart, contractor: contractor.trim(), date },
                `ผู้รับจ้าง: ${contractor.trim()} | ${cart.length} รายการ | รวม ${total.toLocaleString('th-TH')} บาท`
            );
            if (ok) {
                alert('ส่งคำขอเรียบร้อย — รอผู้ดูแลอนุมัติ\nดูสถานะได้ที่เมนู "รออนุมัติ"');
                setCart([]);
                if (setActivePage) setActivePage('approvals');
            } else {
                alert('ส่งคำขอไม่สำเร็จ กรุณาลองใหม่');
            }
            return;
        }

        if (!confirm('ยืนยันการเปิดใบสั่งจ้าง?')) return;

        let updatedBOQ = [...(currentProjectData.boq || [])];
        let finalCart = [...cart];

        const newItems = cart.filter(i => i.isNew);

        if (newItems.length > 0) {
            // หา header "งานเพิ่มเติม" หรือสร้างใหม่
            let headerIdx = updatedBOQ.findIndex(
                i => i.type === 'header' && i.name === 'งานเพิ่มเติม'
            );

            if (headerIdx === -1) {
                let maxCode = 0;
                updatedBOQ.forEach(i => {
                    if (i.type === 'header') {
                        const c = parseInt(i.code);
                        if (!isNaN(c) && c > maxCode) maxCode = c;
                    }
                });
                const newHeader = {
                    id: Date.now(),
                    type: 'header',
                    code: String(maxCode + 1).padStart(2, '0'),
                    name: 'งานเพิ่มเติม',
                };
                updatedBOQ.push(newHeader);
                headerIdx = updatedBOQ.length - 1;
            }

            const headerCode = updatedBOQ[headerIdx].code;

            // นับรายการที่มีอยู่แล้วใน header นี้
            let existingCount = 0;
            for (let i = headerIdx + 1; i < updatedBOQ.length; i++) {
                if (updatedBOQ[i].type === 'header') break;
                existingCount++;
            }

            // แทรกรายการใหม่เข้า BOQ และอัปเดต id + code ใน cart
            newItems.forEach((cartItem, idx) => {
                const newBOQId = Date.now() + idx + 1;
                const itemCode = `${headerCode}.${existingCount + idx + 1}`;

                const boqItem = {
                    id: newBOQId,
                    type: 'item',
                    code: itemCode,
                    name: cartItem.name,
                    unit: cartItem.unit,
                    q: cartItem.q,
                    mP: cartItem.mPrice,
                    lP: cartItem.lPrice,
                    con: contractor,
                    note: '',
                };

                updatedBOQ.splice(headerIdx + 1 + existingCount + idx, 0, boqItem);

                // อัปเดต id และ code ใน finalCart
                finalCart = finalCart.map(ci =>
                    ci.id === cartItem.id
                        ? { ...ci, id: newBOQId, code: itemCode, isNew: false }
                        : ci
                );
            });
        }

        // อัปเดตรายการ BOQ ตามราคาที่ตกลงใน PO:
        // 1) ถ้างบใน BOQ เป็น 0 แต่ตกลงราคาใน PO → ตั้งราคานั้นเป็นงบใน BOQ
        //    (กันช่อง "เหลือ" ติดลบตอนจ่ายจริง เพราะงบเดิมเป็น 0)
        // 2) ประทับชื่อช่างให้รายการที่มีค่าแรง → ขึ้น dropdown หน้าเบิกค่าแรง (DV)
        updatedBOQ = updatedBOQ.map(i => {
            if (i.type !== 'item') return i;
            const c = finalCart.find(ci => ci.id === i.id);
            if (!c) return i;
            let next = i;
            const cLp = parseFloat(c.lPrice) || 0;
            const cMp = parseFloat(c.mPrice) || 0;
            if ((parseFloat(next.lP) || 0) <= 0 && cLp > 0) next = { ...next, lP: cLp };
            if ((parseFloat(next.mP) || 0) <= 0 && cMp > 0) next = { ...next, mP: cMp };
            if (!next.con && (parseFloat(next.lP) || 0) > 0) next = { ...next, con: contractor.trim() };
            return next;
        });

        const newDoc = {
            id: Math.random().toString(36).substr(2, 9),
            type: 'PO',
            no: poNo,
            date,
            contractor,
            status: 'WAITING',
            items: finalCart,
        };

        const newTrans = finalCart.map(item => ({
            id: Math.random().toString(36).substr(2, 9),
            type: 'PO',
            itemId: item.id,
            q: item.q,
            a: 0,
            date,
        }));

        updateProjectData(
            {
                ...currentProjectData,
                boq: updatedBOQ,
                docs: [...(currentProjectData.docs || []), newDoc],
                trans: [...(currentProjectData.trans || []), ...newTrans],
            },
            'CREATE_PO',
            `สร้าง PO ${poNo} | ผู้รับเหมา: ${contractor} | จำนวน ${finalCart.length} รายการ${newItems.length > 0 ? ` | เพิ่ม BOQ ใหม่ ${newItems.length} รายการ` : ''}`
        );

        const newCount = newItems.length;
        alert(`บันทึกใบสั่งจ้างเรียบร้อย!${newCount > 0 ? `\n✅ เพิ่ม ${newCount} รายการใหม่เข้า BOQ หมวด "งานเพิ่มเติม" แล้ว` : ''}`);
        setCart([]);
        if (setActivePage) setActivePage('po-hist');
    };

    return (
        <div className="max-w-5xl mx-auto bg-white p-6 rounded-xl border shadow-sm">
            <h2 className="text-lg font-bold mb-4 text-orange-600 border-b pb-2 flex items-center gap-2">
                <FaFileContract /> เปิดใบสั่งจ้าง (PO)
            </h2>

            {/* Header */}
            <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                    <label className="text-xs font-bold text-slate-500">เลขที่ PO</label>
                    <input value={poNo} readOnly className="w-full border rounded p-2 text-sm bg-slate-100 font-bold text-slate-600" />
                </div>
                <div>
                    <label className="text-xs font-bold text-red-500">* วันที่สั่งจ้าง</label>
                    <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border rounded p-2 text-sm outline-blue-500" />
                </div>
                <div>
                    <label className="text-xs font-bold text-red-500">* ร้านค้า / ผู้รับจ้าง</label>
                    <input
                        value={contractor}
                        onChange={e => setContractor(e.target.value)}
                        placeholder="ระบุชื่อร้านค้า/ผู้รับจ้าง..."
                        className="w-full border border-slate-300 rounded p-2 text-sm outline-orange-400"
                    />
                </div>
            </div>

            {/* Mode Toggle */}
            <div className="flex gap-2 mb-3">
                <button
                    onClick={() => { setAddMode('boq'); resetForm(); }}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold border transition ${
                        addMode === 'boq'
                            ? 'bg-orange-500 text-white border-orange-500 shadow'
                            : 'bg-white text-slate-500 border-slate-300 hover:border-orange-300'
                    }`}
                >
                    <FaListAlt /> เลือกจาก BOQ
                </button>
                <button
                    onClick={() => { setAddMode('new'); resetForm(); }}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold border transition ${
                        addMode === 'new'
                            ? 'bg-amber-500 text-white border-amber-500 shadow'
                            : 'bg-white text-slate-500 border-slate-300 hover:border-amber-300'
                    }`}
                >
                    <FaPencilAlt /> รายการนอก BOQ
                </button>
            </div>

            {/* Add Item Form — mode: boq */}
            {addMode === 'boq' && (
                <div className="p-4 bg-orange-50 rounded-lg mb-4 border border-orange-100">
                    <div className="grid grid-cols-12 gap-3 items-end">
                        <div className="col-span-5">
                            <label className="text-xs font-bold text-slate-600">เลือกรายการจาก BOQ</label>
                            <select
                                value={selectedItemId}
                                onChange={handleSelectChange}
                                className="w-full p-2 border border-slate-300 rounded text-sm outline-none focus:border-orange-500"
                            >
                                <option value="">-- เลือกรายการ --</option>
                                {boqOptions.map(item => (
                                    <option key={item.id} value={item.id}>
                                        [{item.code}] {item.name} (เหลือ: {item.remainingQty.toLocaleString()} {item.unit})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="col-span-2">
                            <label className="text-xs font-bold text-slate-600">จำนวน</label>
                            <input type="number" value={qty} onChange={nonNeg(setQty)}
                                className="w-full p-2 border rounded text-sm outline-none font-bold text-center" placeholder="0" />
                        </div>
                        <div className="col-span-2">
                            <label className="text-xs font-bold text-blue-600">ค่าของ / หน่วย</label>
                            <input type="number" value={mPrice} onChange={nonNeg(setMPrice)}
                                className="w-full p-2 border border-blue-200 rounded text-sm outline-none text-right text-blue-700 font-bold" placeholder="0.00" />
                        </div>
                        <div className="col-span-2">
                            <label className="text-xs font-bold text-purple-600">ค่าแรง / หน่วย</label>
                            <input type="number" value={lPrice} onChange={nonNeg(setLPrice)}
                                className="w-full p-2 border border-purple-200 rounded text-sm outline-none text-right text-purple-700 font-bold" placeholder="0.00" />
                        </div>
                        <div className="col-span-1">
                            <label className="text-xs font-bold opacity-0">add</label>
                            <button onClick={addFromBOQ}
                                className="w-full bg-orange-500 text-white p-2 rounded hover:bg-orange-600 transition flex items-center justify-center">
                                <FaPlus />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Item Form — mode: new */}
            {addMode === 'new' && (
                <div className="p-4 bg-amber-50 rounded-lg mb-4 border border-amber-200">
                    <p className="text-xs text-amber-700 font-bold mb-3">
                        ⚠️ รายการนี้จะถูกเพิ่มเข้า BOQ หมวด "งานเพิ่มเติม" อัตโนมัติเมื่อบันทึก PO
                    </p>
                    <div className="grid grid-cols-12 gap-3 items-end">
                        <div className="col-span-4">
                            <label className="text-xs font-bold text-red-500">* ชื่อรายการ</label>
                            <input
                                type="text" value={customName} onChange={e => setCustomName(e.target.value)}
                                className="w-full p-2 border border-amber-300 rounded text-sm outline-none focus:border-amber-500"
                                placeholder="ระบุชื่อรายการ..."
                            />
                        </div>
                        <div className="col-span-1">
                            <label className="text-xs font-bold text-slate-600">หน่วย</label>
                            <input
                                type="text" value={customUnit} onChange={e => setCustomUnit(e.target.value)}
                                className="w-full p-2 border border-slate-300 rounded text-sm outline-none text-center"
                                placeholder="เหมา"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="text-xs font-bold text-slate-600">จำนวน</label>
                            <input type="number" value={qty} onChange={nonNeg(setQty)}
                                className="w-full p-2 border rounded text-sm outline-none font-bold text-center" placeholder="0" />
                        </div>
                        <div className="col-span-2">
                            <label className="text-xs font-bold text-blue-600">ค่าของ / หน่วย</label>
                            <input type="number" value={mPrice} onChange={nonNeg(setMPrice)}
                                className="w-full p-2 border border-blue-200 rounded text-sm outline-none text-right text-blue-700 font-bold" placeholder="0.00" />
                        </div>
                        <div className="col-span-2">
                            <label className="text-xs font-bold text-purple-600">ค่าแรง / หน่วย</label>
                            <input type="number" value={lPrice} onChange={nonNeg(setLPrice)}
                                className="w-full p-2 border border-purple-200 rounded text-sm outline-none text-right text-purple-700 font-bold" placeholder="0.00" />
                        </div>
                        <div className="col-span-1">
                            <label className="text-xs font-bold opacity-0">add</label>
                            <button onClick={addCustomItem}
                                className="w-full bg-amber-500 text-white p-2 rounded hover:bg-amber-600 transition flex items-center justify-center">
                                <FaPlus />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cart Table */}
            <div className="border rounded overflow-hidden mb-4">
                <table className="w-full text-sm">
                    <thead className="bg-slate-100 text-slate-600 text-xs uppercase font-bold">
                        <tr>
                            <th className="p-3 text-left">รายการ</th>
                            <th className="p-3 text-right">จำนวน</th>
                            <th className="p-3 text-right text-blue-700">ค่าของ/หน่วย</th>
                            <th className="p-3 text-right text-blue-700 bg-blue-50">รวมค่าของ</th>
                            <th className="p-3 text-right text-purple-700">ค่าแรง/หน่วย</th>
                            <th className="p-3 text-right text-purple-700 bg-purple-50">รวมค่าแรง</th>
                            <th className="p-3 text-right font-bold text-slate-800">รวมทั้งสิ้น</th>
                            <th className="p-3 w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {cart.length === 0 ? (
                            <tr>
                                <td colSpan="8" className="p-6 text-center text-slate-400 italic">
                                    ยังไม่มีรายการในตะกร้า
                                </td>
                            </tr>
                        ) : (
                            cart.map((item, index) => (
                                <tr key={index} className={`hover:bg-slate-50 transition ${item.isNew ? 'bg-amber-50/40' : 'bg-white'}`}>
                                    <td className="p-3">
                                        <div className="flex items-center gap-2">
                                            <div className="font-bold text-slate-700">{item.name}</div>
                                            {item.isNew && (
                                                <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-300 px-1.5 py-0.5 rounded font-bold">
                                                    ใหม่
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-[10px] text-slate-400">{item.code || 'จะกำหนด code เมื่อบันทึก'}</div>
                                    </td>
                                    <td className="p-3 text-right font-mono">
                                        {item.q.toLocaleString()} <span className="text-xs text-slate-400">{item.unit}</span>
                                    </td>
                                    <td className="p-3 text-right font-mono text-blue-600">{fmt(item.mPrice)}</td>
                                    <td className="p-3 text-right font-mono font-bold text-blue-700 bg-blue-50">{fmt(item.mTotal)}</td>
                                    <td className="p-3 text-right font-mono text-purple-600">{fmt(item.lPrice)}</td>
                                    <td className="p-3 text-right font-mono font-bold text-purple-700 bg-purple-50">{fmt(item.lTotal)}</td>
                                    <td className="p-3 text-right font-mono font-bold text-slate-800">{fmt(item.mTotal + item.lTotal)}</td>
                                    <td className="p-3 text-center">
                                        <button
                                            onClick={() => setCart(cart.filter((_, i) => i !== index))}
                                            className="text-red-400 hover:text-red-600 transition"
                                        >
                                            <FaTrash />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                    {cart.length > 0 && (
                        <tfoot className="bg-slate-100 font-bold text-sm border-t-2 border-slate-300">
                            <tr>
                                <td colSpan="3" className="p-3 text-right text-slate-500 text-xs uppercase">รวมค่าของ:</td>
                                <td className="p-3 text-right font-mono text-blue-700 bg-blue-50">{fmt(totalM)}</td>
                                <td className="p-3 text-right text-slate-500 text-xs uppercase">รวมค่าแรง:</td>
                                <td className="p-3 text-right font-mono text-purple-700 bg-purple-50">{fmt(totalL)}</td>
                                <td className="p-3 text-right font-mono text-slate-900 text-base">{fmt(grandTotal)}</td>
                                <td></td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>

            {cart.some(i => i.isNew) && (
                <div className="mb-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 font-medium">
                    📋 มี {cart.filter(i => i.isNew).length} รายการใหม่ที่จะถูกเพิ่มเข้า BOQ หมวด "งานเพิ่มเติม" เมื่อบันทึก
                </div>
            )}

            <button
                onClick={savePO}
                className="w-full py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold shadow-lg transition flex items-center justify-center gap-2"
            >
                <FaSave /> บันทึกใบสั่งจ้าง (PO)
            </button>
        </div>
    );
};

export default PO;
