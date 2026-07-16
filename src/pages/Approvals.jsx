import React, { useState, useMemo } from 'react';
import { useProject } from '../context/ProjectContext';
import { FaClipboardCheck, FaCheck, FaTimes, FaBoxOpen, FaHardHat, FaChevronDown, FaChevronUp } from 'react-icons/fa';

const STATUS_STYLE = {
    PENDING:  { label: 'รออนุมัติ',  cls: 'bg-amber-100 text-amber-700 border-amber-200' },
    APPROVED: { label: 'อนุมัติแล้ว', cls: 'bg-green-100 text-green-700 border-green-200' },
    REJECTED: { label: 'ปฏิเสธ',     cls: 'bg-red-100 text-red-600 border-red-200' },
};

const fmt = (n) => (parseFloat(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-';

// ยอดรวมของคำขอ
const requestTotal = (req) => {
    if (req.type === 'PO') {
        return (req.payload?.cart || []).reduce((s, i) => s + (parseFloat(i.mTotal) || 0) + (parseFloat(i.lTotal) || 0), 0);
    }
    return (req.payload?.items || []).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
};

const Approvals = () => {
    const { approvalRequests, approveRequest, rejectRequest, user } = useProject();
    const [expanded, setExpanded] = useState(new Set());
    const [busy, setBusy] = useState(null);
    const [filter, setFilter] = useState('PENDING');

    const isApprover = user?.role === 'ADMIN' || user?.role === 'DEV';

    // ADMIN/DEV เห็นทั้งหมด — วิศวกรเห็นเฉพาะคำขอของตัวเอง
    const visible = useMemo(() => {
        const base = isApprover ? approvalRequests : approvalRequests.filter(r => r.requestedByUid === user?.uid);
        if (filter === 'ALL') return base;
        return base.filter(r => r.status === filter);
    }, [approvalRequests, isApprover, user, filter]);

    const toggle = (id) => setExpanded(prev => {
        const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s;
    });

    const handleApprove = async (req) => {
        if (!confirm(`อนุมัติคำขอ ${req.type} ของ ${req.requestedBy}?\n${req.summary}`)) return;
        setBusy(req.id);
        await approveRequest(req);
        setBusy(null);
    };

    const handleReject = async (req) => {
        const reason = prompt('เหตุผลที่ปฏิเสธ (ไม่บังคับ):');
        if (reason === null) return;
        setBusy(req.id);
        await rejectRequest(req, reason.trim());
        setBusy(null);
    };

    return (
        <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-700 flex items-center gap-2">
                    <FaClipboardCheck className="text-amber-500" />
                    {isApprover ? 'คำขอรออนุมัติ' : 'คำขอของฉัน'}
                </h2>
                <div className="flex gap-1">
                    {['PENDING', 'APPROVED', 'REJECTED', 'ALL'].map(f => (
                        <button key={f} onClick={() => setFilter(f)}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition
                                ${filter === f ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>
                            {f === 'ALL' ? 'ทั้งหมด' : STATUS_STYLE[f].label}
                        </button>
                    ))}
                </div>
            </div>

            {visible.length === 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400">
                    <FaClipboardCheck className="text-3xl mx-auto mb-3 opacity-30" />
                    ไม่มีคำขอ{filter === 'PENDING' ? 'ที่รออนุมัติ' : ''}
                </div>
            )}

            <div className="space-y-3">
                {visible.map(req => {
                    const st = STATUS_STYLE[req.status] || STATUS_STYLE.PENDING;
                    const isExp = expanded.has(req.id);
                    const total = requestTotal(req);
                    const items = req.type === 'PO' ? (req.payload?.cart || []) : (req.payload?.items || []);
                    return (
                        <div key={req.id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                            {/* Header row */}
                            <div className="flex items-center gap-3 px-4 py-3">
                                <span className={`w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0
                                    ${req.type === 'PO' ? 'bg-orange-500' : 'bg-purple-600'}`}>
                                    {req.type === 'PO' ? <FaBoxOpen /> : <FaHardHat />}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-slate-700 text-sm truncate">
                                        {req.type === 'PO' ? 'เปิดใบสั่งจ้าง' : 'เบิกค่าแรง'} · {req.plotName}
                                        <span className="ml-2 text-xs font-normal text-slate-400">[{req.group}]</span>
                                    </div>
                                    <div className="text-xs text-slate-400 truncate">
                                        โดย {req.requestedBy} · {fmtDate(req.requestedAt)} · {req.summary}
                                    </div>
                                    {req.status === 'REJECTED' && req.rejectReason && (
                                        <div className="text-xs text-red-500 mt-0.5">เหตุผล: {req.rejectReason}</div>
                                    )}
                                    {req.status !== 'PENDING' && (
                                        <div className="text-[11px] text-slate-400 mt-0.5">
                                            {req.status === 'APPROVED' ? 'อนุมัติ' : 'ปฏิเสธ'}โดย {req.decidedBy} · {fmtDate(req.decidedAt)}
                                        </div>
                                    )}
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="font-mono font-bold text-slate-700">{fmt(total)} ฿</div>
                                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${st.cls}`}>{st.label}</span>
                                </div>
                                <button onClick={() => toggle(req.id)} className="p-2 text-slate-400 hover:text-slate-600 shrink-0">
                                    {isExp ? <FaChevronUp size={12} /> : <FaChevronDown size={12} />}
                                </button>
                            </div>

                            {/* Detail */}
                            {isExp && (
                                <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="text-slate-400 text-left">
                                                <th className="py-1">รายการ</th>
                                                {req.type === 'PO' ? (
                                                    <>
                                                        <th className="py-1 text-center">จำนวน</th>
                                                        <th className="py-1 text-right">วัสดุ</th>
                                                        <th className="py-1 text-right">ค่าแรง</th>
                                                        <th className="py-1 text-right">รวม</th>
                                                    </>
                                                ) : (
                                                    <th className="py-1 text-right">ยอดเบิก</th>
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {items.map((i, idx) => (
                                                <tr key={idx} className="text-slate-600">
                                                    <td className="py-1.5">
                                                        {i.name}
                                                        {i.isNew && <span className="ml-1 text-[9px] text-green-600 font-bold">ใหม่</span>}
                                                    </td>
                                                    {req.type === 'PO' ? (
                                                        <>
                                                            <td className="py-1.5 text-center font-mono">{i.q} {i.unit}</td>
                                                            <td className="py-1.5 text-right font-mono">{fmt(i.mTotal)}</td>
                                                            <td className="py-1.5 text-right font-mono">{fmt(i.lTotal)}</td>
                                                            <td className="py-1.5 text-right font-mono font-bold">{fmt((parseFloat(i.mTotal) || 0) + (parseFloat(i.lTotal) || 0))}</td>
                                                        </>
                                                    ) : (
                                                        <td className="py-1.5 text-right font-mono font-bold">{fmt(i.amount)}</td>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {req.type === 'PO' && (
                                        <div className="text-xs text-slate-500 mt-2">ผู้รับจ้าง: <b>{req.payload?.contractor}</b> · วันที่: {req.payload?.date}</div>
                                    )}
                                    {req.type === 'DV' && (
                                        <div className="text-xs text-slate-500 mt-2">จ่ายให้: <b>{req.payload?.payee}</b></div>
                                    )}
                                </div>
                            )}

                            {/* Action buttons — ADMIN/DEV เท่านั้น */}
                            {isApprover && req.status === 'PENDING' && (
                                <div className="border-t border-slate-100 px-4 py-2.5 flex justify-end gap-2 bg-white">
                                    <button onClick={() => handleReject(req)} disabled={busy === req.id}
                                        className="px-4 py-1.5 rounded-lg text-xs font-bold text-red-600 border border-red-200 hover:bg-red-50 transition flex items-center gap-1.5 disabled:opacity-50">
                                        <FaTimes size={10} /> ปฏิเสธ
                                    </button>
                                    <button onClick={() => handleApprove(req)} disabled={busy === req.id}
                                        className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-green-600 hover:bg-green-700 transition flex items-center gap-1.5 shadow-sm disabled:opacity-50">
                                        <FaCheck size={10} /> {busy === req.id ? 'กำลังบันทึก...' : 'อนุมัติ'}
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default Approvals;
