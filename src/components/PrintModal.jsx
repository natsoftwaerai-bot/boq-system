import React, { useMemo } from 'react';
import { FaPrint, FaTimes } from 'react-icons/fa';
import { useProject } from '../context/ProjectContext';

// ─── helpers ────────────────────────────────────────────────────────────────
const fmt = (n) => (parseFloat(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n) => (parseFloat(n) || 0).toLocaleString('th-TH');

// accent & label per type
const TYPE_CONFIG = {
    PO: { accent: '#f97316', light: '#fff7ed', label: 'ใบสั่งจ้าง',         en: 'PURCHASE ORDER',          party: 'ผู้รับจ้าง / ร้านค้า' },
    PU: { accent: '#2563eb', light: '#eff6ff', label: 'ใบบันทึกจัดซื้อ',    en: 'GOODS RECEIPT VOUCHER',   party: 'รับจาก' },
    DV: { accent: '#7c3aed', light: '#f5f3ff', label: 'ใบเบิกค่าแรง',       en: 'LABOR PAYMENT VOUCHER',   party: 'จ่ายให้' },
};

// ────────────────────────────────────────────────────────────────────────────

const PrintModal = ({ isOpen, onClose, data }) => {
    const { currentProjectData, createBackup } = useProject();
    if (!isOpen || !data) return null;

    const handlePrint = () => {
        createBackup(`[${TYPE_CONFIG[data.type]?.label || data.type}] ${data.no || ''}`);
        window.print();
    };

    const cfg = TYPE_CONFIG[data.type] || TYPE_CONFIG.PO;

    // ── Logic: enrich DV items ──────────────────────────────────────────────
    const processedData = useMemo(() => {
        if (data.type !== 'DV') return data;
        const enrichedItems = data.items.map(item => {
            const boqItem = (currentProjectData.boq || []).find(b => b.id === item.id);
            const totalBudget = boqItem ? (parseFloat(boqItem.q || 0) * parseFloat(boqItem.lP || 0)) : 0;
            const previousDocs = (currentProjectData.docs || []).filter(d =>
                d.type === 'DV' &&
                (new Date(d.date) < new Date(data.date) || (d.date === data.date && d.id < data.id))
            );
            let prevPaid = 0;
            previousDocs.forEach(d => {
                const si = d.items.find(i => i.id === item.id);
                if (si) prevPaid += (parseFloat(si.amount) || 0);
            });
            const currentAmount = parseFloat(item.amount) || 0;
            return { ...item, totalBudget, prevPaid, currentAmount, remaining: totalBudget - prevPaid - currentAmount };
        });
        return { ...data, items: enrichedItems };
    }, [data, currentProjectData]);

    // ── Grand Total ─────────────────────────────────────────────────────────
    const grandTotal = useMemo(() => {
        if (!processedData.items) return 0;
        if (data.type === 'DV')
            return processedData.items.reduce((s, i) => s + (i.currentAmount || 0), 0);
        if (data.type === 'PO' && data.items?.[0]?.mPrice !== undefined)
            return processedData.items.reduce((s, i) => s + (i.mTotal || 0) + (i.lTotal || 0), 0);
        return processedData.items.reduce((s, i) => s + (i.total || (i.q * i.price) || 0), 0);
    }, [processedData, data]);

    const isPONew = data.type === 'PO' && data.items?.[0]?.mPrice !== undefined;
    const dateStr = data.date ? new Date(data.date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : '-';

    return (
        <div className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4 print:p-0 print:bg-white print:block">

            <style>{`
                @media print {
                    @page { size: A4 portrait; margin: 15mm 18mm; }
                    body * { visibility: hidden !important; }
                    #print-area, #print-area * { visibility: visible !important; }
                    #print-area {
                        position: fixed !important;
                        inset: 0 !important;
                        width: 100% !important;
                        height: auto !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        box-shadow: none !important;
                        border-radius: 0 !important;
                        overflow: visible !important;
                    }
                    .no-print { display: none !important; }
                    .print-accent { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
            `}</style>

            {/* ── Outer shell ── */}
            <div className="bg-white w-full max-w-3xl h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">

                {/* Top bar (screen only) */}
                <div className="no-print shrink-0 flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
                    <span className="font-bold text-slate-600 text-sm">ตัวอย่างก่อนพิมพ์ — {cfg.label} ({data.no})</span>
                    <div className="flex gap-2">
                        <button
                            onClick={handlePrint}
                            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-4 py-2 rounded-lg shadow transition"
                        >
                            <FaPrint /> พิมพ์
                        </button>
                        <button onClick={onClose} className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg transition">
                            <FaTimes size={18} />
                        </button>
                    </div>
                </div>

                {/* Scrollable preview */}
                <div className="flex-1 overflow-auto bg-slate-100 flex justify-center py-8 print:p-0 print:bg-white print:block">
                    <div
                        id="print-area"
                        className="bg-white w-[210mm] min-h-[297mm] shadow-xl print:shadow-none print:w-full print:min-h-0"
                        style={{ fontFamily: "'Sarabun', sans-serif" }}
                    >
                        {/* ── Accent bar ── */}
                        <div
                            className="print-accent h-1.5 w-full rounded-t"
                            style={{ background: cfg.accent }}
                        />

                        <div className="px-12 py-10">

                            {/* ── 1. Header ── */}
                            <div className="flex justify-between items-start mb-10">
                                {/* Left: company */}
                                <div>
                                    <div className="text-2xl font-black text-slate-800 tracking-tight leading-none mb-1">PMS 888</div>
                                    <div className="text-xs text-slate-400 leading-relaxed">
                                        --888--<br />
                                        โทร: 083-3943348
                                    </div>
                                </div>

                                {/* Right: doc info */}
                                <div className="text-right">
                                    <div
                                        className="print-accent inline-block text-white text-xs font-bold px-3 py-1 rounded-full mb-2"
                                        style={{ background: cfg.accent }}
                                    >
                                        {cfg.en}
                                    </div>
                                    <div className="text-xl font-bold text-slate-800 mb-2">{cfg.label}</div>
                                    <div className="text-xs text-slate-500 space-y-0.5">
                                        <div className="flex items-center justify-end gap-2">
                                            <span className="text-slate-400">เลขที่</span>
                                            <span
                                                className="font-black text-base"
                                                style={{ color: cfg.accent }}
                                            >
                                                {data.no}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-end gap-2">
                                            <span className="text-slate-400">วันที่</span>
                                            <span className="font-semibold text-slate-700">{dateStr}</span>
                                        </div>
                                        {data.ref && (
                                            <div className="flex items-center justify-end gap-2">
                                                <span className="text-slate-400">อ้างอิง</span>
                                                <span className="font-semibold text-slate-700">{data.ref}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* ── 2. Info strip ── */}
                            <div
                                className="print-accent grid grid-cols-2 gap-6 rounded-xl p-5 mb-8 text-sm"
                                style={{ background: cfg.light }}
                            >
                                <div>
                                    <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">โครงการ</div>
                                    <div className="font-bold text-slate-800 text-base leading-snug">
                                        {currentProjectData.projectName || '—'}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">{cfg.party}</div>
                                    <div className="font-bold text-slate-800 text-base leading-snug">
                                        {data.contractor || data.payee || '—'}
                                    </div>
                                </div>
                            </div>

                            {/* ── 3. Table ── */}
                            <table className="w-full text-xs mb-8" style={{ borderCollapse: 'collapse' }}>
                                <thead>
                                    {/* PO (new style with prices) */}
                                    {isPONew ? (
                                        <tr style={{ borderBottom: `2px solid ${cfg.accent}` }}>
                                            <Th w="28px" center>#</Th>
                                            <Th left>รายการ</Th>
                                            <Th w="44px" center>จำนวน</Th>
                                            <Th w="36px" center>หน่วย</Th>
                                            <Th w="64px" right>ค่าของ/หน่วย</Th>
                                            <Th w="72px" right>รวมค่าของ</Th>
                                            <Th w="64px" right>ค่าแรง/หน่วย</Th>
                                            <Th w="72px" right>รวมค่าแรง</Th>
                                            <Th w="80px" right>รวมทั้งสิ้น</Th>
                                        </tr>
                                    ) : data.type === 'DV' ? (
                                        <tr style={{ borderBottom: `2px solid ${cfg.accent}` }}>
                                            <Th w="28px" center>#</Th>
                                            <Th left>รายการงาน</Th>
                                            <Th w="80px" right>งบรวม</Th>
                                            <Th w="80px" right>สะสมก่อนหน้า</Th>
                                            <Th w="80px" right>เบิกครั้งนี้</Th>
                                            <Th w="80px" right>คงเหลือ</Th>
                                        </tr>
                                    ) : data.type === 'PU' ? (
                                        <tr style={{ borderBottom: `2px solid ${cfg.accent}` }}>
                                            <Th w="28px" center>#</Th>
                                            <Th left>รายการสินค้า</Th>
                                            <Th w="54px" right>จำนวน</Th>
                                            <Th w="40px" center>หน่วย</Th>
                                            <Th w="72px" right>ราคา/หน่วย</Th>
                                            <Th w="80px" right>รวมเงิน</Th>
                                        </tr>
                                    ) : (
                                        // PO old style (qty only)
                                        <tr style={{ borderBottom: `2px solid ${cfg.accent}` }}>
                                            <Th w="28px" center>#</Th>
                                            <Th left>รายการ</Th>
                                            <Th w="60px" right>จำนวน</Th>
                                            <Th w="44px" center>หน่วย</Th>
                                        </tr>
                                    )}
                                </thead>

                                <tbody>
                                    {processedData.items.map((item, i) => (
                                        <tr
                                            key={i}
                                            style={{ borderBottom: '1px solid #f1f5f9' }}
                                            className="hover:bg-slate-50"
                                        >
                                            <Td center gray>{i + 1}</Td>

                                            {isPONew ? (
                                                <>
                                                    <Td>
                                                        <div className="font-semibold text-slate-800">{item.name}</div>
                                                        <div className="text-[10px] text-slate-400">{item.code}</div>
                                                    </Td>
                                                    <Td right mono>{fmtQty(item.q)}</Td>
                                                    <Td center gray>{item.unit}</Td>
                                                    <Td right mono>{fmt(item.mPrice)}</Td>
                                                    <Td right mono bold>{fmt(item.mTotal)}</Td>
                                                    <Td right mono>{fmt(item.lPrice)}</Td>
                                                    <Td right mono bold>{fmt(item.lTotal)}</Td>
                                                    <Td right mono bold dark>{fmt((item.mTotal || 0) + (item.lTotal || 0))}</Td>
                                                </>
                                            ) : data.type === 'DV' ? (
                                                <>
                                                    <Td>
                                                        <div className="font-semibold text-slate-800">{item.name}</div>
                                                        <div className="text-[10px] text-slate-400">{item.code}</div>
                                                    </Td>
                                                    <Td right mono gray>{fmt(item.totalBudget)}</Td>
                                                    <Td right mono>{fmt(item.prevPaid)}</Td>
                                                    <Td right mono bold dark>{fmt(item.currentAmount)}</Td>
                                                    <Td right mono style={{ color: item.remaining < 0 ? '#ef4444' : '#16a34a' }}>
                                                        {fmt(item.remaining)}
                                                    </Td>
                                                </>
                                            ) : data.type === 'PU' ? (
                                                <>
                                                    <Td>
                                                        <div className="font-semibold text-slate-800">{item.name}</div>
                                                        <div className="text-[10px] text-slate-400">{item.code}</div>
                                                    </Td>
                                                    <Td right mono>{fmtQty(item.q)}</Td>
                                                    <Td center gray>{item.unit}</Td>
                                                    <Td right mono>{fmt(item.mPrice || item.price)}</Td>
                                                    <Td right mono bold dark>{fmt(item.mTotal || item.total || (item.q * item.price))}</Td>
                                                </>
                                            ) : (
                                                // PO old
                                                <>
                                                    <Td>
                                                        <div className="font-semibold text-slate-800">{item.name}</div>
                                                        <div className="text-[10px] text-slate-400">{item.code}</div>
                                                    </Td>
                                                    <Td right mono>{fmtQty(item.q)}</Td>
                                                    <Td center gray>{item.unit}</Td>
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* ── 4. Total box ── */}
                            <div className="flex justify-end mb-12">
                                <div
                                    className="print-accent rounded-xl px-8 py-4 text-right min-w-[220px]"
                                    style={{ background: cfg.light }}
                                >
                                    <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">
                                        {data.type === 'PO' && !isPONew ? 'จำนวนรายการทั้งหมด' : 'รวมสุทธิ (Grand Total)'}
                                    </div>
                                    <div
                                        className="text-2xl font-black"
                                        style={{ color: cfg.accent }}
                                    >
                                        {data.type === 'PO' && !isPONew
                                            ? `${processedData.items.length} รายการ`
                                            : `${fmt(grandTotal)} บาท`
                                        }
                                    </div>
                                </div>
                            </div>

                            {/* ── 5. Note + Signatures ── */}
                            <div
                                className="grid grid-cols-2 gap-10 pt-6"
                                style={{ borderTop: '1px solid #e2e8f0' }}
                            >
                                <div>
                                    <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">หมายเหตุ</div>
                                    <div className="text-xs text-slate-500 leading-relaxed">
                                        — เอกสารนี้ได้รับการอนุมัติในระบบเรียบร้อยแล้ว<br />
                                        — กรุณาตรวจสอบความถูกต้องภายใน 7 วัน
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 text-center text-xs">
                                    <SigBox label={data.type === 'PO' ? 'ผู้สั่งจ้าง' : data.type === 'PU' ? 'ผู้รับสินค้า' : 'ผู้รับเงิน'} />
                                    <SigBox label="ผู้อนุมัติ" />
                                </div>
                            </div>

                        </div>{/* /px-12 */}
                    </div>{/* /print-area */}
                </div>{/* /scrollable */}
            </div>{/* /outer shell */}
        </div>
    );
};

// ─── Mini components ──────────────────────────────────────────────────────────

const Th = ({ children, w, left, right, center }) => (
    <th style={{
        width: w,
        padding: '8px 6px',
        textAlign: center ? 'center' : right ? 'right' : 'left',
        fontSize: '10px',
        fontWeight: 700,
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        whiteSpace: 'nowrap',
    }}>
        {children}
    </th>
);

const Td = ({ children, center, right, mono, bold, dark, gray, style: s }) => (
    <td style={{
        padding: '9px 6px',
        textAlign: center ? 'center' : right ? 'right' : 'left',
        fontFamily: mono ? "'Roboto Mono', monospace" : undefined,
        fontWeight: bold ? 700 : 400,
        color: dark ? '#1e293b' : gray ? '#94a3b8' : '#475569',
        fontSize: '12px',
        verticalAlign: 'middle',
        ...s,
    }}>
        {children}
    </td>
);

const SigBox = ({ label }) => (
    <div className="flex flex-col items-center">
        <div style={{ borderBottom: '1px dashed #cbd5e1', width: '100%', height: '36px', marginBottom: '6px' }} />
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>{label}</div>
        <div style={{ fontSize: '10px', color: '#94a3b8' }}>วันที่ ........./........./.........</div>
    </div>
);

export default PrintModal;
