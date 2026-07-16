import React, { useState } from 'react';
import { useProject } from '../context/ProjectContext';
import {
    FaChartPie, FaListUl, FaBoxOpen, FaHistory,
    FaFileInvoiceDollar, FaCheckCircle, FaHardHat,
    FaTrash, FaSignOutAlt, FaUserCircle, FaPlus, FaDatabase, FaCode, FaPen,
    FaAngleDoubleLeft, FaAngleDoubleRight, FaBuilding, FaClipboardCheck,
} from 'react-icons/fa';

const COLLAPSE_KEY = 'PMS_SIDEBAR_COLLAPSED';

const Sidebar = ({ activePage, setActivePage }) => {
    // ดึงตัวแปรและฟังก์ชันทั้งหมดจาก Context
    const {
        system,
        activeProjectIndex,
        setActiveProjectIndex,
        user,
        logout,
        addProject,
        deleteProject,
        can,
        // Group (โครงการ)
        activeGroup,
        setActiveGroup,
        visibleGroups,
        groupProjectIndices,
        addGroup,
        renameGroup,
        deleteGroup,
        pendingApprovalCount,
    } = useProject();

    const isAdmin = user?.role === 'ADMIN' || user?.role === 'DEV';
    const isDev = user?.role === 'DEV';

    // ── พับ/ขยาย sidebar (จำสถานะไว้ใน localStorage) ──
    const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
    const toggleCollapsed = () => {
        setCollapsed(c => {
            localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
            return !c;
        });
    };

    // --- ฟังก์ชันล้างระบบทั้งหมด (Factory Reset) ---
    const resetData = () => {
        if(confirm("⚠️ คำเตือน: ข้อมูล 'ทุกโครงการ' จะถูกลบทั้งหมดและกู้คืนไม่ได้!\n\nคุณแน่ใจหรือไม่ที่จะล้างระบบ?")) {
            // ลบ Key ที่เราเก็บข้อมูลไว้ใน LocalStorage
            localStorage.removeItem('CONSTRUCTION_SYSTEM_MULTI_V86');
            // รีโหลดหน้าเพื่อให้ระบบสร้างข้อมูลเริ่มต้นใหม่
            window.location.reload();
        }
    };

    // --- ฟังก์ชันจัดการโครงการ (Group) ---
    const handleAddGroup = () => {
        const name = prompt("ตั้งชื่อโครงการใหม่:");
        if (!name || name.trim() === "") return;
        if (visibleGroups.includes(name.trim())) { alert("มีโครงการชื่อนี้อยู่แล้ว"); return; }
        const plotName = prompt("ตั้งชื่อแปลงบ้านแรกในโครงการนี้:", "แปลงที่ 1");
        if (plotName === null) return;
        addGroup(name.trim(), plotName.trim() || 'แปลงที่ 1');
    };

    const handleRenameGroup = () => {
        const newName = prompt(`เปลี่ยนชื่อโครงการ "${activeGroup}" เป็น:`, activeGroup);
        if (!newName || newName.trim() === "" || newName.trim() === activeGroup) return;
        if (visibleGroups.includes(newName.trim())) { alert("มีโครงการชื่อนี้อยู่แล้ว"); return; }
        renameGroup(activeGroup, newName.trim());
    };

    const handleDeleteGroup = () => {
        if (confirm(`⚠️ ลบโครงการ "${activeGroup}" และแปลงบ้านทั้งหมด ${groupProjectIndices.length} แปลงในโครงการนี้?\n\nข้อมูลจะกู้คืนไม่ได้!`)) {
            deleteGroup(activeGroup);
        }
    };

    // --- ฟังก์ชันจัดการแปลงบ้าน (Plot) ---
    const handleAddProject = () => {
        const name = prompt(`ตั้งชื่อแปลงบ้านใหม่ (ในโครงการ "${activeGroup}"):`);
        if (name && name.trim() !== "") {
            addProject(name.trim());
        }
    };

    const handleDeleteProject = () => {
        const currentProjName = system.projects[activeProjectIndex]?.name;
        if (confirm(`คุณต้องการลบแปลง "${currentProjName}" และข้อมูลทั้งหมดของแปลงนี้ใช่หรือไม่?`)) {
            deleteProject();
        }
    };

    return (
        <div className={`${collapsed ? 'w-[60px]' : 'w-[220px]'} bg-white border-r border-slate-200 flex flex-col h-screen shadow-lg z-50 transition-[width] duration-200 ease-in-out overflow-hidden`}>

            {/* 1. Header & User Profile */}
            <div className={`${collapsed ? 'p-2' : 'p-5'} border-b border-slate-100 bg-slate-900 text-white`}>
                <div className="flex items-center justify-between">
                    {collapsed ? (
                        <FaBuilding className="text-blue-400 text-lg mx-auto" title="PMS 888" />
                    ) : (
                        <h1 className="text-lg font-bold flex items-center gap-2">
                            <i className="fas fa-building"></i>PMS 888
                        </h1>
                    )}
                </div>
                {!collapsed && <p className="text-[10px] text-slate-400 mb-2">V.86.0 (React)</p>}

                {/* ปุ่มพับ/ขยาย */}
                <button
                    onClick={toggleCollapsed}
                    title={collapsed ? 'ขยายเมนู' : 'พับเมนู'}
                    className={`${collapsed ? 'w-full mt-2 justify-center' : 'w-full justify-center mb-2'} flex items-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition`}
                >
                    {collapsed ? <FaAngleDoubleRight /> : (<><FaAngleDoubleLeft /> พับเมนู</>)}
                </button>

                {/* แสดงชื่อผู้ใช้ */}
                {collapsed ? (
                    <div className="mt-2 flex justify-center" title={`${user?.username || 'Guest'} (${user?.role || '-'})`}>
                        <FaUserCircle className="text-xl text-slate-400" />
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-800 p-2 rounded-lg border border-slate-700">
                        <FaUserCircle className="text-lg" />
                        <div className="flex flex-col">
                            <span className="font-bold">{user?.username || 'Guest'}</span>
                            <span className="text-[9px] text-slate-500 uppercase">{user?.role || '-'}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* 2. เลือกโครงการ (Group) — ซ่อนตอนพับ เหลือปุ่มภาพรวม */}
            {collapsed ? (
                isAdmin && (
                    <div className="p-2 bg-slate-800 border-b border-slate-700 flex justify-center">
                        <button
                            onClick={() => setActivePage('dashboard')}
                            title={`ภาพรวมโครงการ: ${activeGroup}`}
                            className={`p-2.5 rounded-xl text-sm transition
                                ${activePage === 'dashboard'
                                    ? 'bg-blue-600 text-white shadow-lg'
                                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                        >
                            <FaChartPie />
                        </button>
                    </div>
                )
            ) : (
                <>
                    <div className="p-3 bg-slate-800 border-b border-slate-700">
                        <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1 pl-1">เลือกโครงการ</label>
                        <div className="flex gap-1 items-center">
                            <select
                                className="flex-1 min-w-0 bg-slate-700 text-white border border-slate-600 text-xs p-2 rounded font-bold outline-none focus:border-blue-500"
                                value={activeGroup}
                                onChange={(e) => setActiveGroup(e.target.value)}
                            >
                                {visibleGroups.map(g => (
                                    <option key={g} value={g}>{g}</option>
                                ))}
                            </select>
                            {isAdmin && (
                                <>
                                    <button
                                        onClick={handleAddGroup}
                                        className="p-2 bg-green-600 hover:bg-green-700 text-white text-[10px] rounded transition shadow-sm shrink-0"
                                        title="สร้างโครงการใหม่"
                                    ><FaPlus /></button>
                                    <button
                                        onClick={handleRenameGroup}
                                        className="p-2 bg-slate-600 hover:bg-blue-600 text-white text-[10px] rounded transition shadow-sm shrink-0"
                                        title="เปลี่ยนชื่อโครงการ"
                                    ><FaPen /></button>
                                    <button
                                        onClick={handleDeleteGroup}
                                        className="p-2 bg-slate-600 hover:bg-red-600 text-white text-[10px] rounded transition shadow-sm shrink-0"
                                        title="ลบโครงการนี้ (รวมทุกแปลง)"
                                    ><FaTrash /></button>
                                </>
                            )}
                        </div>

                        {/* ปุ่มภาพรวมโครงการที่เลือก */}
                        {isAdmin && (
                            <button
                                onClick={() => setActivePage('dashboard')}
                                className={`w-full mt-2 flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold transition
                                    ${activePage === 'dashboard'
                                        ? 'bg-blue-600 text-white shadow-lg'
                                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                            >
                                <FaChartPie className="text-base" />
                                ภาพรวมโครงการ
                            </button>
                        )}
                    </div>

                    {/* 3. เลือกแปลงบ้าน (Plot) */}
                    <div className="p-3 bg-slate-800 border-b border-slate-700">
                        <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1 pl-1">เลือกแปลงบ้าน</label>
                        <select
                            className="w-full bg-slate-700 text-white border border-slate-600 text-xs p-2 rounded mb-2 font-bold outline-none focus:border-blue-500"
                            value={activeProjectIndex}
                            onChange={(e) => setActiveProjectIndex(Number(e.target.value))}
                        >
                            {groupProjectIndices.map(i => (
                                <option key={i} value={i}>{system.projects[i]?.name}</option>
                            ))}
                        </select>

                        {/* ปุ่มเพิ่ม/ลบแปลงบ้าน (เฉพาะ Admin) */}
                        {isAdmin && (
                            <div className="flex gap-1 mt-1">
                                <button
                                    onClick={handleAddProject}
                                    className="flex-1 py-1.5 bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold rounded transition flex items-center justify-center gap-1 shadow-sm"
                                    title="เพิ่มแปลงบ้านในโครงการนี้"
                                >
                                    <FaPlus /> เพิ่มแปลง
                                </button>
                                <button
                                    onClick={handleDeleteProject}
                                    className="flex-1 py-1.5 bg-slate-600 hover:bg-red-600 text-white text-[10px] font-bold rounded transition flex items-center justify-center gap-1 shadow-sm"
                                    title="ลบแปลงบ้านปัจจุบัน"
                                >
                                    <FaTrash /> ลบ
                                </button>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* 4. Navigation Menu */}
            <div className="flex-1 overflow-y-auto py-3 no-scrollbar">
                {/* --- Master BOQ --- */}
                {can('boq') && (
                    <>
                        <NavItem collapsed={collapsed} icon={<FaListUl />} label="Master BOQ" active={activePage === 'boq'} onClick={() => setActivePage('boq')} />
                        <div className="border-b border-slate-100 my-2 mx-4"></div>
                    </>
                )}

                {/* --- เมนูทั่วไป --- */}
                {!collapsed && <div className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase mt-1 tracking-wider">1. สั่งซื้อสินค้า</div>}
                <NavItem collapsed={collapsed} icon={<FaBoxOpen className="text-orange-500" />} label="เปิดใบสั่งจ้าง (PO)" active={activePage === 'po'} onClick={() => setActivePage('po')} />
                <NavItem collapsed={collapsed} icon={<FaHistory className="text-slate-400" />} label="ประวัติ PO" active={activePage === 'po-hist'} onClick={() => setActivePage('po-hist')} />

                {!collapsed && <div className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase mt-2 tracking-wider">2. จัดซื้อ/รับของ</div>}
                {collapsed && <div className="border-b border-slate-100 my-2 mx-3"></div>}
                <NavItem collapsed={collapsed} icon={<FaFileInvoiceDollar className="text-blue-500" />} label="รอจัดซื้อ PU" active={activePage === 'pu'} onClick={() => setActivePage('pu')} />
                <NavItem collapsed={collapsed} icon={<FaCheckCircle className="text-green-500" />} label="ประวัติ PU" active={activePage === 'pu-hist'} onClick={() => setActivePage('pu-hist')} />

                {!collapsed && <div className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase mt-2 tracking-wider">3. ค่าแรงช่าง</div>}
                {collapsed && <div className="border-b border-slate-100 my-2 mx-3"></div>}
                <NavItem collapsed={collapsed} icon={<FaHardHat className="text-purple-500" />} label="เบิกค่าแรง DV" active={activePage === 'dv'} onClick={() => setActivePage('dv')} />
                <NavItem collapsed={collapsed} icon={<FaHistory className="text-slate-400" />} label="ประวัติ DV" active={activePage === 'dv-hist'} onClick={() => setActivePage('dv-hist')} />

                {/* รออนุมัติ — เห็นทุก role (วิศวกรเห็นคำขอตัวเอง) */}
                <div className="border-b border-slate-100 my-2 mx-4"></div>
                <NavItem
                    collapsed={collapsed}
                    icon={<FaClipboardCheck className="text-amber-500" />}
                    label="รออนุมัติ"
                    badge={pendingApprovalCount > 0 ? pendingApprovalCount : null}
                    active={activePage === 'approvals'}
                    onClick={() => setActivePage('approvals')}
                />

                {can('backup') && (
                    <>
                        <div className="border-b border-slate-100 my-2 mx-4"></div>
                        <NavItem collapsed={collapsed} icon={<FaDatabase className="text-blue-400" />} label="Backup & Restore" active={activePage === 'backup'} onClick={() => setActivePage('backup')} />
                    </>
                )}

                {can('devPanel') && (
                    <>
                        <div className="border-b border-slate-100 my-2 mx-4"></div>
                        {isDev && !collapsed && <div className="px-4 py-2 text-[10px] font-bold text-purple-400 uppercase tracking-wider">Dev Tools</div>}
                        <NavItem collapsed={collapsed} icon={<FaCode className="text-purple-500" />} label={isDev ? 'Developer Panel' : 'Activity Log'} active={activePage === 'devpanel'} onClick={() => setActivePage('devpanel')} />
                    </>
                )}
            </div>

            {/* 5. Footer Buttons */}
            <div className={`${collapsed ? 'p-2' : 'p-4'} border-t border-slate-200 bg-slate-50 flex flex-col gap-2`}>
                {/* ปุ่ม Logout (เห็นทุกคน) */}
                <button
                    onClick={logout}
                    title="ออกจากระบบ"
                    className={`w-full py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-200 hover:text-slate-800 rounded border border-slate-300 transition flex items-center justify-center gap-2 shadow-sm`}
                >
                    <FaSignOutAlt /> {!collapsed && 'ออกจากระบบ'}
                </button>

                {/* ปุ่ม Reset System (เฉพาะ Dev) */}
                {isDev && (
                    <button
                        onClick={resetData}
                        title="ล้างระบบทั้งหมด"
                        className={`w-full py-2.5 text-xs font-bold text-red-500 hover:bg-red-50 hover:text-red-600 rounded border border-red-200 transition flex items-center justify-center gap-2 mt-1`}
                    >
                        <FaTrash /> {!collapsed && 'ล้างระบบทั้งหมด'}
                    </button>
                )}
            </div>
        </div>
    );
};

// Component ย่อยสำหรับแต่ละเมนู
const NavItem = ({ icon, label, active, onClick, collapsed, badge }) => (
    <div
        onClick={onClick}
        title={collapsed ? `${label}${badge ? ` (${badge})` : ''}` : undefined}
        className={`${collapsed ? 'px-0 py-3 justify-center' : 'px-4 py-3 gap-3'} relative cursor-pointer text-[13px] font-medium transition flex items-center border-l-4
        ${active ? 'bg-blue-50 text-blue-600 border-blue-600 font-bold' : 'text-slate-600 border-transparent hover:bg-slate-50 hover:border-slate-300'}`}
    >
        <span className="relative w-5 text-center flex justify-center items-center text-sm">
            {icon}
            {collapsed && badge != null && (
                <span className="absolute -top-2 -right-2.5 min-w-[15px] h-[15px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                    {badge > 99 ? '99+' : badge}
                </span>
            )}
        </span>
        {!collapsed && (
            <>
                <span className="flex-1">{label}</span>
                {badge != null && (
                    <span className="min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                        {badge > 99 ? '99+' : badge}
                    </span>
                )}
            </>
        )}
    </div>
);

export default Sidebar;
