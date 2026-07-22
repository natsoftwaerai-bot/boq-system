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
// รองรับ 2 แบบ: data (ใบเดียว) หรือ dataList (หลายใบ — พิมพ์รวดเดียว ขึ้นหน้าใหม่ต่อใบ)
const PrintModal = ({ isOpen, onClose, data, dataList }) => {
    const { currentProjectData, createBackup } = useProject();

    // รวมเป็น array เสมอ
    const docs = (dataList && dataList.length) ? dataList : (data ? [data] : []);
    if (!isOpen || docs.length === 0) return null;

    const isBatch = docs.length > 1;
    const firstCfg = TYPE_CONFIG[docs[0].type] || TYPE_CONFIG.PO;

    const handlePrint = () => {
        if (isBatch) {
            createBackup(`[พิมพ์รวม ${docs.length} ใบ] ${firstCfg.label}`);
        } else {
            const d = docs[0];
            createBackup(`[${TYPE_CONFIG[d.type]?.label || d.type}] ${d.no || ''}`);
        }
        window.print();
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4 print:p-0 print:bg-white print:block">

            <style>{`
                @media print {
                    @page { size: A4 portrait; margin: 15mm 18mm; }
                    body * { visibility: hidden !important; }
                    #print-root, #print-root * { visibility: visible !important; }
                    #print-root {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100% !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    .doc-sheet {
                        box-shadow: none !important;
                        border-radius: 0 !important;
                        width: 100% !important;
                        min-height: 0 !important;
                        break-after: page;
                        page-break-after: always;
                    }
                    .doc-sheet:last-child { break-after: auto; page-break-after: auto; }
                    .no-print { display: none !important; }
                    .print-accent { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
            `}</style>

            {/* ── Outer shell ── */}
            <div className="bg-white w-full max-w-3xl h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">

                {/* Top bar (screen only) */}
                <div className="no-print shrink-0 flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
                    <span className="font-bold text-slate-600 text-sm">
                        {isBatch
                            ? `ตัวอย่างก่อนพิมพ์ — ${firstCfg.label} ${docs.length} ใบ`
                            : `ตัวอย่างก่อนพิมพ์ — ${firstCfg.label} (${docs[0].no})`}
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={handlePrint}
                            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-4 py-2 rounded-lg shadow transition"
                        >
                            <FaPrint /> พิมพ์{isBatch ? `ทั้งหมด (${docs.length})` : ''}
                        </button>
                        <button onClick={onClose} className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg transition">
                            <FaTimes size={18} />
                        </button>
                    </div>
                </div>

                {/* Scrollable preview */}
                <div className="flex-1 overflow-auto bg-slate-100 flex flex-col items-center gap-8 py-8 print:p-0 print:bg-white print:block print:gap-0">
                    <div id="print-root" className="flex flex-col items-center gap-8 print:gap-0 print:block w-full">
                        {docs.map((doc, idx) => (
                            <DocSheet key={doc.id || idx} doc={doc} project={currentProjectData} />
                        ))}
                    </div>
                </div>
            </div>{/* /outer shell */}
        </div>
    );
};

