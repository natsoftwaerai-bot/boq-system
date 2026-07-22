import React, { useState, useMemo } from 'react';
import { useProject } from '../context/ProjectContext';
import { FaPrint, FaChevronRight, FaHardHat, FaCalendarAlt, FaCheckSquare, FaRegSquare } from 'react-icons/fa';
import PrintModal from '../components/PrintModal';

const DVHistory = () => {
    const { currentProjectData, user } = useProject();
    const isSimpleView = user?.role === 'USER' || user?.role === 'PROJECT';
    const dvList = (currentProjectData.docs || []).filter(d => d.type === 'DV');
    const [previewData, setPreviewData] = useState(null);
    const [batchList, setBatchList]     = useState(null);   // array เมื่อพิมพ์หลายใบ
    const [selected, setSelected]       = useState(new Set()); // id ที่ติ๊กไว้
    const [expandedMonths, setExpandedMonths] = useState(new Set());

    // ── ติ๊กเลือก ──
    const toggleSel = (id) => setSelected(prev => {
        const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s;
    });
    const setMany = (ids, on) => setSelected(prev => {
        const s = new Set(prev); ids.forEach(id => on ? s.add(id) : s.delete(id)); return s;
    });
    // พิมพ์ตาม id ที่เลือก (เรียงตามวันที่)
    const printByIds = (ids) => {
        const idSet = new Set(ids);
        const docs = dvList
            .filter(d => idSet.has(d.id))
            .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        if (docs.length) setBatchList(docs);
    };
    const closePrint = () => { setPreviewData(null); setBatchList(null); };

    const { monthlyGroups, grandTotal } = useMemo(() => {
        const groups = {};
        let grandTotal = 0;

        dvList.forEach(doc => {
            const d = new Date(doc.date);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = d.toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });
            if (!groups[key]) groups[key] = { key, label, docs: [], total: 0 };
            const amount = doc.items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
            groups[key].docs.push({ ...doc, _total: amount });
            groups[key].total += amount;
            grandTotal += amount;
        });

        const sorted = Object.values(groups).sort((a, b) => b.key.localeCompare(a.key));
        return { monthlyGroups: sorted, grandTotal };
    }, [dvList]);

    const toggleMonth = (key) => {
        setExpandedMonths(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const sortedDvList = useMemo(() =>
        [...dvList].sort((a, b) => b.date?.localeCompare(a.date))
    , [dvList]);

    return (
        <div className="max-w-5xl mx-auto space-y-4">
            <h2 className="font-bold text-purple-600 text-lg flex items-center gap-2">
                <FaHardHat /> ประวัติการเบิกจ่ายค่าแรง (DV History)
            </h2>

            {dvList.length === 0 ? (
                <div className="bg-white rounded-xl border shadow-sm p-10 text-center text-slate-400">
                    ยังไม่มีข้อมูลการเบิกจ่าย
                </div>
            ) : isSimpleView ? (
                /* ── Simple view สำหรับ USER / PROJECT ── */
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    {(() => {
                        const allIds  = sortedDvList.map(d => d.id);
                        const selCount = allIds.filter(id => selected.has(id)).length;
                        const allSel   = allIds.length > 0 && selCount === allIds.length;
                        return (
                        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
                            <button
                                onClick={() => setMany(allIds, !allSel)}
                                className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-purple-700 transition"
                            >
                                {allSel ? <FaCheckSquare className="text-purple-500" /> : <FaRegSquare className="text-slate-400" />}
                                เลือกทั้งหมด ({dvList.length})
                            </button>
                            {selCount > 0 && (
                                <button
                                    onClick={() => printByIds(allIds.filter(id => selected.has(id)))}
                                    className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm transition"
                                >
                                    <FaPrint size={11} /> พิมพ์ที่เลือก ({selCount})
                                </button>
                            )}
                        </div>
                        );
                    })()}
                    <table className="w-full text-sm">
                        <thead className="bg-purple-50">
                            <tr>
                                <th className="px-3 py-2.5 text-center w-10"></th>
                                <th className="px-5 py-2.5 text-left text-xs font-bold text-purple-700">เลขที่ DV</th>
                                <th className="px-5 py-2.5 text-left text-xs font-bold text-purple-700">วันที่</th>
                                <th className="px-5 py-2.5 text-left text-xs font-bold text-purple-700">จ่ายให้</th>
                                <th className="px-5 py-2.5 text-right text-xs font-bold text-purple-700">ยอดรวม (บาท)</th>
                                <th className="px-5 py-2.5 text-center text-xs font-bold text-purple-700 w-16">พิมพ์</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {sortedDvList.map(doc => {
                                const total = (doc.items || []).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
                                const isSel = selected.has(doc.id);
                                return (
                                    <tr key={doc.id} className={`transition ${isSel ? 'bg-purple-50/60' : 'hover:bg-purple-50/30'}`}>
                                        <td className="px-3 py-3 text-center">
                                            <button onClick={() => toggleSel(doc.id)} className="p-1" title="เลือก">
                                                {isSel ? <FaCheckSquare className="text-purple-500" /> : <FaRegSquare className="text-slate-300" />}
                                            </button>
                                        </td>
                                        <td className="px-5 py-3 font-bold text-purple-600">{doc.no}</td>
                                        <td className="px-5 py-3 text-slate-500 text-xs">
                                            {new Date(doc.date).toLocaleDateString('th-TH', {
                                                year: 'numeric', month: 'short', day: 'numeric'
                                            })}
                                        </td>
                                        <td className="px-5 py-3 font-medium text-slate-700">{doc.payee}</td>
                                        <td className="px-5 py-3 text-right font-bold text-slate-700">
                                            {total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-5 py-3 text-center">
                                            <button onClick={() => setPreviewData(doc)}
                                                className="text-slate-400 hover:text-purple-600 transition p-1" title="พิมพ์">
                                                <FaPrint size={15} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                /* ── Full view สำหรับ ADMIN / DEV ── */
                <>
                    {/* ยอดรวมทั้งหมด */}
                    <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl p-5 flex justify-between items-center shadow-md">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                                <FaCalendarAlt className="text-white" />
                            </div>
                            <div>
                                <div className="text-xs font-bold opacity-80 uppercase tracking-wider">ยอดเบิกค่าแรงรวมทั้งหมด</div>
                                <div className="text-xs opacity-70 mt-0.5">
                                    {dvList.length} รายการ &nbsp;·&nbsp; {monthlyGroups.length} เดือน
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-3xl font-bold">
                                {grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                            </div>
                            <div className="text-xs opacity-70 mt-0.5">บาท</div>
                        </div>
                    </div>

                    {/* สรุปรายเดือน */}
                    <div className="space-y-2">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
                            สรุปยอดรายเดือน — กดเดือนเพื่อดูรายละเอียด
                        </div>

                        {monthlyGroups.map((group, gi) => {
                            const isOpen = expandedMonths.has(group.key);
                            const pct = grandTotal > 0 ? (group.total / grandTotal) * 100 : 0;

                            return (
                                <div key={group.key} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                    <button
                                        onClick={() => toggleMonth(group.key)}
                                        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-purple-50/60 transition text-left group"
                                    >
                                        <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                                            {gi + 1}
                                        </div>
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                            <FaChevronRight
                                                className={`text-purple-300 text-xs flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="font-bold text-slate-700">{group.label}</div>
                                                <div className="flex items-center gap-3 mt-1.5">
                                                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                        <div className="h-full bg-purple-400 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                                                    </div>
                                                    <span className="text-[10px] text-slate-400 flex-shrink-0">{pct.toFixed(1)}%</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <div className="font-bold text-purple-700 text-lg leading-none">
                                                {group.total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                                            </div>
                                            <div className="text-[10px] text-slate-400 mt-1">
                                                บาท &nbsp;·&nbsp; {group.docs.length} ครั้ง
                                            </div>
                                        </div>
                                    </button>

                                    {isOpen && (() => {
                                        const monthIds  = group.docs.map(d => d.id);
                                        const selCount  = monthIds.filter(id => selected.has(id)).length;
                                        const allSel    = monthIds.length > 0 && selCount === monthIds.length;
                                        return (
                                        <div className="border-t border-slate-100">
                                            {/* แถบเลือก + พิมพ์ที่เลือก */}
                                            <div className="flex items-center justify-between px-5 py-2 bg-purple-50/50 border-b border-purple-100">
                                                <button
                                                    onClick={() => setMany(monthIds, !allSel)}
                                                    className="flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-purple-700 transition"
                                                >
                                                    {allSel ? <FaCheckSquare className="text-purple-500" /> : <FaRegSquare className="text-slate-400" />}
                                                    เลือกทั้งเดือน
                                                </button>
                                                {selCount > 0 && (
                                                    <button
                                                        onClick={() => printByIds(monthIds.filter(id => selected.has(id)))}
                                                        className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm transition"
                                                    >
                                                        <FaPrint size={11} /> พิมพ์ที่เลือก ({selCount})
                                                    </button>
                                                )}
                                            </div>
                                            <table className="w-full text-sm">
                                                <thead className="bg-purple-50">
                                                    <tr>
                                                        <th className="px-3 py-2.5 text-center w-10"></th>
                                                        <th className="px-5 py-2.5 text-left text-xs font-bold text-purple-700">เลขที่ DV</th>
                                                        <th className="px-5 py-2.5 text-left text-xs font-bold text-purple-700">วันที่</th>
                                                        <th className="px-5 py-2.5 text-left text-xs font-bold text-purple-700">จ่ายให้</th>
                                                        <th className="px-5 py-2.5 text-right text-xs font-bold text-purple-700">ยอดรวม (บาท)</th>
                                                        <th className="px-5 py-2.5 text-center text-xs font-bold text-purple-700 w-16">พิมพ์</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50">
                                                    {[...group.docs].reverse().map(doc => {
                                                        const isSel = selected.has(doc.id);
                                                        return (
                                                        <tr key={doc.id} className={`transition ${isSel ? 'bg-purple-50/60' : 'hover:bg-purple-50/30'}`}>
                                                            <td className="px-3 py-3 text-center">
                                                                <button onClick={() => toggleSel(doc.id)} className="p-1" title="เลือก">
                                                                    {isSel ? <FaCheckSquare className="text-purple-500" /> : <FaRegSquare className="text-slate-300" />}
                                                                </button>
                                                            </td>
                                                            <td className="px-5 py-3 font-bold text-purple-600">{doc.no}</td>
                                                            <td className="px-5 py-3 text-slate-500 text-xs">
                                                                {new Date(doc.date).toLocaleDateString('th-TH', {
                                                                    year: 'numeric', month: 'short', day: 'numeric'
                                                                })}
                                                            </td>
                                                            <td className="px-5 py-3 font-medium text-slate-700">{doc.payee}</td>
                                                            <td className="px-5 py-3 text-right font-bold text-slate-700">
                                                                {doc._total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                                                            </td>
                                                            <td className="px-5 py-3 text-center">
                                                                <button onClick={() => setPreviewData(doc)}
                                                                    className="text-slate-400 hover:text-purple-600 transition p-1" title="พิมพ์">
                                                                    <FaPrint size={15} />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                        );
                                                    })}
                                                </tbody>
                                                <tfoot className="bg-slate-50 border-t border-slate-200">
                                                    <tr>
                                                        <td colSpan="4" className="px-5 py-2.5 text-right text-xs font-bold text-slate-500">
                                                            รวมเดือน {group.label}:
                                                        </td>
                                                        <td className="px-5 py-2.5 text-right font-bold text-purple-700">
                                                            {group.total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                                                        </td>
                                                        <td />
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                        );
                                    })()}
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            <PrintModal
                isOpen={!!previewData || !!(batchList && batchList.length)}
                onClose={closePrint}
                data={previewData}
                dataList={batchList}
            />
        </div>
    );
};

export default DVHistory;
