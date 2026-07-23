import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useProject } from '../context/ProjectContext';
import { FaPlus, FaFolderPlus, FaSave, FaTrash, FaChevronDown, FaChevronRight, FaCompress, FaExpand, FaSearch, FaTimes, FaHardHat } from 'react-icons/fa';
import { materialBudget, laborBudget, itemBudget } from '../utils/boqMath';

// ── Fuzzy search helpers ──────────────────────────────────────────────────────
const normalizeText = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// ระยะ edit distance ที่น้อยที่สุดระหว่าง token กับ substring ใดๆ ของ text
// (approximate substring matching — พิมพ์ผิด/สลับ/ตกหล่นเล็กน้อยก็ยังเจอ)
const fuzzySubstringDist = (text, token) => {
    const n = text.length, m = token.length;
    if (m === 0) return 0;
    if (n === 0) return m;
    let prev = new Array(n + 1).fill(0); // เริ่ม match ที่ตำแหน่งไหนของ text ก็ได้
    for (let i = 1; i <= m; i++) {
        const cur = new Array(n + 1);
        cur[0] = i;
        for (let j = 1; j <= n; j++) {
            const cost = token[i - 1] === text[j - 1] ? 0 : 1;
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        }
        prev = cur;
    }
    return Math.min(...prev);
};

const tokenMatches = (text, token) => {
    if (text.includes(token)) return true;
    // ยอมพิมพ์ผิดตามความยาวคำ: ≥8 ตัว ผิดได้ 2, ≥4 ตัว ผิดได้ 1
    const maxDist = token.length >= 8 ? 2 : token.length >= 4 ? 1 : 0;
    if (maxDist === 0) return false;
    return fuzzySubstringDist(text, token) <= maxDist;
};

const rowMatchesQuery = (item, tokens) => {
    const hay = normalizeText(`${item.code || ''} ${item.name || ''} ${item.unit || ''} ${item.con || ''} ${item.note || ''}`);
    return tokens.every(t => tokenMatches(hay, t));
};

// ── ช่องราคา: แสดง 2 ตำแหน่ง แต่เก็บค่าเต็ม (คลิกเพื่อแก้ไข เห็นค่าเต็ม) ──
const PriceCell = ({ value, onCommit, readOnly, fmt }) => {
    const [editing, setEditing] = useState(false);
    const has = value !== '' && value !== null && value !== undefined;
    if (readOnly) {
        return <div className="w-full h-full text-right pr-1 font-mono text-slate-700 py-[9px]">{has ? fmt(value) : ''}</div>;
    }
    if (editing) {
        return (
            <input
                type="number" autoFocus defaultValue={value}
                onFocus={(e) => e.target.select()}
                onBlur={(e) => { onCommit(e.target.value); setEditing(false); }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditing(false); }}
                className="w-full h-full text-right outline-none bg-white text-slate-800 font-mono pr-1 ring-1 ring-blue-300 rounded"
            />
        );
    }
    return (
        <div
            onClick={() => setEditing(true)}
            title={has ? String(value) : ''}   /* hover เห็นค่าเต็ม */
            className="w-full h-full text-right pr-1 font-mono text-slate-700 py-[9px] cursor-text hover:bg-blue-50/60"
        >
            {has ? fmt(value) : <span className="text-slate-300">0.00</span>}
        </div>
    );
};

