import React, { useState, useMemo, useEffect } from 'react';
import { useProject, getGroupOf } from '../context/ProjectContext';
import {
    Chart as ChartJS, CategoryScale, LinearScale,
    BarElement, Tooltip, Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { materialBudget, laborBudget } from '../utils/boqMath';
import {
    FaCheckSquare, FaRegSquare, FaChevronDown, FaChevronUp,
    FaBoxOpen, FaFileInvoiceDollar, FaHardHat, FaCheckCircle,
    FaChevronRight, FaCalendarAlt, FaShoppingCart,
} from 'react-icons/fa';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

// ─── helpers ────────────────────────────────────────────────────────────────
const fmt  = (n) => (n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtM = (n) => {
    const abs = Math.abs(n || 0);
    if (abs >= 1_000_000) return `${((n || 0) / 1_000_000).toFixed(2)} M`;
    if (abs >= 1_000)     return `${((n || 0) / 1_000).toFixed(1)} K`;
    return (n || 0).toLocaleString();
};

const PROJECT_COLORS = [
    '#3b82f6','#10b981','#f59e0b','#ef4444',
    '#8b5cf6','#06b6d4','#ec4899','#84cc16',
];

// สีตาม %
const pctColor = (pct, over) => {
    if (over)    return '#ef4444';
    if (pct >= 80) return '#10b981';
    if (pct >= 50) return '#f59e0b';
    return '#3b82f6';
};

const getStats = (projectData = {}) => {
    let mBudget = 0, mPaid = 0, lBudget = 0, lPaid = 0;
    (projectData.boq || []).forEach(item => {
        if (item.type === 'item') {
            mBudget += materialBudget(item);
            lBudget += laborBudget(item);
        }
    });
    (projectData.trans || []).forEach(t => {
        if (t.type === 'PU')                         mPaid += parseFloat(t.a) || 0;
        if (t.type === 'DV' || t.type === 'EXPENSE') lPaid += parseFloat(t.a) || 0;
    });
    const docs        = projectData.docs || [];
    const totalBudget = mBudget + lBudget;
    const totalPaid   = mPaid + lPaid;
    const balance     = totalBudget - totalPaid;
    const percent     = totalBudget > 0 ? Math.min(100, (totalPaid / totalBudget) * 100) : 0;
    const mPercent    = mBudget > 0 ? Math.min(100, (mPaid / mBudget) * 100) : 0;
    const lPercent    = lBudget > 0 ? Math.min(100, (lPaid / lBudget) * 100) : 0;
    return {
        mBudget, mPaid, mBalance: mBudget - mPaid, mPercent,
        lBudget, lPaid, lBalance: lBudget - lPaid, lPercent,
        totalBudget, totalPaid, balance, percent,
        boqItems:  (projectData.boq || []).filter(i => i.type === 'item').length,
        poPending: docs.filter(d => d.type === 'PO' && d.status === 'WAITING').length,
        poDone:    docs.filter(d => d.type === 'PO' && d.status === 'DONE').length,
        puCount:   docs.filter(d => d.type === 'PU').length,
        dvCount:   docs.filter(d => d.type === 'DV').length,
    };
};

// ─── SVG circular progress ──────────────────────────────────────────────────
const CircleProgress = ({ percent, color, size = 120 }) => {
    const r   = 42;
    const circ = 2 * Math.PI * r;
    const off  = circ - (Math.min(100, percent) / 100) * circ;
    return (
        <svg width={size} height={size} viewBox="0 0 100 100">
            <circle cx="50" cy="50" r={r} fill="none" stroke="#f1f5f9" strokeWidth="9" />
            <circle
                cx="50" cy="50" r={r} fill="none"
                stroke={color} strokeWidth="9"
                strokeDasharray={circ} strokeDashoffset={off}
                strokeLinecap="round"
                transform="rotate(-90 50 50)"
                style={{ transition: 'stroke-dashoffset 0.8s ease' }}
            />
            <text x="50" y="47" textAnchor="middle" fontSize="17" fontWeight="800" fill="#1e293b" fontFamily="Prompt">
                {percent.toFixed(1)}
            </text>
            <text x="50" y="60" textAnchor="middle" fontSize="9" fill="#94a3b8" fontFamily="Prompt">%</text>
        </svg>
    );
};

// ──────────────────────────────────────────────────────────────────────────────
const Dashboard = () => {
    const { system, user, can, activeGroup } = useProject();
    const [checked,        setChecked]        = useState(new Set());
    const [expanded,       setExpanded]       = useState(new Set());
    const [expandedDvMon,  setExpandedDvMon]  = useState(new Set());
    const [expandedPuMon,  setExpandedPuMon]  = useState(new Set());
    const [selectedGraphProject, setSelectedGraphProject] = useState(null);

    const isAdmin = user?.role === 'ADMIN' || user?.role === 'DEV';
    const showMonthlySummary = can ? can('monthlySummary') : isAdmin;

    // แสดงเฉพาะแปลงบ้านในโครงการที่เลือกจาก Sidebar
    const projects = useMemo(
        () => (system.projects || []).filter(p => getGroupOf(p) === activeGroup),
        [system.projects, activeGroup]
    );

    // Reset การเลือกเมื่อสลับโครงการ (index ของแปลงเปลี่ยนชุด)
    useEffect(() => {
        setChecked(new Set());
        setExpanded(new Set());
        setSelectedGraphProject(null);
    }, [activeGroup]);

    const allStats = useMemo(() =>
        projects.map((p, i) => ({
            index: i, name: p.name,
            projColor: PROJECT_COLORS[i % PROJECT_COLORS.length],
            ...getStats(p.data),
        }))
    , [projects]);

    const graphSource    = useMemo(() =>
        selectedGraphProject === null ? allStats : allStats.filter(s => s.index === selectedGraphProject)
    , [selectedGraphProject, allStats]);
    const graphStat      = graphSource.length === 1 ? graphSource[0] : null;
    const graphAvgPct    = graphSource.length > 0 ? graphSource.reduce((a, s) => a + s.percent, 0) / graphSource.length : 0;
    const graphSumBudget = graphSource.reduce((a, s) => a + s.totalBudget, 0);
    const graphSumPaid   = graphSource.reduce((a, s) => a + s.totalPaid, 0);
    const graphOverCount = graphSource.filter(s => s.balance < 0).length;

    const toggle = (set, setter, i) => setter(prev => {
        const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s;
    });

    // สรุปยอดซื้อของรายเดือน รวมทุกโครงการ (ADMIN/DEV only)
    const { monthlyPuGroups, puGrandTotal } = useMemo(() => {
        const groups = {};
        let puGrandTotal = 0;
        projects.forEach(p => {
            (p.data?.docs || []).filter(d => d.type === 'PU').forEach(doc => {
                const d = new Date(doc.date);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                const label = d.toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });
                if (!groups[key]) groups[key] = { key, label, entries: [], total: 0 };
                const amount = doc.items.reduce((s, i) => s + (parseFloat(i.total) || (parseFloat(i.mTotal) || 0) + (parseFloat(i.lTotal) || 0)), 0);
                groups[key].entries.push({ projectName: p.name, ...doc, _total: amount });
                groups[key].total += amount;
                puGrandTotal += amount;
            });
        });
        const sorted = Object.values(groups).sort((a, b) => b.key.localeCompare(a.key));
        return { monthlyPuGroups: sorted, puGrandTotal };
    }, [projects]);

    // สรุปยอดค่าแรงรายเดือน รวมทุกโครงการ (ADMIN/DEV only)
    const { monthlyDvGroups, dvGrandTotal } = useMemo(() => {
        const groups = {};
        let dvGrandTotal = 0;
        projects.forEach(p => {
            (p.data?.docs || []).filter(d => d.type === 'DV').forEach(doc => {
                const d = new Date(doc.date);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                const label = d.toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });
                if (!groups[key]) groups[key] = { key, label, entries: [], total: 0 };
                const amount = doc.items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
                groups[key].entries.push({ projectName: p.name, ...doc, _total: amount });
                groups[key].total += amount;
                dvGrandTotal += amount;
            });
        });
        const sorted = Object.values(groups).sort((a, b) => b.key.localeCompare(a.key));
        return { monthlyDvGroups: sorted, dvGrandTotal };
    }, [projects]);

    // filter monthly summaries ตาม checked projects
    const checkedNames = useMemo(() =>
        checked.size > 0 ? new Set(allStats.filter(s => checked.has(s.index)).map(s => s.name)) : null
    , [checked, allStats]);

    const filteredPuGroups = useMemo(() => {
        if (!checkedNames) return monthlyPuGroups;
        return monthlyPuGroups
            .map(g => {
                const entries = g.entries.filter(e => checkedNames.has(e.projectName));
                return { ...g, entries, total: entries.reduce((s, e) => s + e._total, 0) };
            })
            .filter(g => g.entries.length > 0);
    }, [monthlyPuGroups, checkedNames]);

    const filteredPuTotal = filteredPuGroups.reduce((s, g) => s + g.total, 0);

    const filteredDvGroups = useMemo(() => {
        if (!checkedNames) return monthlyDvGroups;
        return monthlyDvGroups
            .map(g => {
                const entries = g.entries.filter(e => checkedNames.has(e.projectName));
                return { ...g, entries, total: entries.reduce((s, e) => s + e._total, 0) };
            })
            .filter(g => g.entries.length > 0);
    }, [monthlyDvGroups, checkedNames]);

    const filteredDvTotal = filteredDvGroups.reduce((s, g) => s + g.total, 0);

    // horizontal bar chart — % per project
    const barData = {
        labels: allStats.map(s => s.name),
        datasets: [{
            label: '% การใช้งบ',
            data:  allStats.map(s => s.percent),
            backgroundColor: allStats.map(s => pctColor(s.percent, s.balance < 0) + 'cc'),
            borderColor:     allStats.map(s => pctColor(s.percent, s.balance < 0)),
            borderWidth: 2,
            borderRadius: 6,
        }],
    };
    const barOpts = {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ` ${ctx.raw.toFixed(1)}%` } },
        },
        scales: {
            x: {
                min: 0, max: 100,
                grid: { color: '#f1f5f9' },
                ticks: { color: '#94a3b8', callback: v => `${v}%` },
            },
            y: { grid: { display: false }, ticks: { color: '#475569', font: { size: 12 } } },
        },
    };

    const singleBarData = graphStat ? {
        labels: ['วัสดุ', 'ค่าแรง'],
        datasets: [
            {
                label: 'งบประมาณ',
                data:  [graphStat.mBudget, graphStat.lBudget],
                backgroundColor: '#bfdbfe',
                borderColor: '#3b82f6',
                borderWidth: 2,
                borderRadius: 6,
            },
            {
                label: 'จ่ายจริง',
                data:  [graphStat.mPaid, graphStat.lPaid],
                backgroundColor: '#6ee7b7',
                borderColor: '#10b981',
                borderWidth: 2,
                borderRadius: 6,
            },
        ],
    } : null;
    const singleBarOpts = {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: true, position: 'top', labels: { font: { size: 11, family: 'Prompt' }, color: '#475569', boxWidth: 12 } },
            tooltip: { callbacks: { label: ctx => ` ${fmtM(ctx.raw)} บาท` } },
        },
        scales: {
            x: { grid: { color: '#f1f5f9' }, ticks: { color: '#94a3b8', callback: v => fmtM(v) } },
            y: { grid: { display: false }, ticks: { color: '#475569', font: { size: 12 } } },
        },
    };

    return (
        <div className="font-['Prompt'] max-w-6xl mx-auto space-y-6">

            {/* ─── Header ─── */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-slate-800">ภาพรวมโครงการ: {activeGroup}</h1>
                    <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                        {projects.length} แปลง · ติ๊กเพื่อกรองสรุป
                    </p>
                </div>
                <button
                    onClick={() => setChecked(checked.size === projects.length ? new Set() : new Set(projects.map((_, i) => i)))}
                    className="text-xs text-slate-500 hover:text-blue-600 font-medium flex items-center gap-1.5 transition"
                >
                    {checked.size === projects.length
                        ? <FaCheckSquare className="text-blue-500" />
                        : <FaRegSquare />}
                    {checked.size === projects.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                </button>
            </div>

            {/* ─── Graph project selector ─── */}
            <div className="bg-white border border-slate-200 rounded-2xl px-5 py-3.5 shadow-sm">
                <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex-shrink-0">
                        เลือกแปลงบ้าน
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            onClick={() => setSelectedGraphProject(null)}
                            className={`px-3 py-1 rounded-full text-xs font-bold border transition
                                ${selectedGraphProject === null
                                    ? 'bg-slate-800 text-white border-slate-800 shadow-sm'
                                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400 hover:text-slate-700'}`}
                        >
                            ทั้งหมด
                        </button>
                        {allStats.map(s => (
                            <button
                                key={s.index}
                                onClick={() => setSelectedGraphProject(selectedGraphProject === s.index ? null : s.index)}
                                className={`px-3 py-1 rounded-full text-xs font-bold border transition flex items-center gap-1.5
                                    ${selectedGraphProject === s.index
                                        ? 'text-white border-transparent shadow-sm'
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}
                                style={selectedGraphProject === s.index
                                    ? { background: s.projColor, borderColor: s.projColor }
                                    : {}}
                            >
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.projColor }} />
                                {s.name}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ─── Top: % summary + bar chart ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                {/* Summary % panel */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col items-center justify-center gap-4">
                    <CircleProgress
                        percent={graphAvgPct}
                        color={pctColor(graphAvgPct, graphOverCount > 0)}
                        size={140}
                    />
                    <div className="text-center">
                        <div className="text-xs text-slate-400 uppercase tracking-wide">
                            {graphStat ? graphStat.name : 'เฉลี่ยทุกแปลง'}
                        </div>
                        <div className="text-sm font-bold text-slate-700 mt-1">
                            งบ: {fmtM(graphSumBudget)} · จ่าย: {fmtM(graphSumPaid)}
                        </div>
                        {graphOverCount > 0 && (
                            <div className="text-xs text-red-500 font-bold mt-1">
                                ⚠ {graphOverCount} แปลงเกินงบ
                            </div>
                        )}
                    </div>
                    {/* Legend */}
                    <div className="flex gap-3 text-[10px] text-slate-400">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block"/>&lt;50%</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block"/>50–79%</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"/>80%+</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block"/>เกินงบ</span>
                    </div>
                </div>

                {/* Bar chart — switches based on project selection */}
                <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                    {graphStat ? (
                        <>
                            <h3 className="text-sm font-bold text-slate-700 mb-1">
                                งบประมาณ vs จ่ายจริง
                                <span className="ml-2 text-xs font-normal text-slate-400">— {graphStat.name}</span>
                            </h3>
                            <p className="text-xs text-slate-400 mb-4">วัสดุและค่าแรง: งบตั้งเทียบกับยอดจ่ายจริง</p>
                            <div style={{ height: '180px' }}>
                                <Bar data={singleBarData} options={singleBarOpts} />
                            </div>
                        </>
                    ) : (
                        <>
                            <h3 className="text-sm font-bold text-slate-700 mb-1">% การใช้งบแต่ละแปลง</h3>
                            <p className="text-xs text-slate-400 mb-4">เงินจ่ายจริง ÷ งบประมาณ × 100</p>
                            <div style={{ height: `${Math.max(160, projects.length * 44)}px` }}>
                                <Bar data={barData} options={barOpts} />
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ─── Project cards ─── */}
            <div>
                <h3 className="text-sm font-bold text-slate-700 mb-3">
                    รายละเอียดแต่ละแปลง
                    <span className="ml-2 text-xs font-normal text-slate-400">ติ๊ก = รวมในสรุป · ▼ = ดูรายละเอียด</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {allStats.map(s => {
                        const color   = pctColor(s.percent, s.balance < 0);
                        const isOver  = s.balance < 0;
                        const isCheck = checked.has(s.index);
                        const isExp   = expanded.has(s.index);
                        return (
                            <div
                                key={s.index}
                                className={`bg-white border rounded-2xl shadow-sm overflow-hidden transition-all
                                    ${isCheck ? 'border-blue-300 ring-1 ring-blue-200' : 'border-slate-200'}`}
                            >
                                {/* Card top: accent strip */}
                                <div className="h-1" style={{ background: color }} />

                                <div className="p-4">
                                    {/* Name row */}
                                    <div className="flex items-center justify-between mb-3">
                                        <button onClick={() => toggle(checked, setChecked, s.index)} className="text-lg">
                                            {isCheck
                                                ? <FaCheckSquare style={{ color }} />
                                                : <FaRegSquare className="text-slate-300" />}
                                        </button>
                                        <span className="flex-1 mx-2 font-bold text-slate-800 text-sm truncate" title={s.name}>{s.name}</span>
                                        <button onClick={() => toggle(expanded, setExpanded, s.index)} className="text-slate-400 hover:text-slate-600 transition">
                                            {isExp ? <FaChevronUp size={12}/> : <FaChevronDown size={12}/>}
                                        </button>
                                    </div>

                                    {/* Circle % — center */}
                                    <div className="flex flex-col items-center py-2">
                                        <CircleProgress percent={s.percent} color={color} size={130} />
                                        <span className={`text-[11px] font-bold mt-1 px-2 py-0.5 rounded-full ${isOver ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                                            {isOver ? '⚠ เกินงบประมาณ' : 'อยู่ในงบ'}
                                        </span>
                                    </div>

                                    {/* Quick numbers */}
                                    <div className="grid grid-cols-3 gap-1 mt-3 text-center text-[11px]">
                                        <div className="bg-slate-50 rounded-lg py-1.5">
                                            <div className="text-slate-400">งบ</div>
                                            <div className="font-bold text-slate-700">{fmtM(s.totalBudget)}</div>
                                        </div>
                                        <div className="bg-red-50 rounded-lg py-1.5">
                                            <div className="text-slate-400">จ่าย</div>
                                            <div className="font-bold text-red-500">{fmtM(s.totalPaid)}</div>
                                        </div>
                                        <div className={`rounded-lg py-1.5 ${isOver ? 'bg-red-50' : 'bg-emerald-50'}`}>
                                            <div className="text-slate-400">เหลือ</div>
                                            <div className={`font-bold ${isOver ? 'text-red-500' : 'text-emerald-600'}`}>{fmtM(s.balance)}</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded detail */}
                                {isExp && (
                                    <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-4 space-y-4">

                                        {/* Material % */}
                                        <DetailRow label="วัสดุ (Material)" percent={s.mPercent}
                                            budget={s.mBudget} paid={s.mPaid} balance={s.mBalance} color={color} />
                                        {/* Labor % */}
                                        <DetailRow label="ค่าแรง (Labor)" percent={s.lPercent}
                                            budget={s.lBudget} paid={s.lPaid} balance={s.lBalance} color={color} />

                                        {/* Doc counts */}
                                        <div className="grid grid-cols-2 gap-2 pt-1">
                                            <MiniDoc icon={<FaBoxOpen className="text-orange-400"/>}           label="PO รอ" val={s.poPending} />
                                            <MiniDoc icon={<FaCheckCircle className="text-green-500"/>}        label="PO เสร็จ" val={s.poDone} />
                                            <MiniDoc icon={<FaFileInvoiceDollar className="text-blue-400"/>}  label="PU" val={s.puCount} />
                                            <MiniDoc icon={<FaHardHat className="text-violet-400"/>}           label="DV" val={s.dvCount} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ─── Monthly PU Summary ─── */}
            {showMonthlySummary && (
                <div>
                    <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                        <FaShoppingCart className="text-blue-500" />
                        สรุปยอดซื้อวัสดุรายเดือน
                        {checkedNames
                            ? <span className="text-[11px] font-normal text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                                กรอง {checked.size} โครงการ
                              </span>
                            : <span className="text-[11px] font-normal text-slate-400">รวมทุกโครงการ</span>
                        }
                    </h3>

                    {puGrandTotal === 0 ? (
                        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-sm shadow-sm">
                            ยังไม่มีข้อมูลการจัดซื้อ
                        </div>
                    ) : filteredPuGroups.length === 0 ? (
                        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-sm shadow-sm">
                            โครงการที่เลือกยังไม่มีข้อมูลการจัดซื้อ
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {/* Grand total */}
                            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-2xl px-6 py-4 flex justify-between items-center shadow-md">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                                        <FaShoppingCart className="text-white text-sm" />
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold opacity-80 uppercase tracking-wider">
                                            {checkedNames ? `ยอดจัดซื้อ ${checked.size} โครงการที่เลือก` : 'ยอดจัดซื้อวัสดุรวมทุกโครงการ'}
                                        </div>
                                        <div className="text-xs opacity-60 mt-0.5">
                                            {filteredPuGroups.reduce((a, g) => a + g.entries.length, 0)} ใบ PU &nbsp;·&nbsp; {filteredPuGroups.length} เดือน
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-2xl font-bold">{fmt(filteredPuTotal)}</div>
                                    <div className="text-xs opacity-60 mt-0.5">บาท</div>
                                </div>
                            </div>

                            {/* Accordion รายเดือน */}
                            {filteredPuGroups.map((group, gi) => {
                                const isOpen = expandedPuMon.has(group.key);
                                const pct = filteredPuTotal > 0 ? (group.total / filteredPuTotal) * 100 : 0;
                                return (
                                    <div key={group.key} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                                        <button
                                            onClick={() => toggle(expandedPuMon, setExpandedPuMon, group.key)}
                                            className="w-full flex items-center gap-4 px-5 py-4 hover:bg-blue-50/60 transition text-left"
                                        >
                                            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                                                {gi + 1}
                                            </div>
                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                <FaChevronRight className={`text-blue-300 text-xs flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-bold text-slate-700 text-sm">{group.label}</div>
                                                    <div className="flex items-center gap-3 mt-1.5">
                                                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                            <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%`, transition: 'width 0.5s ease' }} />
                                                        </div>
                                                        <span className="text-[10px] text-slate-400 flex-shrink-0">{pct.toFixed(1)}%</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right flex-shrink-0">
                                                <div className="font-bold text-blue-700">{fmt(group.total)}</div>
                                                <div className="text-[10px] text-slate-400 mt-0.5">{group.entries.length} ใบ</div>
                                            </div>
                                        </button>

                                        {isOpen && (
                                            <div className="border-t border-slate-100">
                                                <table className="w-full text-sm">
                                                    <thead className="bg-blue-50">
                                                        <tr>
                                                            <th className="px-5 py-2.5 text-left text-xs font-bold text-blue-700">โครงการ</th>
                                                            <th className="px-5 py-2.5 text-left text-xs font-bold text-blue-700">เลขที่ PU</th>
                                                            <th className="px-5 py-2.5 text-left text-xs font-bold text-blue-700">วันที่</th>
                                                            <th className="px-5 py-2.5 text-left text-xs font-bold text-blue-700">อ้างอิง PO</th>
                                                            <th className="px-5 py-2.5 text-left text-xs font-bold text-blue-700">ผู้รับเหมา</th>
                                                            <th className="px-5 py-2.5 text-right text-xs font-bold text-blue-700">ยอด (บาท)</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-50">
                                                        {[...group.entries].reverse().map((entry, ei) => (
                                                            <tr key={`${entry.id}-${ei}`} className="hover:bg-blue-50/30 transition">
                                                                <td className="px-5 py-2.5">
                                                                    <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                                                                        {entry.projectName}
                                                                    </span>
                                                                </td>
                                                                <td className="px-5 py-2.5 font-bold text-blue-600 text-xs">{entry.no}</td>
                                                                <td className="px-5 py-2.5 text-slate-400 text-xs">
                                                                    {new Date(entry.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                                </td>
                                                                <td className="px-5 py-2.5 text-slate-500 text-xs">{entry.ref || '-'}</td>
                                                                <td className="px-5 py-2.5 text-slate-700 text-xs font-medium">{entry.contractor || '-'}</td>
                                                                <td className="px-5 py-2.5 text-right font-bold text-slate-700">
                                                                    {fmt(entry._total)}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                    <tfoot className="bg-slate-50 border-t border-slate-200">
                                                        <tr>
                                                            <td colSpan="5" className="px-5 py-2.5 text-right text-xs font-bold text-slate-500">
                                                                รวมเดือน {group.label}:
                                                            </td>
                                                            <td className="px-5 py-2.5 text-right font-bold text-blue-700">
                                                                {fmt(group.total)}
                                                            </td>
                                                        </tr>
                                                    </tfoot>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ─── Monthly DV Summary ─── */}
            {showMonthlySummary && (
                <div>
                    <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                        <FaCalendarAlt className="text-purple-500" />
                        สรุปยอดเบิกค่าแรงรายเดือน
                        {checkedNames
                            ? <span className="text-[11px] font-normal text-purple-600 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
                                กรอง {checked.size} โครงการ
                              </span>
                            : <span className="text-[11px] font-normal text-slate-400">รวมทุกโครงการ</span>
                        }
                    </h3>

                    {dvGrandTotal === 0 ? (
                        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-sm shadow-sm">
                            ยังไม่มีข้อมูลการเบิกค่าแรง
                        </div>
                    ) : filteredDvGroups.length === 0 ? (
                        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-sm shadow-sm">
                            โครงการที่เลือกยังไม่มีข้อมูลการเบิกค่าแรง
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {/* Grand total */}
                            <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-2xl px-6 py-4 flex justify-between items-center shadow-md">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                                        <FaHardHat className="text-white text-sm" />
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold opacity-80 uppercase tracking-wider">
                                            {checkedNames ? `ยอดค่าแรง ${checked.size} โครงการที่เลือก` : 'ยอดเบิกค่าแรงรวมทุกโครงการ'}
                                        </div>
                                        <div className="text-xs opacity-60 mt-0.5">
                                            {filteredDvGroups.reduce((a, g) => a + g.entries.length, 0)} รายการ &nbsp;·&nbsp; {filteredDvGroups.length} เดือน
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-2xl font-bold">{fmt(filteredDvTotal)}</div>
                                    <div className="text-xs opacity-60 mt-0.5">บาท</div>
                                </div>
                            </div>

                            {/* Accordion รายเดือน */}
                            {filteredDvGroups.map((group, gi) => {
                                const isOpen = expandedDvMon.has(group.key);
                                const pct = filteredDvTotal > 0 ? (group.total / filteredDvTotal) * 100 : 0;
                                return (
                                    <div key={group.key} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                                        <button
                                            onClick={() => toggle(expandedDvMon, setExpandedDvMon, group.key)}
                                            className="w-full flex items-center gap-4 px-5 py-4 hover:bg-purple-50/60 transition text-left"
                                        >
                                            <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                                                {gi + 1}
                                            </div>
                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                <FaChevronRight className={`text-purple-300 text-xs flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-bold text-slate-700 text-sm">{group.label}</div>
                                                    <div className="flex items-center gap-3 mt-1.5">
                                                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                            <div className="h-full bg-purple-400 rounded-full" style={{ width: `${pct}%`, transition: 'width 0.5s ease' }} />
                                                        </div>
                                                        <span className="text-[10px] text-slate-400 flex-shrink-0">{pct.toFixed(1)}%</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right flex-shrink-0">
                                                <div className="font-bold text-purple-700">{fmt(group.total)}</div>
                                                <div className="text-[10px] text-slate-400 mt-0.5">{group.entries.length} รายการ</div>
                                            </div>
                                        </button>

                                        {isOpen && (
                                            <div className="border-t border-slate-100">
                                                <table className="w-full text-sm">
                                                    <thead className="bg-purple-50">
                                                        <tr>
                                                            <th className="px-5 py-2.5 text-left text-xs font-bold text-purple-700">โครงการ</th>
                                                            <th className="px-5 py-2.5 text-left text-xs font-bold text-purple-700">เลขที่ DV</th>
                                                            <th className="px-5 py-2.5 text-left text-xs font-bold text-purple-700">วันที่</th>
                                                            <th className="px-5 py-2.5 text-left text-xs font-bold text-purple-700">จ่ายให้</th>
                                                            <th className="px-5 py-2.5 text-right text-xs font-bold text-purple-700">ยอด (บาท)</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-50">
                                                        {[...group.entries].reverse().map((entry, ei) => (
                                                            <tr key={`${entry.id}-${ei}`} className="hover:bg-purple-50/30 transition">
                                                                <td className="px-5 py-2.5">
                                                                    <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                                                                        {entry.projectName}
                                                                    </span>
                                                                </td>
                                                                <td className="px-5 py-2.5 font-bold text-purple-600 text-xs">{entry.no}</td>
                                                                <td className="px-5 py-2.5 text-slate-400 text-xs">
                                                                    {new Date(entry.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                                </td>
                                                                <td className="px-5 py-2.5 text-slate-700 text-xs font-medium">{entry.payee}</td>
                                                                <td className="px-5 py-2.5 text-right font-bold text-slate-700">
                                                                    {fmt(entry._total)}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                    <tfoot className="bg-slate-50 border-t border-slate-200">
                                                        <tr>
                                                            <td colSpan="4" className="px-5 py-2.5 text-right text-xs font-bold text-slate-500">
                                                                รวมเดือน {group.label}:
                                                            </td>
                                                            <td className="px-5 py-2.5 text-right font-bold text-purple-700">
                                                                {fmt(group.total)}
                                                            </td>
                                                        </tr>
                                                    </tfoot>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

        </div>
    );
};

// ─── Sub-components ──────────────────────────────────────────────────────────
const DetailRow = ({ label, percent, budget, paid, balance, color }) => (
    <div>
        <div className="flex justify-between text-xs mb-1">
            <span className="font-semibold text-slate-600">{label}</span>
            <span className="font-black" style={{ color }}>{percent.toFixed(1)}%</span>
        </div>
        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mb-1.5">
            <div className="h-full rounded-full" style={{ width: `${percent}%`, background: color, transition: 'width 0.7s ease' }} />
        </div>
        <div className="flex justify-between text-[10px] text-slate-400">
            <span>งบ {fmtM(budget)}</span>
            <span className="text-red-400">จ่าย {fmtM(paid)}</span>
            <span className={balance < 0 ? 'text-red-500 font-bold' : 'text-emerald-600'}>เหลือ {fmtM(balance)}</span>
        </div>
    </div>
);

const MiniDoc = ({ icon, label, val }) => (
    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5">
        <span>{icon}</span>
        <div>
            <div className="text-xs font-bold text-slate-700">{val}</div>
            <div className="text-[10px] text-slate-400">{label}</div>
        </div>
    </div>
);

export default Dashboard;
