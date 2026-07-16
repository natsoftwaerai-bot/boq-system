import React, { useState, useMemo } from 'react';
import { useProject } from '../context/ProjectContext';
import { FaFileInvoiceDollar, FaCheckCircle, FaTimes } from 'react-icons/fa';

const PUPending = ({ setActivePage }) => {
    const { currentProjectData, updateProjectData } = useProject();

    const [selectedPO, setSelectedPO] = useState(null);
    const [puDate, setPuDate] = useState(new Date().toISOString().split('T')[0]);
    // { [itemId]: actualMaterialPrice }
    const [inputPrices, setInputPrices] = useState({});

    const pendingPOs = useMemo(() =>
        (currentProjectData.docs || []).filter(d => d.type === 'PO' && d.status === 'WAITING'),
    [currentProjectData.docs]);

    const openModal = (po) => {
        setSelectedPO(po);
        setPuDate(new Date().toISOString().split('T')[0]);
        // Pre-fill material price from PO item
        const initial = {};
        po.items.forEach(item => {
            initial[item.id] = item.mPrice !== undefined ? item.mPrice : 0;
        });
        setInputPrices(initial);
    };

    const closeModal = () => {
        setSelectedPO(null);
        setInputPrices({});
    };

    const handlePriceChange = (itemId, value) => {
        const num = parseFloat(value) || 0;
        setInputPrices(prev => ({ ...prev, [itemId]: Math.max(0, num) }));
    };

    const fmt = (n) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const grandTotal = selectedPO
        ? selectedPO.items.reduce((sum, item) => {
            const mp = inputPrices[item.id] || 0;
            const lTotal = item.q * (item.lPrice || 0);
            return sum + item.q * mp + lTotal;
        }, 0)
        : 0;

    const savePU = () => {
        if (!selectedPO) return;
        if (!confirm('ยืนยันการบันทึกจัดซื้อ/จัดจ้าง?')) return;

        const puItems = selectedPO.items.map(item => {
            const mp = inputPrices[item.id] || 0;
            const lp = item.lPrice || 0;
            return {
                ...item,
                mPrice: mp,
                lPrice: lp,
                mTotal: item.q * mp,
                lTotal: item.q * lp,
                price: mp + lp,
                total: item.q * (mp + lp),
            };
        });

        const count = (currentProjectData.docs || []).filter(d => d.type === 'PU').length + 1;
        const now = new Date();
        const docNo = `PU-${now.getFullYear().toString().substr(-2)}${(now.getMonth() + 1).toString().padStart(2, '0')}-${String(count).padStart(3, '0')}`;

        const newDoc = {
            id: Date.now().toString(),
            type: 'PU',
            no: docNo,
            date: puDate,
            ref: selectedPO.no,
            contractor: selectedPO.contractor,
            items: puItems,
            status: 'DONE',
        };

        // PU transactions สำหรับค่าของ
        const matTrans = puItems
            .filter(i => i.mTotal > 0)
            .map(item => ({
                id: Math.random().toString(36).substr(2, 9),
                type: 'PU',
                itemId: item.id,
                q: item.q,
                a: item.mTotal,
                date: puDate,
            }));

        // ⚠️ ค่าแรงไม่ตัดยอดที่นี่ — จ่ายผ่านหน้า "เบิกค่าแรง (DV)" ทางเดียว
        // (กันจ่ายซ้ำ: เดิม PU สร้าง EXPENSE ค่าแรงอัตโนมัติ แล้ว DV เบิกซ้ำได้อีก)

        const updatedDocs = currentProjectData.docs.map(d =>
            d.id === selectedPO.id ? { ...d, status: 'DONE' } : d
        );
        updatedDocs.push(newDoc);

        const matTotal = matTrans.reduce((s, t) => s + t.a, 0);
        updateProjectData(
            {
                ...currentProjectData,
                docs: updatedDocs,
                trans: [...(currentProjectData.trans || []), ...matTrans],
            },
            'COMPLETE_PU',
            `บันทึก ${docNo} | อ้างอิง PO ${selectedPO.no} | ผู้รับเหมา: ${selectedPO.contractor} | วัสดุ ${matTotal.toLocaleString('th-TH')} บาท (ค่าแรงเบิกผ่าน DV)`
        );

        alert('บันทึกจัดซื้อ/จัดจ้างเรียบร้อย!');
        closeModal();
        setActivePage('pu-hist');
    };

    return (
        <div className="max-w-5xl mx-auto h-full flex flex-col font-sarabun">
            <h2 className="text-lg font-bold text-blue-600 mb-4 flex items-center gap-2">
                <FaFileInvoiceDollar /> รอจัดซื้อ/จัดจ้าง (Pending PU)
            </h2>

            <div className="space-y-3">
                {pendingPOs.length === 0 ? (
                    <div className="text-center text-slate-400 py-10 bg-white rounded-lg border border-dashed border-slate-300">
                        ไม่มีรายการรอจัดซื้อ
                    </div>
                ) : (
                    pendingPOs.map(po => {
                        const poTotal = po.items.reduce((s, i) =>
                            s + (i.mTotal || 0) + (i.lTotal || 0), 0);
                        return (
                            <div
                                key={po.id}
                                onClick={() => openModal(po)}
                                className="p-4 border rounded-xl bg-white cursor-pointer shadow-sm hover:shadow-md transition hover:border-blue-300 group"
                            >
                                <div className="flex justify-between items-center mb-1">
                                    <div className="font-bold text-blue-600 text-base group-hover:text-blue-700">
                                        {po.no}
                                    </div>
                                    <div className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-bold">
                                        Waiting
                                    </div>
                                </div>
                                <div className="flex justify-between text-xs text-slate-500">
                                    <span>{po.contractor || '-'}</span>
                                    <span>{po.items.length} รายการ {poTotal > 0 && `• ${poTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} บาท`}</span>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Modal */}
            {selectedPO && (
                <div className="fixed inset-0 bg-black/70 z-[9000] flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">

                        {/* Modal Header */}
                        <div className="p-5 border-b bg-slate-50 flex justify-between items-center">
                            <h3 className="font-bold text-xl text-blue-700 flex items-center gap-2">
                                <FaCheckCircle /> บันทึกราคาจ้าง/ซื้อ (PU)
                                <span className="text-sm font-normal text-slate-400 ml-2">อ้างอิง: {selectedPO.no}</span>
                            </h3>
                            <button onClick={closeModal} className="text-slate-400 text-2xl hover:text-red-500 transition">
                                <FaTimes />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 overflow-y-auto flex-1 bg-white">
                            <div className="grid grid-cols-3 gap-4 mb-6 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">เลขที่ PU (Auto)</label>
                                    <input value="Auto Gen..." disabled className="w-full border border-blue-200 rounded-lg p-2.5 text-sm font-bold text-blue-400 bg-white cursor-not-allowed" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">วันที่ซื้อ/จ้างจริง</label>
                                    <input
                                        type="date" value={puDate}
                                        onChange={e => setPuDate(e.target.value)}
                                        className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:border-blue-500 outline-none font-bold text-slate-700"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">ร้านค้า / ผู้รับจ้าง</label>
                                    <input value={selectedPO.contractor || '-'} disabled className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-bold text-slate-700 bg-slate-50 cursor-not-allowed" />
                                </div>
                            </div>

                            <div className="border rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-100 text-slate-600 font-bold text-xs uppercase">
                                        <tr>
                                            <th className="p-3 text-left">รายการ</th>
                                            <th className="p-3 text-right w-24">จำนวน</th>
                                            <th className="p-3 text-right w-28 text-slate-400">ราคากลาง</th>
                                            <th className="p-3 text-center bg-blue-50 text-blue-700 w-40 border-b-2 border-blue-200">ราคาค่าของจริง/หน่วย</th>
                                            <th className="p-3 text-right bg-blue-50 text-blue-700 w-32 border-b-2 border-blue-200">รวมค่าของ</th>
                                            <th className="p-3 text-right w-32 text-purple-600">รวมค่าแรง (PO)</th>
                                            <th className="p-3 text-right w-32 font-bold">รวมทั้งสิ้น</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {selectedPO.items.map((item, index) => {
                                            const boqItem = currentProjectData.boq?.find(b => b.id === item.id);
                                            const stdPrice = boqItem ? parseFloat(boqItem.mP) || 0 : 0;
                                            const mp = inputPrices[item.id] !== undefined ? inputPrices[item.id] : 0;
                                            const mTotal = item.q * mp;
                                            const lTotal = item.q * (item.lPrice || 0);
                                            return (
                                                <tr key={index} className="hover:bg-slate-50">
                                                    <td className="p-3">
                                                        <div className="font-bold text-slate-700">{item.name}</div>
                                                        <div className="text-[10px] text-slate-400">{item.code}</div>
                                                    </td>
                                                    <td className="p-3 text-right font-mono font-bold text-slate-600">
                                                        {parseFloat(item.q).toLocaleString()} <span className="text-xs font-normal text-slate-400">{item.unit}</span>
                                                    </td>
                                                    <td className="p-3 text-right font-mono text-slate-400">
                                                        {fmt(stdPrice)}
                                                    </td>
                                                    <td className="p-2 bg-blue-50/30">
                                                        <input
                                                            type="number"
                                                            className="w-full h-10 px-2 text-lg font-bold text-blue-700 bg-white border border-blue-300 rounded text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                            placeholder="0.00"
                                                            value={inputPrices[item.id] === undefined ? '' : inputPrices[item.id] || ''}
                                                            onChange={e => handlePriceChange(item.id, e.target.value)}
                                                            autoFocus={index === 0}
                                                        />
                                                    </td>
                                                    <td className="p-3 text-right font-bold text-blue-800 bg-blue-50/30 font-mono text-lg">
                                                        {fmt(mTotal)}
                                                    </td>
                                                    <td className="p-3 text-right font-mono text-purple-600">
                                                        {fmt(lTotal)}
                                                    </td>
                                                    <td className="p-3 text-right font-bold text-slate-800 font-mono">
                                                        {fmt(mTotal + lTotal)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot className="bg-slate-50 font-bold text-slate-700">
                                        <tr>
                                            <td colSpan="6" className="p-3 text-right uppercase text-xs text-slate-500">ยอดรวมทั้งสิ้น:</td>
                                            <td className="p-3 text-right text-lg text-slate-800 border-t-2 border-slate-300 font-mono">
                                                {fmt(grandTotal)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-5 border-t bg-slate-50 flex justify-end gap-3">
                            <button
                                onClick={closeModal}
                                className="px-6 py-2.5 border border-slate-300 rounded-xl font-bold text-slate-500 hover:bg-white hover:text-red-500 transition shadow-sm"
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={savePU}
                                className="px-8 py-2.5 bg-blue-600 text-white rounded-xl shadow-lg font-bold hover:bg-blue-700 transition flex items-center gap-2"
                            >
                                <FaCheckCircle /> ยืนยันบันทึกจัดซื้อ/จัดจ้าง
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PUPending;