const BOQ = () => {
    const { currentProjectData, updateProjectData, createBackup, currentProjectName, user } = useProject();
    const [items, setItems] = useState(() => currentProjectData?.boq || []);
    const [saveStatus, setSaveStatus] = useState('saved'); // 'saved' | 'unsaved' | 'saving'
    const [selectedHeaderId, setSelectedHeaderId] = useState('');
    const [collapsedSections, setCollapsedSections] = useState(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const isReadOnly = user?.role === 'PROJECT';

    const toggleSection = (id) => {
        setCollapsedSections(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const collapseAll = () => {
        setCollapsedSections(new Set(items.filter(i => i.type === 'header').map(i => i.id)));
    };

    const expandAll = () => setCollapsedSections(new Set());

    // ย่อเฉพาะ level-0 (ประเภทบ้าน) เพื่อดูภาพรวม
    const collapseToOverview = () => {
        setCollapsedSections(new Set(
            items.filter(i => i.type === 'header' && (i.level ?? 1) === 0).map(i => i.id)
        ));
    };

    // Scroll to section (level-0 header) และ expand ถ้าถูก collapse อยู่
    const rowRefs = useRef({});
    const scrollToSection = (id) => {
        if (collapsedSections.has(id)) {
            setCollapsedSections(prev => { const next = new Set(prev); next.delete(id); return next; });
        }
        setTimeout(() => {
            rowRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 60);
    };

    // ── Column resize ─────────────────────────────────────────────────────────
    // 18 columns: #, Code, รายการ, หน่วย, ปริมาณ, สั่งPO, ราคาM, รวมM, ใช้M, เหลือM,
    //             ราคาL, รวมL, จ่ายL, เหลือL, %, ช่าง, Note, (del)
    const [colWidths, setColWidths] = useState(
        [36, 56, 280, 48, 80, 72, 80, 96, 80, 80, 80, 96, 80, 80, 40, 88, 72, 28]
    );
    const dragState = useRef({ col: null, startX: 0, startW: 0 });

    const startResize = (colIdx, e) => {
        dragState.current = { col: colIdx, startX: e.clientX, startW: colWidths[colIdx] };
        e.preventDefault();
    };

    useEffect(() => {
        const onMove = (e) => {
            const { col, startX, startW } = dragState.current;
            if (col === null) return;
            const w = Math.max(30, startW + (e.clientX - startX));
            setColWidths(prev => prev.map((v, i) => i === col ? w : v));
        };
        const onUp = () => { dragState.current.col = null; };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
    }, []);

    // Resize handle — thin line at right edge of th, visible on hover
    const RH = (ci) => (
        <div
            onMouseDown={(e) => startResize(ci, e)}
            className="absolute inset-y-0 right-0 w-1 cursor-col-resize z-20 select-none bg-blue-400 opacity-0 hover:opacity-100 transition-opacity"
        />
    );

    // ── Auto-save ─────────────────────────────────────────────────────────────
    const autoSaveTimer = useRef(null);
    const isSyncingFromFirebase = useRef(false);
    const userChangedItems = useRef(false);
    const latestProjectData = useRef(currentProjectData);

    useEffect(() => {
        latestProjectData.current = currentProjectData;
    });

    useEffect(() => {
        if (currentProjectData?.boq) {
            isSyncingFromFirebase.current = true;
            setItems(currentProjectData.boq);
        }
    }, [currentProjectData]);

    useEffect(() => {
        if (isSyncingFromFirebase.current) {
            isSyncingFromFirebase.current = false;
            return;
        }
        if (!userChangedItems.current) return;
        userChangedItems.current = false;
        setSaveStatus('unsaved');
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = setTimeout(async () => {
            setSaveStatus('saving');
            await updateProjectData(
                { ...latestProjectData.current, boq: items },
                'BOQ_AUTOSAVE',
                `แก้ไข BOQ อัตโนมัติ (${items.filter(i => i.type === 'item').length} รายการ)`
            );
            setSaveStatus('saved');
        }, 2000);
        return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
    }, [items]);

    // ── Helpers ───────────────────────────────────────────────────────────────
    const safeFloat = (val) => {
        if (val === null || val === undefined || val === '') return 0;
        const num = parseFloat(String(val).replace(/,/g, ''));
        return isNaN(num) ? 0 : num;
    };

    const nfmt = (num) =>
        safeFloat(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const calcItem = (itemId) => {
        const trans = currentProjectData.trans || [];
        const tx = trans.filter(t => t.itemId === itemId);
        const poQty = tx.filter(t => t.type === 'PO').reduce((sum, t) => sum + safeFloat(t.q), 0);
        const mPaid = tx.filter(t => t.type === 'PU').reduce((sum, t) => sum + safeFloat(t.a), 0);
        const lPaid = tx.filter(t => t.type === 'DV' || t.type === 'EXPENSE').reduce((sum, t) => sum + safeFloat(t.a), 0);
        return { poQty, mPaid, lPaid };
    };

    const handleChange = (id, field, value) => {
        if (['q', 'mP', 'lP'].includes(field) && value !== '' && parseFloat(value) < 0) return;
        userChangedItems.current = true;
        setItems(prev => prev.map(item => {
            if (item.id !== id) return item;
            const next = { ...item, [field]: value };
            // เมื่อผู้ใช้แก้จำนวน/ราคา ให้กลับไปคำนวณยอดจากค่าที่แก้ แทนยอดนำเข้าจาก Excel
            if (field === 'q' || field === 'mP') delete next.mTotal;
            if (field === 'q' || field === 'lP') delete next.lTotal;
            return next;
        }));
    };

    // ── Add / Delete ──────────────────────────────────────────────────────────
    const addHeader = () => {
        let max = 0;
        items.forEach(i => {
            if (i.type === 'header') {
                const c = parseInt(i.code);
                if (!isNaN(c) && c > max) max = c;
            }
        });
        const nextCode = String(max + 1).padStart(2, '0');
        const newId = Date.now();
        userChangedItems.current = true;
        setItems([...items, { id: newId, type: 'header', code: nextCode, name: 'หมวดงานใหม่' }]);
        setSelectedHeaderId(newId);
    };

    const addItem = () => {
        if (!selectedHeaderId) return alert('กรุณาเลือกหมวดงานจาก Dropdown ก่อนเพิ่มรายการ');
        const headerIndex = items.findIndex(i => i.id == selectedHeaderId);
        if (headerIndex === -1) return alert('ไม่พบหมวดงานที่เลือก (อาจถูกลบไปแล้ว)');
        const headerItem = items[headerIndex];
        let insertIndex = headerIndex + 1;
        let count = 0;
        while (insertIndex < items.length && items[insertIndex].type !== 'header') {
            insertIndex++;
            count++;
        }
        const newItem = {
            id: Date.now(), type: 'item',
            code: `${headerItem.code}.${count + 1}`,
            name: 'รายการใหม่', unit: 'เหมา', q: 0, mP: 0, lP: 0, con: '', note: ''
        };
        const newItems = [...items];
        newItems.splice(insertIndex, 0, newItem);
        userChangedItems.current = true;
        setItems(newItems);
    };

    const handleDelete = (id) => {
        if (confirm('ต้องการลบรายการนี้ใช่หรือไม่?')) {
            userChangedItems.current = true;
            setItems(prev => prev.filter(i => i.id !== id));
            if (id == selectedHeaderId) setSelectedHeaderId('');
        }
    };

    // กำหนดชื่อช่างให้ทุกรายการที่มีค่าแรงในหมวด (รวมหมวดย่อยข้างใน)
    const assignContractorToSection = (headerId) => {
        const idx = items.findIndex(i => i.id === headerId);
        if (idx === -1) return;
        const lvl = items[idx].level ?? 1;
        const nextIdx = items.findIndex((i, ii) => ii > idx && i.type === 'header' && (i.level ?? 1) <= lvl);
        const end = nextIdx === -1 ? items.length : nextIdx;
        const targets = items.slice(idx + 1, end).filter(i => i.type === 'item' && safeFloat(i.lP) > 0);
        if (targets.length === 0) return alert('หมวดนี้ไม่มีรายการที่มีค่าแรง (ค่าแรง/หน่วย ต้องมากกว่า 0)');
        const name = prompt(
            `กำหนดช่างให้ ${targets.length} รายการที่มีค่าแรงในหมวด "${items[idx].name}":\n(เว้นว่าง = ล้างชื่อช่างออก)`,
            targets.find(t => t.con)?.con || ''
        );
        if (name === null) return;
        const ids = new Set(targets.map(t => t.id));
        userChangedItems.current = true;
        setItems(prev => prev.map(i => ids.has(i.id) ? { ...i, con: name.trim() } : i));
    };

    const handleSave = async () => {
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        setSaveStatus('saving');
        await updateProjectData(
            { ...currentProjectData, boq: items },
            'BOQ_SAVE',
            `บันทึก BOQ พร้อม Backup (${items.filter(i => i.type === 'item').length} รายการ)`
        );
        await createBackup(`BOQ Backup - ${currentProjectName || 'โครงการ'} - ${new Date().toLocaleString('th-TH')}`);
        setSaveStatus('saved');
        alert('บันทึกและสำรองข้อมูลเรียบร้อย');
    };

    // ── Search ────────────────────────────────────────────────────────────────
    // ค้นหาแบบใกล้เคียง: แสดงแถวที่ตรง + หมวดแม่ของมัน / ถ้าหมวดตรง แสดงทั้งหมวด
    const searchInfo = useMemo(() => {
        const qn = normalizeText(searchQuery);
        if (!qn) return null;
        const tokens = qn.split(' ').filter(Boolean);
        const visible = new Set();
        const matched = new Set();
        const stack = []; // header ancestors ณ ตำแหน่งปัจจุบัน
        let includeUnderLevel = null; // header ที่ตรง → แสดงลูกทั้งหมด

        for (const item of items) {
            if (item.type === 'header') {
                const lvl = item.level ?? 1;
                while (stack.length && (stack[stack.length - 1].level ?? 1) >= lvl) stack.pop();
                if (includeUnderLevel !== null && lvl <= includeUnderLevel) includeUnderLevel = null;

                if (rowMatchesQuery(item, tokens)) {
                    matched.add(item.id);
                    stack.forEach(h => visible.add(h.id));
                    visible.add(item.id);
                    if (includeUnderLevel === null) includeUnderLevel = lvl;
                } else if (includeUnderLevel !== null) {
                    visible.add(item.id);
                }
                stack.push({ id: item.id, level: lvl });
            } else {
                if (includeUnderLevel !== null) {
                    visible.add(item.id);
                } else if (rowMatchesQuery(item, tokens)) {
                    matched.add(item.id);
                    stack.forEach(h => visible.add(h.id));
                    visible.add(item.id);
                }
            }
        }
        const count = items.filter(i => i.type === 'item' && visible.has(i.id)).length;
        return { visible, matched, count };
    }, [items, searchQuery]);

    // ── Collapse visibility ───────────────────────────────────────────────────
    // คำนวณว่าแต่ละแถวควรแสดงหรือซ่อน ตาม collapsedSections (ระหว่างค้นหา: ใช้ผลค้นหาแทน)
    const displayItems = useMemo(() => {
        if (searchInfo) {
            return items
                .filter(i => searchInfo.visible.has(i.id))
                .map(i => ({ ...i, _hidden: false, _match: searchInfo.matched.has(i.id) }));
        }
        if (collapsedSections.size === 0) return items;
        const result = [];
        let hiddenUnderLevel = null; // เมื่อ header ถูก collapse, ซ่อนทุกอย่างจนกว่าจะเจอ header ระดับเดียวกันหรือสูงกว่า
        for (const item of items) {
            if (item.type === 'header') {
                const lvl = item.level ?? 1;
                if (hiddenUnderLevel !== null && lvl <= hiddenUnderLevel) hiddenUnderLevel = null;
                result.push({ ...item, _hidden: false });
                if (hiddenUnderLevel === null && collapsedSections.has(item.id)) hiddenUnderLevel = lvl;
            } else {
                result.push({ ...item, _hidden: hiddenUnderLevel !== null });
            }
        }
        return result;
    }, [items, collapsedSections, searchInfo]);

    const totalW = colWidths.reduce((a, b) => a + b, 0);

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full bg-[#f8fafc] font-sarabun text-[13px]">

            {/* Toolbar */}
            <div className="p-3 bg-white border-b border-slate-200 flex justify-between items-center sticky top-0 z-20 shadow-sm">
                <div className="flex items-center gap-3">
                    <h2 className="font-bold text-slate-700 text-sm shrink-0">Master BOQ</h2>
                    {/* ช่องค้นหา — รองรับคำใกล้เคียง/พิมพ์ผิดเล็กน้อย */}
                    <div className="relative flex items-center">
                        <FaSearch className="absolute left-2.5 text-slate-400" size={11} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Escape') setSearchQuery(''); }}
                            placeholder="ค้นหารายการ, หมวด, ช่าง..."
                            className="w-[230px] pl-8 pr-7 py-1.5 text-xs border border-slate-300 rounded-lg outline-none bg-slate-50 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery('')} title="ล้างคำค้น (Esc)"
                                className="absolute right-2 text-slate-400 hover:text-slate-600">
                                <FaTimes size={11} />
                            </button>
                        )}
                    </div>
                    {searchInfo && (
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                            searchInfo.count > 0 ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-500'}`}>
                            {searchInfo.count > 0 ? `พบ ${searchInfo.count} รายการ` : 'ไม่พบรายการ'}
                        </span>
                    )}
                </div>
                <div className="flex gap-1.5 items-center">
                    {/* View controls — ทุก role ใช้ได้ */}
                    <button onClick={collapseToOverview} title="ดูภาพรวมประเภทบ้าน"
                        className="bg-slate-100 border border-slate-300 text-slate-600 px-2.5 py-1.5 rounded hover:bg-slate-200 flex items-center gap-1 text-xs font-medium transition">
                        <FaCompress size={9} /> ภาพรวม
                    </button>
                    <button onClick={collapseAll} title="ย่อทั้งหมด"
                        className="bg-white border border-slate-300 text-slate-500 px-2.5 py-1.5 rounded hover:bg-slate-50 flex items-center gap-1 text-xs transition">
                        <FaCompress size={9} /> ย่อสุด
                    </button>
                    <button onClick={expandAll} title="ขยายทั้งหมด"
                        className="bg-white border border-slate-300 text-slate-500 px-2.5 py-1.5 rounded hover:bg-slate-50 flex items-center gap-1 text-xs transition">
                        <FaExpand size={9} /> ขยาย
                    </button>
                    <div className="w-px h-6 bg-slate-300 mx-0.5" />
                    {isReadOnly ? (
                        <span className="text-[11px] bg-green-100 text-green-700 border border-green-200 px-2.5 py-1.5 rounded-lg font-bold">
                            วิศวกรโครงการ · ดูข้อมูลอย่างเดียว
                        </span>
                    ) : (
                        <>
                            <button onClick={addHeader} className="bg-slate-700 text-white px-3 py-1.5 rounded hover:bg-slate-800 flex items-center gap-1 text-xs font-bold transition">
                                <FaFolderPlus /> เพิ่มหมวด
                            </button>
                            <select
                                className="border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-700 outline-none bg-white min-w-[150px] font-bold"
                                value={selectedHeaderId}
                                onChange={(e) => setSelectedHeaderId(e.target.value)}
                            >
                                <option value="">-- เลือกหมวดงาน --</option>
                                {items.filter(i => i.type === 'header').map(h => (
                                    <option key={h.id} value={h.id}>{h.code} {h.name}</option>
                                ))}
                            </select>
                            <button onClick={addItem} className="bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 flex items-center gap-1 text-xs font-bold transition">
                                <FaPlus /> เพิ่มรายการ
                            </button>
                            <div className="w-px h-6 bg-slate-300 mx-1" />
                            <div className="text-[11px] min-w-[90px] text-right">
                                {saveStatus === 'saving'  && <span className="text-blue-500 font-medium">⟳ กำลังบันทึก...</span>}
                                {saveStatus === 'unsaved' && <span className="text-orange-500 font-medium">● มีการเปลี่ยนแปลง</span>}
                                {saveStatus === 'saved'   && <span className="text-green-600 font-medium">✓ บันทึกแล้ว</span>}
                            </div>
                            <button onClick={handleSave} disabled={saveStatus === 'saving'} className="bg-green-600 text-white px-4 py-1.5 rounded hover:bg-green-700 flex items-center gap-1 text-xs font-bold shadow-sm transition disabled:opacity-50">
                                <FaSave /> บันทึก+สำรอง
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Quick Navigation — แสดงเฉพาะเมื่อมี level-0 headers (ประเภทบ้าน) */}
            {(() => {
                const l0 = items.filter(i => i.type === 'header' && (i.level ?? 1) === 0);
                if (l0.length === 0 || searchInfo) return null;
                return (
                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex gap-1.5 flex-wrap items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-1 shrink-0">ไปที่</span>
                        {l0.map((h, idx) => {
                            const myIdx = items.findIndex(i => i.id === h.id);
                            const nextL0 = items.findIndex((i, ii) => ii > myIdx && i.type === 'header' && (i.level ?? 1) === 0);
                            const count  = items.slice(myIdx + 1, nextL0 === -1 ? undefined : nextL0).filter(i => i.type === 'item').length;
                            return (
                                <button key={h.id} onClick={() => scrollToSection(h.id)}
                                    className="flex items-center gap-1 px-3 py-1 bg-slate-800 hover:bg-slate-600 text-white text-[11px] font-bold rounded-full transition shadow-sm">
                                    {h.name}
                                    <span className="bg-white/20 text-white/80 text-[9px] px-1.5 py-0 rounded-full font-normal">{count}</span>
                                </button>
                            );
                        })}
                    </div>
                );
            })()}

            {/* Table Container */}
            <div className="flex-1 overflow-auto p-4">
                <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
                    <table
                        className="border-collapse"
                        style={{ tableLayout: 'fixed', width: `${totalW}px`, minWidth: '100%' }}
                    >
                        {/* colgroup drives all column widths */}
                        <colgroup>
                            {colWidths.map((w, i) => <col key={i} style={{ width: `${w}px` }} />)}
                        </colgroup>

                        <thead className="text-[11px] sticky top-0 z-10 bg-slate-50 shadow-sm">
                            <tr>
                                <th rowSpan="2" className="border border-slate-200 p-1 text-center bg-slate-50 text-slate-900 font-bold relative overflow-hidden">
                                    #
                                    {RH(0)}
                                </th>
                                <th rowSpan="2" className="border border-slate-200 p-1 text-center bg-slate-50 text-slate-900 font-bold relative overflow-hidden">
                                    Code
                                    {RH(1)}
                                </th>
                                <th rowSpan="2" className="border border-slate-200 p-1 text-left pl-2 bg-slate-50 text-slate-900 font-bold relative overflow-hidden">
                                    รายการ
                                    {RH(2)}
                                </th>
                                <th rowSpan="2" className="border border-slate-200 p-1 text-center bg-slate-50 text-slate-900 font-bold relative overflow-hidden">
                                    หน่วย
                                    {RH(3)}
                                </th>
                                <th colSpan="6" className="border border-slate-200 p-1 text-center bg-slate-50 text-slate-900 font-bold">
                                    วัสดุ (Material)
                                </th>
                                <th colSpan="4" className="border border-slate-200 p-1 text-center bg-slate-50 text-slate-900 font-bold">
                                    ค่าแรง (Labor)
                                </th>
                                <th rowSpan="2" className="border border-slate-200 p-1 text-center bg-slate-50 text-slate-900 font-bold relative overflow-hidden">
                                    %
                                    {RH(14)}
                                </th>
                                <th rowSpan="2" className="border border-slate-200 p-1 text-center bg-slate-50 text-slate-900 font-bold relative overflow-hidden">
                                    ช่าง
                                    {RH(15)}
                                </th>
                                <th rowSpan="2" className="border border-slate-200 p-1 text-center bg-slate-50 text-slate-900 font-bold relative overflow-hidden">
                                    Note
                                    {RH(16)}
                                </th>
                                <th rowSpan="2" className="border border-slate-200 p-1 text-center bg-slate-50" />
                            </tr>
                            <tr>
                                <th className="border border-slate-200 p-1 text-center bg-slate-50 text-slate-900 font-bold relative overflow-hidden">ปริมาณ{RH(4)}</th>
                                <th className="border border-slate-200 p-1 text-center bg-slate-50 text-slate-900 font-bold relative overflow-hidden">สั่งPO{RH(5)}</th>
                                <th className="border border-slate-200 p-1 text-center bg-slate-50 text-slate-900 font-bold relative overflow-hidden">ราคา{RH(6)}</th>
                                <th className="border border-slate-200 p-1 text-center bg-slate-50 text-slate-900 font-bold relative overflow-hidden">รวม{RH(7)}</th>
                                <th className="border border-slate-200 p-1 text-center bg-slate-50 text-slate-900 font-bold relative overflow-hidden">ใช้{RH(8)}</th>
                                <th className="border border-slate-200 p-1 text-center bg-slate-50 text-slate-900 font-bold relative overflow-hidden">เหลือ{RH(9)}</th>
                                <th className="border border-slate-200 p-1 text-center bg-slate-50 text-slate-900 font-bold relative overflow-hidden">ราคา{RH(10)}</th>
                                <th className="border border-slate-200 p-1 text-center bg-slate-50 text-slate-900 font-bold relative overflow-hidden">รวม{RH(11)}</th>
                                <th className="border border-slate-200 p-1 text-center bg-slate-50 text-slate-900 font-bold relative overflow-hidden">จ่าย{RH(12)}</th>
                                <th className="border border-slate-200 p-1 text-center bg-slate-50 text-slate-900 font-bold relative overflow-hidden">เหลือ{RH(13)}</th>
                            </tr>
                        </thead>

                        <tbody>
                            {displayItems.map((item, index) => {
                                if (item._hidden) return null;

                                const q      = safeFloat(item.q);
                                const mP     = safeFloat(item.mP);
                                const lP     = safeFloat(item.lP);
                                const mTotal = materialBudget(item);
                                const lTotal = laborBudget(item);
                                const { poQty, mPaid, lPaid } = calcItem(item.id);
                                const mRem   = mTotal - mPaid;
                                const lRem   = lTotal - lPaid;
                                const percent = q > 0 ? Math.min(100, Math.max(0, (poQty / q) * 100)) : 0;

                                const td  = "border border-slate-200";
                                const num = "font-mono text-[11.5px] text-slate-700";

                                if (item.type === 'header') {
                                    const lvl = item.level ?? 1;
                                    const isCollapsed = collapsedSections.has(item.id);

                                    // สีและสไตล์ตาม level
                                    const headerStyle =
                                        lvl === 0
                                            ? 'bg-gradient-to-r from-slate-800 to-slate-700 text-white'
                                            : lvl === 1
                                            ? 'bg-blue-50 text-blue-900 border-l-[3px] border-l-blue-500'
                                            : 'bg-slate-50 text-slate-600 border-l-[3px] border-l-slate-300';

                                    const textStyle =
                                        lvl === 0
                                            ? 'font-extrabold text-[13px] tracking-wide text-white'
                                            : lvl === 1
                                            ? 'font-bold text-[12.5px] text-blue-900'
                                            : 'font-semibold text-[12px] text-slate-600';

                                    const inputBg =
                                        lvl === 0
                                            ? 'bg-transparent text-white placeholder-slate-400'
                                            : 'bg-transparent';

                                    return (
                                        <tr key={item.id}
                                            ref={lvl === 0 ? el => { rowRefs.current[item.id] = el; } : undefined}
                                            className={`${headerStyle} transition-colors`}>
                                            <td className={`${td} p-1 text-center text-[10px] ${lvl === 0 ? 'text-slate-400' : 'text-slate-500'}`}>
                                                {index + 1}
                                            </td>
                                            <td className={`${td} p-0`}>
                                                {!isReadOnly && (
                                                    <input type="text" value={item.code}
                                                        onChange={(e) => handleChange(item.id, 'code', e.target.value)}
                                                        className={`w-full h-full text-center outline-none px-1 text-[11px] ${inputBg} font-bold`} />
                                                )}
                                            </td>
                                            <td colSpan="15" className={`${td} p-0`}>
                                                <div className="flex items-center gap-1">
                                                    {/* Collapse toggle — pointer-events-auto เพื่อทำงานแม้ read-only */}
                                                    <button
                                                        onClick={() => toggleSection(item.id)}
                                                        className={`pointer-events-auto flex-shrink-0 w-6 h-full flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity ${lvl === 0 ? 'text-white' : 'text-slate-500'}`}
                                                    >
                                                        {isCollapsed
                                                            ? <FaChevronRight size={9} />
                                                            : <FaChevronDown  size={9} />}
                                                    </button>
                                                    {isReadOnly ? (
                                                        <span className={`px-1 py-1 ${textStyle}`}>{item.name}</span>
                                                    ) : (
                                                        <input type="text" value={item.name}
                                                            onChange={(e) => handleChange(item.id, 'name', e.target.value)}
                                                            className={`flex-1 px-1 py-1 outline-none ${inputBg} ${textStyle}`} />
                                                    )}
                                                    {/* ปุ่มกำหนดช่างทั้งหมวด */}
                                                    {!isReadOnly && (
                                                        <button
                                                            onClick={() => assignContractorToSection(item.id)}
                                                            title="กำหนดช่างให้ทุกรายการที่มีค่าแรงในหมวดนี้"
                                                            className={`pointer-events-auto flex-shrink-0 px-1.5 opacity-40 hover:opacity-100 transition-opacity ${lvl === 0 ? 'text-white' : 'text-purple-500'}`}
                                                        >
                                                            <FaHardHat size={11} />
                                                        </button>
                                                    )}
                                                    {/* Badge: แสดงตลอดเมื่อ collapse, หรือแสดงเฉพาะ count เมื่อ level-0 */}
                                                    {(() => {
                                                        const myIdx = items.findIndex(i => i.id === item.id);
                                                        const nextHeaderIdx = items.findIndex((i, ii) => ii > myIdx && i.type === 'header' && (i.level ?? 1) <= lvl);
                                                        const sectionItems = items.slice(myIdx + 1, nextHeaderIdx === -1 ? undefined : nextHeaderIdx).filter(i => i.type === 'item');
                                                        const sectionBudget = sectionItems.reduce((s, i) => s + itemBudget(i), 0);
                                                        if (isCollapsed) {
                                                            return (
                                                                <span className={`ml-3 flex items-center gap-2 flex-shrink-0 text-[11px] font-mono ${lvl === 0 ? 'text-slate-300' : 'text-slate-400'}`}>
                                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${lvl === 0 ? 'bg-white/15 text-white' : 'bg-slate-200 text-slate-600'}`}>
                                                                        {sectionItems.length} รายการ
                                                                    </span>
                                                                    {sectionBudget > 0 && (
                                                                        <span className={`${lvl === 0 ? 'text-slate-300' : 'text-slate-500'}`}>
                                                                            {nfmt(sectionBudget)} ฿
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            );
                                                        }
                                                        if (lvl === 0) {
                                                            return (
                                                                <span className="ml-2 px-2 py-0.5 bg-white/15 text-white/70 text-[10px] rounded-full flex-shrink-0">
                                                                    {sectionItems.length}
                                                                </span>
                                                            );
                                                        }
                                                        return null;
                                                    })()}
                                                </div>
                                            </td>
                                            <td className={`${td} p-1 text-center`}>
                                                {!isReadOnly && (
                                                    <button onClick={() => handleDelete(item.id)}
                                                        className={`${lvl === 0 ? 'text-slate-500 hover:text-red-400' : 'text-slate-400 hover:text-red-500'}`}>
                                                        <FaTrash size={10} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                }

                                return (
                                    <tr key={item.id} className={`hover:bg-blue-50 transition-colors ${item._match ? 'bg-yellow-50' : 'bg-white'} ${isReadOnly ? 'pointer-events-none select-none' : ''}`}>
                                        <td className={`${td} p-1 text-center text-slate-400 text-[10px]`}>{index + 1}</td>
                                        <td className={`${td} p-0`}>
                                            <input type="text" value={item.code} onChange={(e) => handleChange(item.id, 'code', e.target.value)}
                                                className="w-full h-full text-center outline-none bg-transparent text-slate-600 text-[11px] px-1" />
                                        </td>
                                        <td className={`${td} p-0`}>
                                            <input type="text" value={item.name} onChange={(e) => handleChange(item.id, 'name', e.target.value)}
                                                className="w-full h-full px-2 outline-none bg-transparent text-slate-800 text-[12px]" />
                                        </td>
                                        <td className={`${td} p-0`}>
                                            <input type="text" value={item.unit} onChange={(e) => handleChange(item.id, 'unit', e.target.value)}
                                                className="w-full h-full text-center outline-none bg-transparent text-slate-600 text-[11px]" />
                                        </td>
                                        <td className={`${td} p-0`}>
                                            <input type="number" value={item.q} onChange={(e) => handleChange(item.id, 'q', e.target.value)}
                                                className="w-full h-full text-center outline-none bg-transparent text-slate-700 font-mono" placeholder="0" />
                                        </td>
                                        <td className={`${td} p-1 text-right font-mono text-[11.5px] font-bold text-red-500`}>{nfmt(poQty)}</td>
                                        <td className={`${td} p-0`}>
                                            <PriceCell value={item.mP} readOnly={isReadOnly} fmt={nfmt}
                                                onCommit={(v) => handleChange(item.id, 'mP', v)} />
                                        </td>
                                        <td className={`${td} p-1 text-right ${num} font-bold`}>{nfmt(mTotal)}</td>
                                        <td className={`${td} p-1 text-right font-mono text-[11.5px] font-bold text-red-500`}>{nfmt(mPaid)}</td>
                                        <td className={`${td} p-1 text-right font-mono text-[11.5px] font-bold ${mRem < 0 ? 'text-red-500' : 'text-green-600'}`}>{nfmt(mRem)}</td>
                                        <td className={`${td} p-0`}>
                                            <PriceCell value={item.lP} readOnly={isReadOnly} fmt={nfmt}
                                                onCommit={(v) => handleChange(item.id, 'lP', v)} />
                                        </td>
                                        <td className={`${td} p-1 text-right ${num} font-bold`}>{nfmt(lTotal)}</td>
                                        <td className={`${td} p-1 text-right font-mono text-[11.5px] font-bold text-red-500`}>{nfmt(lPaid)}</td>
                                        <td className={`${td} p-1 text-right font-mono text-[11.5px] font-bold ${lRem < 0 ? 'text-red-500' : 'text-green-600'}`}>{nfmt(lRem)}</td>
                                        <td className={`${td} p-1 text-center text-[11px] font-bold`}>
                                            <span className={
                                                percent >= 100 ? 'text-green-600' :
                                                percent >= 80  ? 'text-orange-500' :
                                                percent > 0    ? 'text-slate-500' :
                                                                 'text-slate-300'
                                            }>
                                                {percent.toFixed(1)}%
                                            </span>
                                        </td>
                                        <td className={`${td} p-0`}>
                                            <input type="text" value={item.con} onChange={(e) => handleChange(item.id, 'con', e.target.value)}
                                                className="w-full h-full text-center outline-none bg-transparent text-slate-700 text-[11px]" placeholder="ระบุช่าง" />
                                        </td>
                                        <td className={`${td} p-0`}>
                                            <input type="text" value={item.note} onChange={(e) => handleChange(item.id, 'note', e.target.value)}
                                                className="w-full h-full text-center outline-none bg-transparent text-slate-600 text-[11px]" />
                                        </td>
                                        <td className={`${td} p-0 text-center`}>
                                            <button onClick={() => handleDelete(item.id)} className="text-slate-300 hover:text-red-500 w-full h-full flex items-center justify-center">
                                                <FaTrash size={10} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>

                        <tfoot className="bg-slate-100 text-slate-700 font-bold sticky bottom-0 text-[11.5px] border-t-2 border-slate-300">
                            {(() => {
                                const tfMRem = items.filter(i => i.type === 'item').reduce((s, i) => {
                                    const { mPaid } = calcItem(i.id);
                                    return s + materialBudget(i) - mPaid;
                                }, 0);
                                const tfLRem = items.filter(i => i.type === 'item').reduce((s, i) => {
                                    const { lPaid } = calcItem(i.id);
                                    return s + laborBudget(i) - lPaid;
                                }, 0);
                                const tfTotalBudget = items.filter(i => i.type === 'item').reduce((s, i) =>
                                    s + itemBudget(i), 0);
                                const tfTotalPaid = items.filter(i => i.type === 'item').reduce((s, i) => {
                                    const { mPaid, lPaid } = calcItem(i.id);
                                    return s + mPaid + lPaid;
                                }, 0);
                                const tfPercent = tfTotalBudget > 0
                                    ? Math.min(100, Math.max(0, (tfTotalPaid / tfTotalBudget) * 100))
                                    : 0;
                                return (
                                    <tr>
                                        <td colSpan="4" className="border border-slate-200 p-2 text-right text-slate-500 text-xs uppercase tracking-wide">Total</td>
                                        <td className="border border-slate-200" />
                                        <td className="border border-slate-200" />
                                        <td className="border border-slate-200" />
                                        <td className="border border-slate-200 p-1 text-right font-mono text-slate-800 font-bold">{nfmt(items.reduce((s, i) => s + materialBudget(i), 0))}</td>
                                        <td className="border border-slate-200 p-1 text-right font-mono font-bold text-red-500">{nfmt(items.reduce((s, i) => s + calcItem(i.id).mPaid, 0))}</td>
                                        <td className={`border border-slate-200 p-1 text-right font-mono font-bold ${tfMRem < 0 ? 'text-red-500' : 'text-green-600'}`}>{nfmt(tfMRem)}</td>
                                        <td className="border border-slate-200" />
                                        <td className="border border-slate-200 p-1 text-right font-mono text-slate-800 font-bold">{nfmt(items.reduce((s, i) => s + laborBudget(i), 0))}</td>
                                        <td className="border border-slate-200 p-1 text-right font-mono font-bold text-red-500">{nfmt(items.reduce((s, i) => s + calcItem(i.id).lPaid, 0))}</td>
                                        <td className={`border border-slate-200 p-1 text-right font-mono font-bold ${tfLRem < 0 ? 'text-red-500' : 'text-green-600'}`}>{nfmt(tfLRem)}</td>
                                        <td className={`border border-slate-200 p-1 text-center text-[11px] font-bold ${tfPercent >= 100 ? 'text-green-600' : tfPercent >= 80 ? 'text-orange-500' : tfPercent > 0 ? 'text-slate-600' : 'text-slate-300'}`}>
                                            {tfPercent.toFixed(1)}%
                                        </td>
                                        <td colSpan="3" className="border border-slate-200 bg-slate-100" />
                                    </tr>
                                );
                            })()}
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default BOQ;