// ─── A4 เอกสารต่อ 1 ใบ ────────────────────────────────────────────────────────
const DocSheet = ({ doc, project }) => {
    const cfg = TYPE_CONFIG[doc.type] || TYPE_CONFIG.PO;

    // enrich DV items
    const processedData = useMemo(() => {
        if (doc.type !== 'DV') return doc;
        const enrichedItems = (doc.items || []).map(item => {
            const boqItem = (project.boq || []).find(b => b.id === item.id);
            const totalBudget = boqItem ? (parseFloat(boqItem.q || 0) * parseFloat(boqItem.lP || 0)) : 0;
            const previousDocs = (project.docs || []).filter(d =>
                d.type === 'DV' &&
                (new Date(d.date) < new Date(doc.date) || (d.date === doc.date && d.id < doc.id))
            );
            let prevPaid = 0;
            previousDocs.forEach(d => {
                const si = d.items.find(i => i.id === item.id);
                if (si) prevPaid += (parseFloat(si.amount) || 0);
            });
            const currentAmount = parseFloat(item.amount) || 0;
            return { ...item, totalBudget, prevPaid, currentAmount, remaining: totalBudget - prevPaid - currentAmount };
        });
        return { ...doc, items: enrichedItems };
    }, [doc, project]);

    const grandTotal = useMemo(() => {
        if (!processedData.items) return 0;
        if (doc.type === 'DV')
            return processedData.items.reduce((s, i) => s + (i.currentAmount || 0), 0);
        if (doc.type === 'PO' && doc.items?.[0]?.mPrice !== undefined)
            return processedData.items.reduce((s, i) => s + (i.mTotal || 0) + (i.lTotal || 0), 0);
        return processedData.items.reduce((s, i) => s + (i.total || (i.q * i.price) || 0), 0);
    }, [processedData, doc]);

    const isPONew = doc.type === 'PO' && doc.items?.[0]?.mPrice !== undefined;
    const dateStr = doc.date ? new Date(doc.date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : '-';

    return (
        <div
            className="doc-sheet bg-white w-[210mm] min-h-[297mm] shadow-xl print:shadow-none"
            style={{ fontFamily: "'Sarabun', sans-serif" }}
        >
            {/* Accent bar */}
            <div className="print-accent h-1.5 w-full rounded-t" style={{ background: cfg.accent }} />

            <div className="px-12 py-10">
                {/* Header */}
                <div className="flex justify-between items-start mb-10">
                    <div>
                        <div className="text-2xl font-black text-slate-800 tracking-tight leading-none mb-1">PMS 888</div>
                        <div className="text-xs text-slate-400 leading-relaxed">--888--<br />โทร: 083-3943348</div>
                    </div>
                    <div className="text-right">
                        <div className="print-accent inline-block text-white text-xs font-bold px-3 py-1 rounded-full mb-2" style={{ background: cfg.accent }}>
                            {cfg.en}
                        </div>
                        <div className="text-xl font-bold text-slate-800 mb-2">{cfg.label}</div>
                        <div className="text-xs text-slate-500 space-y-0.5">
                            <div className="flex items-center justify-end gap-2">
                                <span className="text-slate-400">เลขที่</span>
                                <span className="font-black text-base" style={{ color: cfg.accent }}>{doc.no}</span>
                            </div>
                            <div className="flex items-center justify-end gap-2">
                                <span className="text-slate-400">วันที่</span>
                                <span className="font-semibold text-slate-700">{dateStr}</span>
                            </div>
                            {doc.ref && (
                                <div className="flex items-center justify-end gap-2">
                                    <span className="text-slate-400">อ้างอิง</span>
                                    <span className="font-semibold text-slate-700">{doc.ref}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Info strip */}
                <div className="print-accent grid grid-cols-2 gap-6 rounded-xl p-5 mb-8 text-sm" style={{ background: cfg.light }}>
                    <div>
                        <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">โครงการ</div>
                        <div className="font-bold text-slate-800 text-base leading-snug">{project.projectName || '—'}</div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">{cfg.party}</div>
                        <div className="font-bold text-slate-800 text-base leading-snug">{doc.contractor || doc.payee || '—'}</div>
                    </div>
                </div>

                {/* Table */}
                <table className="w-full text-xs mb-8" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                        {isPONew ? (
                            <tr style={{ borderBottom: `2px solid ${cfg.accent}` }}>
                                <Th w="28px" center>#</Th><Th left>รายการ</Th><Th w="44px" center>จำนวน</Th>
                                <Th w="36px" center>หน่วย</Th><Th w="64px" right>ค่าของ/หน่วย</Th><Th w="72px" right>รวมค่าของ</Th>
                                <Th w="64px" right>ค่าแรง/หน่วย</Th><Th w="72px" right>รวมค่าแรง</Th><Th w="80px" right>รวมทั้งสิ้น</Th>
                            </tr>
                        ) : doc.type === 'DV' ? (
                            <tr style={{ borderBottom: `2px solid ${cfg.accent}` }}>
                                <Th w="28px" center>#</Th><Th left>รายการงาน</Th><Th w="80px" right>งบรวม</Th>
                                <Th w="80px" right>สะสมก่อนหน้า</Th><Th w="80px" right>เบิกครั้งนี้</Th><Th w="80px" right>คงเหลือ</Th>
                            </tr>
                        ) : doc.type === 'PU' ? (
                            <tr style={{ borderBottom: `2px solid ${cfg.accent}` }}>
                                <Th w="28px" center>#</Th><Th left>รายการสินค้า</Th><Th w="54px" right>จำนวน</Th>
                                <Th w="40px" center>หน่วย</Th><Th w="72px" right>ราคา/หน่วย</Th><Th w="80px" right>รวมเงิน</Th>
                            </tr>
                        ) : (
                            <tr style={{ borderBottom: `2px solid ${cfg.accent}` }}>
                                <Th w="28px" center>#</Th><Th left>รายการ</Th><Th w="60px" right>จำนวน</Th><Th w="44px" center>หน่วย</Th>
                            </tr>
                        )}
                    </thead>
                    <tbody>
                        {processedData.items.map((item, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }} className="hover:bg-slate-50">
                                <Td center gray>{i + 1}</Td>
                                {isPONew ? (
                                    <>
                                        <Td><div className="font-semibold text-slate-800">{item.name}</div><div className="text-[10px] text-slate-400">{item.code}</div></Td>
                                        <Td right mono>{fmtQty(item.q)}</Td><Td center gray>{item.unit}</Td>
                                        <Td right mono>{fmt(item.mPrice)}</Td><Td right mono bold>{fmt(item.mTotal)}</Td>
                                        <Td right mono>{fmt(item.lPrice)}</Td><Td right mono bold>{fmt(item.lTotal)}</Td>
                                        <Td right mono bold dark>{fmt((item.mTotal || 0) + (item.lTotal || 0))}</Td>
                                    </>
                                ) : doc.type === 'DV' ? (
                                    <>
                                        <Td><div className="font-semibold text-slate-800">{item.name}</div><div className="text-[10px] text-slate-400">{item.code}</div></Td>
                                        <Td right mono gray>{fmt(item.totalBudget)}</Td><Td right mono>{fmt(item.prevPaid)}</Td>
                                        <Td right mono bold dark>{fmt(item.currentAmount)}</Td>
                                        <Td right mono style={{ color: item.remaining < 0 ? '#ef4444' : '#16a34a' }}>{fmt(item.remaining)}</Td>
                                    </>
                                ) : doc.type === 'PU' ? (
                                    <>
                                        <Td><div className="font-semibold text-slate-800">{item.name}</div><div className="text-[10px] text-slate-400">{item.code}</div></Td>
                                        <Td right mono>{fmtQty(item.q)}</Td><Td center gray>{item.unit}</Td>
                                        <Td right mono>{fmt(item.mPrice || item.price)}</Td>
                                        <Td right mono bold dark>{fmt(item.mTotal || item.total || (item.q * item.price))}</Td>
                                    </>
                                ) : (
                                    <>
                                        <Td><div className="font-semibold text-slate-800">{item.name}</div><div className="text-[10px] text-slate-400">{item.code}</div></Td>
                                        <Td right mono>{fmtQty(item.q)}</Td><Td center gray>{item.unit}</Td>
                                    </>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Total box */}
                <div className="flex justify-end mb-12">
                    <div className="print-accent rounded-xl px-8 py-4 text-right min-w-[220px]" style={{ background: cfg.light }}>
                        <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">
                            {doc.type === 'PO' && !isPONew ? 'จำนวนรายการทั้งหมด' : 'รวมสุทธิ (Grand Total)'}
                        </div>
                        <div className="text-2xl font-black" style={{ color: cfg.accent }}>
                            {doc.type === 'PO' && !isPONew ? `${processedData.items.length} รายการ` : `${fmt(grandTotal)} บาท`}
                        </div>
                    </div>
                </div>

                {/* Note + Signatures */}
                <div className="grid grid-cols-2 gap-10 pt-6" style={{ borderTop: '1px solid #e2e8f0' }}>
                    <div>
                        <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">หมายเหตุ</div>
                        <div className="text-xs text-slate-500 leading-relaxed">
                            — เอกสารนี้ได้รับการอนุมัติในระบบเรียบร้อยแล้ว<br />
                            — กรุณาตรวจสอบความถูกต้องภายใน 7 วัน
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-center text-xs">
                        <SigBox label={doc.type === 'PO' ? 'ผู้สั่งจ้าง' : doc.type === 'PU' ? 'ผู้รับสินค้า' : 'ผู้รับเงิน'} />
                        <SigBox label="ผู้อนุมัติ" />
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── Mini components ──────────────────────────────────────────────────────────
const Th = ({ children, w, left, right, center }) => (
    <th style={{
        width: w, padding: '8px 6px',
        textAlign: center ? 'center' : right ? 'right' : 'left',
        fontSize: '10px', fontWeight: 700, color: '#64748b',
        textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
    }}>{children}</th>
);

const Td = ({ children, center, right, mono, bold, dark, gray, style: s }) => (
    <td style={{
        padding: '9px 6px',
        textAlign: center ? 'center' : right ? 'right' : 'left',
        fontFamily: mono ? "'Roboto Mono', monospace" : undefined,
        fontWeight: bold ? 700 : 400,
        color: dark ? '#1e293b' : gray ? '#94a3b8' : '#475569',
        fontSize: '12px', verticalAlign: 'middle', ...s,
    }}>{children}</td>
);

const SigBox = ({ label }) => (
    <div className="flex flex-col items-center">
        <div style={{ borderBottom: '1px dashed #cbd5e1', width: '100%', height: '36px', marginBottom: '6px' }} />
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>{label}</div>
        <div style={{ fontSize: '10px', color: '#94a3b8' }}>วันที่ ........./........./.........</div>
    </div>
);

export default PrintModal;
