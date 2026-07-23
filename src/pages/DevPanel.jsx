import React, { useState, useEffect, useRef } from 'react';
import { importPlotsFromExcel } from '../utils/excelHelper';
import { db, secondaryAuth, auth } from '../firebase';
import { collection, getDocs, query, orderBy, limit, doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { useProject } from '../context/ProjectContext';
import { PERM_FEATURES, getGroupOf } from '../context/ProjectContext';
import {
    FaUsers, FaHistory, FaClipboardList, FaUserPlus, FaChartBar,
    FaToggleOn, FaToggleOff, FaTimes, FaSync, FaCode, FaLock, FaUnlock,
    FaEdit, FaTrash, FaPlus, FaFileDownload, FaFolderOpen, FaShieldAlt, FaSave,
    FaBell, FaPaperPlane, FaGlobe, FaUserTag, FaClipboardCheck, FaHardHat, FaUndo,
} from 'react-icons/fa';

// ─── Constants ───────────────────────────────────────────────────────────────

const ALL_TABS = [
    { id: 'dashboard',    label: 'ภาพรวม',           icon: FaChartBar,      devOnly: true  },
    { id: 'users',        label: 'จัดการผู้ใช้',     icon: FaUsers,         devOnly: true  },
    { id: 'projects',     label: 'จัดการโครงการ',    icon: FaFolderOpen,    devOnly: true  },
    { id: 'login',        label: 'ประวัติ Login',     icon: FaHistory,       devOnly: false, permKey: 'loginHistory' },
    { id: 'audit',        label: 'Audit Log',         icon: FaClipboardList, devOnly: false, permKey: 'auditLog' },
    { id: 'permissions',  label: 'สิทธิ์การเข้าถึง', icon: FaShieldAlt,     devOnly: true  },
    { id: 'approval',     label: 'ตั้งค่าอนุมัติ',   icon: FaClipboardCheck, devOnly: true  },
    { id: 'canceldv',     label: 'ยกเลิกใบเบิก DV',  icon: FaHardHat,        devOnly: true  },
    { id: 'notifications', label: 'การแจ้งเตือน',    icon: FaBell,          devOnly: true  },
    { id: 'system',       label: 'ควบคุมระบบ',        icon: FaGlobe,         devOnly: true  },
];

const ROLE_COLORS = {
    DEV:     'bg-purple-100 text-purple-700',
    ADMIN:   'bg-blue-100 text-blue-700',
    PROJECT: 'bg-green-100 text-green-700',
    USER:    'bg-slate-100 text-slate-600',
};

const ACTION_STYLES = {
    BOQ_AUTOSAVE:   'bg-slate-100 text-slate-500',
    BOQ_SAVE:       'bg-blue-100 text-blue-700',
    CREATE_PO:      'bg-orange-100 text-orange-700',
    COMPLETE_PU:    'bg-green-100 text-green-700',
    LABOR_PAYMENT:  'bg-purple-100 text-purple-700',
    ADD_PROJECT:    'bg-emerald-100 text-emerald-700',
    DELETE_PROJECT: 'bg-red-100 text-red-700',
    RENAME_PROJECT: 'bg-yellow-100 text-yellow-700',
    UPDATE_DATA:    'bg-blue-100 text-blue-700',
};

const ACTION_LABELS = {
    BOQ_AUTOSAVE:   'BOQ auto-save',
    BOQ_SAVE:       'บันทึก BOQ',
    CREATE_PO:      'สร้าง PO',
    COMPLETE_PU:    'บันทึก PU',
    LABOR_PAYMENT:  'เบิกค่าแรง DV',
    ADD_PROJECT:    'เพิ่มโครงการ',
    DELETE_PROJECT: 'ลบโครงการ',
    RENAME_PROJECT: 'เปลี่ยนชื่อโครงการ',
    UPDATE_DATA:    'แก้ไขข้อมูล',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (iso) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('th-TH', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
};

const todayStart = () => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString();
};

const ActionBadge = ({ action }) => (
    <span className={`px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${ACTION_STYLES[action] || 'bg-slate-100 text-slate-600'}`}>
        {ACTION_LABELS[action] || action}
    </span>
);

const StatCard = ({ icon, label, value, sub, color }) => (
    <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
        <div className={`w-9 h-9 ${color} rounded-xl flex items-center justify-center mb-3 text-white text-sm`}>
            {icon}
        </div>
        <div className="text-2xl font-bold text-slate-800">{value}</div>
        <div className="text-xs text-slate-500 mt-0.5">{label}</div>
        {sub && <div className="text-[10px] text-slate-400 mt-1">{sub}</div>}
    </div>
);

const EMPTY_FORM = { email: '', username: '', password: '', role: 'USER' };
const projectAccessKey = (project) => JSON.stringify([getGroupOf(project), project.name]);

// ─── Main Component ───────────────────────────────────────────────────────────

const DevPanel = () => {
    const {
        system, addProject, deleteProjectByIndex, updateProjectNameByIndex, setProjectGroupByIndex,
        user, permissions, savePermissions,
        approvalConfig, saveApprovalConfig,
        cancelDVByIndex, importPlots,
        notifications, createNotification, updateNotification, deleteNotification, toggleNotificationActive,
        maintenanceMode, maintenanceMessage, saveMaintenance,
    } = useProject();
    const accessProjects = system.projects.map(p => ({ key: projectAccessKey(p), name: p.name, group: getGroupOf(p) }));
    const allAccessKeys = accessProjects.map(p => p.key);
    const accessGroups = [...new Set(accessProjects.map(p => p.group))];
    const isDev = user?.role === 'DEV';

    // ── นำเข้าโครงการจาก Excel (แต่ละ sheet = 1 แปลง) ──
    const importFileRef = useRef(null);
    const [importing, setImporting] = useState(false);

    const handleImportProjectFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const groupName = (prompt('ตั้งชื่อโครงการที่จะนำเข้า (แต่ละ sheet = 1 แปลงบ้าน):') || '').trim();
        if (!groupName) return;
        setImporting(true);
        try {
            const { plots, report } = await importPlotsFromExcel(file, groupName);
            if (!plots.length) { alert('ไม่พบ sheet ข้อมูลในไฟล์ (แต่ละ sheet ต้องมีหัวตารางแถว 1-5)'); return; }

            const anyBad = report.some(r => !r.okM || !r.okL);
            const lines = report.map(r =>
                `• ${r.name}: ${r.items} รายการ ${(!r.okM || !r.okL) ? '⚠ ยอดไม่ตรง Excel' : '✓ ยอดตรง'}` +
                `${r.warns ? ` (เหมา ${r.warns})` : ''}`
            ).join('\n');
            const exists = system.projects.some(p => getGroupOf(p) === groupName);

            let msg = `นำเข้า ${plots.length} แปลง เข้าโครงการ "${groupName}"\n\n${lines}`;
            if (anyBad) msg += `\n\n⚠️ มีแปลงที่ยอดคำนวณไม่ตรงกับ Excel — แนะนำตรวจไฟล์ก่อนยืนยัน`;
            if (exists) msg += `\n\n⚠️ มีโครงการชื่อนี้อยู่แล้ว — ยืนยันเพื่อ "รวมเข้าโครงการเดิม" (ลบแปลงว่างในนั้นออก)`;
            if (!confirm(msg + `\n\nยืนยันนำเข้า?`)) return;

            const res = await importPlots(plots, groupName, { merge: exists });
            if (res.ok) alert(`✅ นำเข้าสำเร็จ ${res.count} แปลง เข้าโครงการ "${groupName}"\n(สำรองข้อมูลก่อนหน้าไว้ใน Backup & Restore แล้ว)`);
            else alert('❌ ' + res.msg);
        } catch (err) {
            alert('เกิดข้อผิดพลาดในการอ่านไฟล์: ' + err.message);
        } finally {
            setImporting(false);
        }
    };

    // Filter tabs ตาม role + permissions
    const TABS = ALL_TABS.filter(tab => {
        if (isDev) return true;
        if (tab.devOnly) return false;
        // ADMIN — เห็นเฉพาะ tab ที่มีสิทธิ์
        return !!(permissions.ADMIN?.[tab.permKey]);
    });

    // Tab — default เป็น tab แรกที่เห็นได้
    const [activeTab, setActiveTab] = useState(() => TABS[0]?.id || 'login');

    // Data lists
    const [users,        setUsers]        = useState([]);
    const [loginHistory, setLoginHistory] = useState([]);
    const [auditLogs,    setAuditLogs]    = useState([]);
    const [dashStats,    setDashStats]    = useState(null);
    const [loading,      setLoading]      = useState(false);

    // Audit filter
    const [filterUser,   setFilterUser]   = useState('');
    const [filterAction, setFilterAction] = useState('');

    // Create user modal
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [form,            setForm]            = useState(EMPTY_FORM);
    const [createLoading,   setCreateLoading]   = useState(false);
    const [createError,     setCreateError]     = useState('');

    // Edit user modal
    const [showEditModal,  setShowEditModal]  = useState(false);
    const [editUser,       setEditUser]       = useState(null);
    const [editForm,       setEditForm]       = useState({ username: '', role: '' });
    const [editSaving,     setEditSaving]     = useState(false);
    const [pwResetLoading, setPwResetLoading] = useState(false);
    const [pwResetSent,    setPwResetSent]    = useState(false);

    // System / Maintenance
    const [maintMsgDraft,  setMaintMsgDraft]  = useState('');
    const [maintSaving,    setMaintSaving]    = useState(false);

    // Project access modal
    const [showAccessModal,  setShowAccessModal]  = useState(false);
    const [accessUser,       setAccessUser]       = useState(null);
    const [accessSelections, setAccessSelections] = useState([]);
    const [accessSaving,     setAccessSaving]     = useState(false);

    // Project rename modal
    const [showRenameModal,  setShowRenameModal]  = useState(false);
    const [renameIndex,      setRenameIndex]      = useState(null);
    const [renameName,       setRenameName]       = useState('');

    // Add project modal
    const [showAddProject,  setShowAddProject]  = useState(false);
    const [newProjectName,  setNewProjectName]  = useState('');

    // ── Fetch functions ────────────────────────────────────────────────────────

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const [usersSnap, histSnap] = await Promise.all([
                getDocs(collection(db, 'users')),
                getDocs(query(collection(db, 'login_history'), orderBy('loginAt', 'desc'), limit(1000))),
            ]);
            // Aggregate login stats per uid (sorted desc → first hit = latest)
            const stats = {};
            histSnap.docs.forEach(d => {
                const { uid, loginAt } = d.data();
                if (!uid) return;
                if (!stats[uid]) stats[uid] = { count: 0, lastLogin: loginAt };
                stats[uid].count++;
            });
            setUsers(usersSnap.docs.map(d => ({
                uid: d.id,
                ...d.data(),
                loginCount: stats[d.id]?.count  || 0,
                lastLogin:  stats[d.id]?.lastLogin || null,
            })));
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    const fetchLoginHistory = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, 'login_history'), orderBy('loginAt', 'desc'), limit(100));
            const snap = await getDocs(q);
            setLoginHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    const fetchAuditLogs = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(200));
            const snap = await getDocs(q);
            setAuditLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    const fetchDashboard = async () => {
        setLoading(true);
        try {
            const today = todayStart();

            const [usersSnap, loginSnap, auditSnap] = await Promise.all([
                getDocs(collection(db, 'users')),
                getDocs(query(collection(db, 'login_history'), orderBy('loginAt', 'desc'), limit(200))),
                getDocs(query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(500))),
            ]);

            const allUsers   = usersSnap.docs.map(d => d.data());
            const logins     = loginSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const audits     = auditSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            setDashStats({
                totalUsers:    allUsers.length,
                activeUsers:   allUsers.filter(u => u.isActive !== false).length,
                loginsToday:   logins.filter(l => l.loginAt >= today).length,
                actionsToday:  audits.filter(a => a.timestamp >= today).length,
                totalProjects: system.projects.length,
                recentLogins:  logins.slice(0, 6),
                recentActions: audits.slice(0, 6),
            });
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    useEffect(() => {
        if (activeTab === 'dashboard')   fetchDashboard();
        if (activeTab === 'users')       fetchUsers();
        if (activeTab === 'login')       fetchLoginHistory();
        if (activeTab === 'audit')       fetchAuditLogs();
    }, [activeTab]);

    // ── User actions ───────────────────────────────────────────────────────────

    const toggleUserActive = async (uid, currentlyActive) => {
        const target = users.find(u => u.uid === uid);
        if (currentlyActive && !confirm(`ปิดใช้งาน "${target?.username}" ?\n\nUser จะไม่สามารถเข้าสู่ระบบได้จนกว่าจะเปิดใหม่`)) return;
        try {
            await updateDoc(doc(db, 'users', uid), { isActive: !currentlyActive });
            setUsers(prev => prev.map(u => u.uid === uid ? { ...u, isActive: !currentlyActive } : u));
        } catch (e) { alert('เกิดข้อผิดพลาด: ' + e.message); }
    };

    const openEditModal = (u) => {
        setEditUser(u);
        setEditForm({ username: u.username, role: u.role });
        setPwResetSent(false);
        setPwResetLoading(false);
        setShowEditModal(true);
    };

    const saveEditUser = async () => {
        setEditSaving(true);
        try {
            await updateDoc(doc(db, 'users', editUser.uid), {
                username: editForm.username,
                role:     editForm.role,
            });
            setUsers(prev => prev.map(u =>
                u.uid === editUser.uid ? { ...u, username: editForm.username, role: editForm.role } : u
            ));
            setShowEditModal(false);
        } catch (e) { alert('เกิดข้อผิดพลาด: ' + e.message); }
        setEditSaving(false);
    };

    const sendPasswordReset = async () => {
        setPwResetLoading(true);
        try {
            await sendPasswordResetEmail(auth, editUser.email);
            setPwResetSent(true);
        } catch (e) { alert('เกิดข้อผิดพลาด: ' + e.message); }
        setPwResetLoading(false);
    };

    const handleDeleteUser = async (u) => {
        if (!confirm(`ลบบัญชี "${u.username}" (${u.email}) ออกจากระบบ?\n\nบัญชีนี้จะไม่สามารถเข้าสู่ระบบได้อีก`)) return;
        try {
            await deleteDoc(doc(db, 'users', u.uid));
            setUsers(prev => prev.filter(x => x.uid !== u.uid));
        } catch (e) { alert('เกิดข้อผิดพลาด: ' + e.message); }
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        setCreateLoading(true);
        setCreateError('');
        try {
            const emailToCreate = form.email.includes('@') ? form.email : `${form.email}@nutcon.com`;
            const credential = await createUserWithEmailAndPassword(secondaryAuth, emailToCreate, form.password);
            await secondaryAuth.signOut();
            await setDoc(doc(db, 'users', credential.user.uid), {
                email: emailToCreate, username: form.username, role: form.role,
                createdAt: new Date().toISOString(), createdBy: 'dev', isActive: true,
            });
            setShowCreateModal(false);
            setForm(EMPTY_FORM);
            await fetchUsers();
        } catch (e) {
            let msg = e.message;
            if (e.code === 'auth/email-already-in-use') msg = 'Email นี้มีในระบบแล้ว';
            else if (e.code === 'auth/weak-password')   msg = 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
            setCreateError(msg);
        }
        setCreateLoading(false);
    };

    // ── Project access ─────────────────────────────────────────────────────────

    const openAccessModal = (u) => {
        setAccessUser(u);
        if (!Array.isArray(u.projectAccess)) {
            setAccessSelections([...allAccessKeys]);
        } else {
            // รองรับข้อมูลเดิมที่เก็บเฉพาะชื่อแปลง
            setAccessSelections(accessProjects
                .filter(p => u.projectAccess.includes(p.key) || u.projectAccess.includes(p.name))
                .map(p => p.key));
        }
        setShowAccessModal(true);
    };

    const toggleAccessProject = (name) =>
        setAccessSelections(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);

    const saveProjectAccess = async () => {
        setAccessSaving(true);
        try {
            const newAccess = allAccessKeys.length > 0 && allAccessKeys.every(key => accessSelections.includes(key))
                ? null
                : accessSelections;
            await updateDoc(doc(db, 'users', accessUser.uid), { projectAccess: newAccess });
            setUsers(prev => prev.map(u => u.uid === accessUser.uid ? { ...u, projectAccess: newAccess } : u));
            setShowAccessModal(false);
        } catch (e) { alert('เกิดข้อผิดพลาด: ' + e.message); }
        setAccessSaving(false);
    };

    // ── Project management ─────────────────────────────────────────────────────

    const handleAddProject = (e) => {
        e.preventDefault();
        const name = newProjectName.trim();
        if (!name) return;
        addProject(name);
        setNewProjectName('');
        setShowAddProject(false);
    };

    const openRename = (index) => {
        setRenameIndex(index);
        setRenameName(system.projects[index]?.name || '');
        setShowRenameModal(true);
    };

    const saveRename = (e) => {
        e.preventDefault();
        const name = renameName.trim();
        if (!name) return;
        updateProjectNameByIndex(renameIndex, name);
        setShowRenameModal(false);
    };

    const handleDeleteProject = (index) => {
        const name = system.projects[index]?.name;
        if (confirm(`ลบโครงการ "${name}" และข้อมูลทั้งหมดในโครงการนี้ใช่หรือไม่?\nการกระทำนี้ไม่สามารถย้อนกลับได้`)) {
            deleteProjectByIndex(index);
        }
    };

    // ── Export CSV ─────────────────────────────────────────────────────────────

    const exportAuditCSV = () => {
        const filtered = auditLogs.filter(l =>
            (!filterUser   || l.username === filterUser) &&
            (!filterAction || l.action   === filterAction)
        );
        const headers = ['เวลา', 'ผู้ดำเนินการ', 'Email', 'Role', 'การกระทำ', 'โครงการ', 'รายละเอียด'];
        const rows = filtered.map(log => [
            fmt(log.timestamp), log.username, log.email, log.role,
            ACTION_LABELS[log.action] || log.action,
            log.projectName || '-', log.details || '-',
        ]);
        const csv = [headers, ...rows]
            .map(r => r.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
            .join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url;
        a.download = `audit_log_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ── Render ─────────────────────────────────────────────────────────────────

    const filteredAudit = auditLogs.filter(l =>
        (!filterUser   || l.username === filterUser) &&
        (!filterAction || l.action   === filterAction)
    );

    return (
        <div className="space-y-4">

            {/* Header */}
            <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 bg-purple-600 rounded-xl flex items-center justify-center">
                    <FaCode className="text-white text-base" />
                </div>
                <div>
                    <h2 className="font-bold text-slate-800 text-lg">Developer Panel</h2>
                    <p className="text-xs text-slate-400">จัดการระบบ, ผู้ใช้ และโครงการ</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-slate-200 w-fit flex-wrap">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition
                            ${activeTab === tab.id ? 'bg-purple-600 text-white shadow' : 'text-slate-500 hover:bg-slate-100'}`}
                    >
                        <tab.icon className="text-xs" /> {tab.label}
                    </button>
                ))}
            </div>

            {/* ══ Tab: Dashboard ══════════════════════════════════════════════════ */}
            {activeTab === 'dashboard' && (
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="font-bold text-slate-700">ภาพรวมระบบ</h3>
                        <button onClick={fetchDashboard} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-white transition">
                            <FaSync className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>

                    {dashStats && (
                        <>
                            {/* Stat cards */}
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                                <StatCard icon={<FaUsers />}       label="ผู้ใช้ทั้งหมด"    value={dashStats.totalUsers}    color="bg-blue-500" />
                                <StatCard icon={<FaUnlock />}      label="บัญชีที่ใช้งานได้" value={dashStats.activeUsers}   color="bg-green-500" />
                                <StatCard icon={<FaHistory />}     label="Login วันนี้"      value={dashStats.loginsToday}   color="bg-orange-500" />
                                <StatCard icon={<FaClipboardList />} label="Action วันนี้"   value={dashStats.actionsToday}  color="bg-purple-500" />
                                <StatCard icon={<FaFolderOpen />}  label="โครงการทั้งหมด"   value={dashStats.totalProjects} color="bg-slate-600" />
                            </div>

                            {/* Recent activity */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                                {/* Recent logins */}
                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                    <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                                        <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                                            <FaHistory className="text-orange-400" /> Login ล่าสุด
                                        </h4>
                                    </div>
                                    <div className="divide-y divide-slate-50">
                                        {dashStats.recentLogins.length === 0 && (
                                            <p className="text-center text-slate-400 text-xs py-6">ยังไม่มีข้อมูล</p>
                                        )}
                                        {dashStats.recentLogins.map(l => (
                                            <div key={l.id} className="px-4 py-2.5 flex justify-between items-center gap-2">
                                                <div>
                                                    <div className="text-sm font-bold text-slate-700">{l.username}</div>
                                                    <div className="text-[10px] text-slate-400">{l.email}</div>
                                                </div>
                                                <div className="text-right">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${ROLE_COLORS[l.role] || ROLE_COLORS.USER}`}>{l.role}</span>
                                                    <div className="text-[10px] text-slate-400 mt-0.5">{fmt(l.loginAt)}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Recent actions */}
                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                    <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                                        <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                                            <FaClipboardList className="text-purple-400" /> Action ล่าสุด
                                        </h4>
                                    </div>
                                    <div className="divide-y divide-slate-50">
                                        {dashStats.recentActions.length === 0 && (
                                            <p className="text-center text-slate-400 text-xs py-6">ยังไม่มีข้อมูล</p>
                                        )}
                                        {dashStats.recentActions.map(a => (
                                            <div key={a.id} className="px-4 py-2.5 flex justify-between items-center gap-2">
                                                <div className="min-w-0">
                                                    <div className="text-xs font-bold text-slate-700">{a.username}</div>
                                                    <div className="text-[10px] text-slate-400 truncate">{a.details || a.projectName || '-'}</div>
                                                </div>
                                                <div className="text-right flex-shrink-0">
                                                    <ActionBadge action={a.action} />
                                                    <div className="text-[10px] text-slate-400 mt-0.5">{fmt(a.timestamp)}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                    {loading && <div className="text-center py-12 text-slate-400 text-sm">กำลังโหลด...</div>}
                </div>
            )}

            {/* ══ Tab: Users ══════════════════════════════════════════════════════ */}
            {activeTab === 'users' && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="flex justify-between items-center p-4 border-b border-slate-100">
                        <h3 className="font-bold text-slate-700">ผู้ใช้ทั้งหมด ({users.length} คน)</h3>
                        <div className="flex gap-2">
                            <button onClick={fetchUsers} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition">
                                <FaSync className={loading ? 'animate-spin' : ''} />
                            </button>
                            <button onClick={() => setShowCreateModal(true)}
                                className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-purple-700 transition shadow-sm">
                                <FaUserPlus /> สร้าง ID ใหม่
                            </button>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">ชื่อผู้ใช้</th>
                                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Email</th>
                                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">UID</th>
                                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Role</th>
                                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Login ล่าสุด</th>
                                    <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">ครั้ง</th>
                                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">สิทธิ์โครงการ</th>
                                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">สถานะ</th>
                                    <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {users.map(u => {
                                    const selectedProjects = Array.isArray(u.projectAccess)
                                        ? accessProjects.filter(p => u.projectAccess.includes(p.key) || u.projectAccess.includes(p.name))
                                        : accessProjects;
                                    const isFullAccess = !Array.isArray(u.projectAccess);
                                    return (
                                        <tr key={u.uid} className="hover:bg-slate-50 transition">
                                            <td className="px-4 py-3 font-bold text-slate-700">{u.username}</td>
                                            <td className="px-4 py-3 text-slate-500 text-xs">{u.email}</td>
                                            <td className="px-4 py-3">
                                                <span className="font-mono text-[10px] text-slate-400 select-all">{u.uid}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${ROLE_COLORS[u.role] || ROLE_COLORS.USER}`}>
                                                    {u.role}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                {u.lastLogin ? (
                                                    <span className="text-xs text-slate-600">{fmt(u.lastLogin)}</span>
                                                ) : (
                                                    <span className="text-xs text-slate-300">ยังไม่เคย</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {u.loginCount > 0 ? (
                                                    <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-xs font-bold">{u.loginCount}</span>
                                                ) : (
                                                    <span className="text-xs text-slate-300">0</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-1">
                                                        {isFullAccess ? (
                                                            <span className="text-xs text-slate-400 flex items-center gap-1">
                                                                <FaUnlock className="text-green-400" /> ทุกโครงการ
                                                            </span>
                                                        ) : selectedProjects.length === 0 ? (
                                                            <span className="text-xs text-red-500 flex items-center gap-1">
                                                                <FaLock className="text-red-400" /> ไม่เห็นโครงการใด
                                                            </span>
                                                        ) : (
                                                            <div className="flex flex-wrap gap-1">
                                                                {selectedProjects.map(p => (
                                                                    <span key={p.key} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-medium border border-blue-100">
                                                                        {p.group} / {p.name}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                    {(u.role === 'USER' || u.role === 'PROJECT') && (
                                                        <button onClick={() => openAccessModal(u)} title="กำหนดสิทธิ์โครงการ"
                                                            className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition flex-shrink-0">
                                                            <FaLock className="text-xs" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${u.isActive !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                                                    {u.isActive !== false ? 'ใช้งานได้' : 'ปิดใช้งาน'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                {u.role === 'DEV' ? (
                                                    <div className="flex items-center justify-center">
                                                        <span className="text-[10px] text-slate-300 italic">ป้องกัน</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-center gap-1">
                                                        <button onClick={() => openEditModal(u)} title="แก้ไข"
                                                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
                                                            <FaEdit className="text-xs" />
                                                        </button>
                                                        <button onClick={() => toggleUserActive(u.uid, u.isActive !== false)}
                                                            title={u.isActive !== false ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                                                            className={`text-xl transition ${u.isActive !== false ? 'text-green-500 hover:text-red-400' : 'text-slate-300 hover:text-green-400'}`}>
                                                            {u.isActive !== false ? <FaToggleOn /> : <FaToggleOff />}
                                                        </button>
                                                        <button onClick={() => handleDeleteUser(u)} title="ลบบัญชี"
                                                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                                                            <FaTrash className="text-xs" />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {users.length === 0 && !loading && <div className="text-center py-12 text-slate-400 text-sm">ไม่พบข้อมูลผู้ใช้</div>}
                    {loading && <div className="text-center py-12 text-slate-400 text-sm">กำลังโหลด...</div>}
                </div>
            )}

            {/* ══ Tab: Projects ═══════════════════════════════════════════════════ */}
            {activeTab === 'projects' && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="flex justify-between items-center p-4 border-b border-slate-100">
                        <h3 className="font-bold text-slate-700">แปลงบ้านทั้งหมด ({system.projects.length} แปลง)</h3>
                        <div className="flex items-center gap-2">
                            {isDev && (
                                <>
                                    <input ref={importFileRef} type="file" accept=".xlsx,.xls" hidden onChange={handleImportProjectFile} />
                                    <button
                                        onClick={() => importFileRef.current?.click()}
                                        disabled={importing}
                                        title="นำเข้าไฟล์ Excel — แต่ละ sheet = 1 แปลงบ้าน เข้าโครงการใหม่"
                                        className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition shadow-sm disabled:opacity-60"
                                    >
                                        <FaFileDownload className={importing ? 'animate-pulse' : ''} />
                                        {importing ? 'กำลังนำเข้า...' : 'นำเข้าโครงการ (Excel)'}
                                    </button>
                                </>
                            )}
                            <button onClick={() => setShowAddProject(true)}
                                className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-700 transition shadow-sm">
                                <FaPlus /> เพิ่มแปลง
                            </button>
                        </div>
                    </div>

                    {(() => {
                        // จัดกลุ่มแปลงตามโครงการ
                        const allGroups = [...new Set(system.projects.map(p => getGroupOf(p)))];
                        const NEW_GROUP = '__NEW__';
                        const handleMove = (i, val) => {
                            if (!val) return;
                            let target = val;
                            if (val === NEW_GROUP) {
                                target = (prompt('ตั้งชื่อโครงการใหม่:') || '').trim();
                                if (!target) return;
                            }
                            const plotName = system.projects[i]?.name;
                            if (confirm(`ย้ายแปลง "${plotName}" ไปโครงการ "${target}"?\n(ข้อมูล BOQ และประวัติทั้งหมดของแปลงคงเดิม)`)) {
                                setProjectGroupByIndex(i, target);
                            }
                        };
                        return allGroups.map(g => (
                            <div key={g}>
                                <div className="px-4 py-2 bg-slate-100 border-y border-slate-200 text-xs font-bold text-slate-600 flex items-center gap-2">
                                    <FaFolderOpen className="text-blue-400" /> {g}
                                    <span className="font-normal text-slate-400">
                                        ({system.projects.filter(p => getGroupOf(p) === g).length} แปลง)
                                    </span>
                                </div>
                                <div className="divide-y divide-slate-50">
                                    {system.projects.map((p, i) => ({ p, i })).filter(({ p }) => getGroupOf(p) === g).map(({ p, i }) => {
                                        const boqCount  = p.data?.boq?.filter(b => b.type === 'item').length ?? 0;
                                        const poCount   = p.data?.docs?.filter(d => d.type === 'PO').length  ?? 0;
                                        const puCount   = p.data?.docs?.filter(d => d.type === 'PU').length  ?? 0;
                                        const dvCount   = p.data?.docs?.filter(d => d.type === 'DV').length  ?? 0;
                                        return (
                                            <div key={i} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition">
                                                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500 font-bold text-sm flex-shrink-0">
                                                    {i + 1}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-bold text-slate-700">{p.name}</div>
                                                    <div className="flex gap-3 mt-0.5">
                                                        <span className="text-[10px] text-slate-400">BOQ {boqCount} รายการ</span>
                                                        <span className="text-[10px] text-orange-400">PO {poCount}</span>
                                                        <span className="text-[10px] text-green-500">PU {puCount}</span>
                                                        <span className="text-[10px] text-purple-500">DV {dvCount}</span>
                                                    </div>
                                                </div>
                                                {/* ย้ายโครงการ */}
                                                <select
                                                    value={g}
                                                    onChange={(e) => { handleMove(i, e.target.value); e.target.value = g; }}
                                                    title="ย้ายแปลงไปโครงการอื่น"
                                                    className="text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 text-slate-500 bg-white hover:border-blue-400 outline-none flex-shrink-0 max-w-[150px]"
                                                >
                                                    {allGroups.map(gr => <option key={gr} value={gr}>{gr}</option>)}
                                                    <option value={NEW_GROUP}>➕ โครงการใหม่…</option>
                                                </select>
                                                <div className="flex gap-1 flex-shrink-0">
                                                    <button onClick={() => openRename(i)} title="เปลี่ยนชื่อ"
                                                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
                                                        <FaEdit className="text-xs" />
                                                    </button>
                                                    <button onClick={() => handleDeleteProject(i)} title="ลบแปลง"
                                                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                                        disabled={system.projects.length <= 1}>
                                                        <FaTrash className="text-xs" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ));
                    })()}
                </div>
            )}

            {/* ══ Tab: Approval Settings ══════════════════════════════════════════ */}
            {activeTab === 'approval' && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden max-w-2xl">
                    <div className="p-4 border-b border-slate-100">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2">
                            <FaClipboardCheck className="text-amber-500" /> การอนุมัติงานของวิศวกร (role PROJECT)
                        </h3>
                        <p className="text-xs text-slate-400 mt-1">
                            เมื่อเปิดใช้ งานที่วิศวกรบันทึกจะค้างสถานะ "รออนุมัติ" (ยังไม่นับเข้างบ/ยอด)
                            จนกว่า ADMIN หรือ DEV จะกดอนุมัติในเมนู "รออนุมัติ" — มีแจ้งเตือนทั้งสองฝั่ง
                        </p>
                    </div>
                    <div className="divide-y divide-slate-50">
                        {[
                            { key: 'po', label: 'เปิดใบสั่งจ้าง (PO)', desc: 'วิศวกรเปิด PO → รออนุมัติก่อนเข้าระบบ' },
                            { key: 'dv', label: 'เบิกค่าแรง (DV)',     desc: 'วิศวกรขอเบิกค่าแรง → รออนุมัติก่อนตัดยอด' },
                        ].map(({ key, label, desc }) => (
                            <div key={key} className="flex items-center gap-4 px-4 py-4">
                                <div className="flex-1">
                                    <div className="font-bold text-slate-700 text-sm">{label}</div>
                                    <div className="text-xs text-slate-400 mt-0.5">{desc}</div>
                                </div>
                                <button
                                    onClick={() => saveApprovalConfig({ ...approvalConfig, [key]: !approvalConfig[key] })}
                                    className="text-3xl transition"
                                    title={approvalConfig[key] ? 'ปิดการอนุมัติ' : 'เปิดการอนุมัติ'}
                                >
                                    {approvalConfig[key]
                                        ? <FaToggleOn className="text-green-500" />
                                        : <FaToggleOff className="text-slate-300" />}
                                </button>
                            </div>
                        ))}
                    </div>
                    <div className="px-4 py-3 bg-amber-50 border-t border-amber-100 text-xs text-amber-700">
                        💡 ปิดสวิตช์ = วิศวกรบันทึกได้ตรงเหมือนเดิม · การแก้ไข Master BOQ ของวิศวกรยังเป็น "ดูอย่างเดียว" ตามสิทธิ์เดิม
                    </div>
                </div>
            )}

            {/* ══ Tab: Cancel DV ══════════════════════════════════════════════════ */}
            {activeTab === 'canceldv' && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-100">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2">
                            <FaHardHat className="text-purple-500" /> ยกเลิกใบเบิกค่าแรง (DV)
                        </h3>
                        <p className="text-xs text-slate-400 mt-1">
                            ลบใบเบิกออกจากประวัติ พร้อมถอนยอด "จ่าย" ที่ผูกกับรายการใน Master BOQ
                            — ช่องจ่าย/เหลือจะคืนค่ากลับเหมือนก่อนเบิก (บันทึกใน Audit Log)
                        </p>
                    </div>
                    {(() => {
                        const allDVs = system.projects.flatMap((p, i) =>
                            (p.data?.docs || [])
                                .filter(d => d.type === 'DV')
                                .map(d => ({
                                    ...d,
                                    plotIndex: i,
                                    plotName: p.name,
                                    groupName: p.group || 'โครงการหลัก',
                                    total: (d.items || []).reduce((s, it) => s + (parseFloat(it.amount) || 0), 0),
                                }))
                        ).sort((a, b) => new Date(b.date) - new Date(a.date));

                        const handleCancelDV = (dv) => {
                            const detail = (dv.items || []).map(it => `- ${it.name}: ${(parseFloat(it.amount) || 0).toLocaleString('th-TH')} บาท`).join('\n');
                            if (!confirm(
                                `⚠️ ยกเลิกใบเบิก ${dv.no} ?\n\n` +
                                `แปลง: ${dv.plotName} [${dv.groupName}]\nจ่ายให้: ${dv.payee}\nยอดรวม: ${dv.total.toLocaleString('th-TH')} บาท\n\n${detail}\n\n` +
                                `ยอด "จ่าย" ใน Master BOQ จะถูกถอนคืน และใบนี้จะหายจากประวัติ`
                            )) return;
                            const res = cancelDVByIndex(dv.plotIndex, dv.id);
                            if (res.ok) {
                                alert(`✅ ยกเลิก ${res.no} เรียบร้อย — ถอนยอด ${res.removed} รายการ` +
                                    (res.missed ? `\n⚠️ มี ${res.missed} รายการที่จับคู่ยอดไม่ได้ (อาจถูกแก้ไขไว้ก่อน)` : ''));
                            } else {
                                alert('❌ ' + (res.msg || 'ยกเลิกไม่สำเร็จ'));
                            }
                        };

                        if (allDVs.length === 0) return (
                            <div className="py-12 text-center text-slate-400 text-sm">ไม่มีใบเบิกค่าแรงในระบบ</div>
                        );
                        return (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 border-b border-slate-100">
                                        <tr>
                                            <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">เลขที่</th>
                                            <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">โครงการ / แปลง</th>
                                            <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">จ่ายให้</th>
                                            <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase">ยอดรวม</th>
                                            <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase">รายการ</th>
                                            <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">วันที่</th>
                                            <th className="px-4 py-3"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {allDVs.map(dv => (
                                            <tr key={`${dv.plotIndex}-${dv.id}`} className="hover:bg-slate-50 transition">
                                                <td className="px-4 py-3 font-bold text-purple-700">{dv.no}</td>
                                                <td className="px-4 py-3 text-slate-600">
                                                    <span className="text-xs text-slate-400">[{dv.groupName}]</span> {dv.plotName}
                                                </td>
                                                <td className="px-4 py-3 font-bold text-slate-700">{dv.payee}</td>
                                                <td className="px-4 py-3 text-right font-mono font-bold text-slate-700">
                                                    {dv.total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-4 py-3 text-center text-slate-500">{(dv.items || []).length}</td>
                                                <td className="px-4 py-3 text-xs text-slate-400">
                                                    {new Date(dv.date).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <button
                                                        onClick={() => handleCancelDV(dv)}
                                                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-600 border border-red-200 hover:bg-red-50 transition flex items-center gap-1.5 ml-auto"
                                                        title="ยกเลิกใบเบิกนี้ และคืนยอดใน Master BOQ"
                                                    >
                                                        <FaUndo size={10} /> ยกเลิกใบเบิก
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* ══ Tab: Login History ══════════════════════════════════════════════ */}
            {activeTab === 'login' && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="flex justify-between items-center p-4 border-b border-slate-100">
                        <h3 className="font-bold text-slate-700">
                            ประวัติการเข้าสู่ระบบ
                            <span className="ml-2 text-xs font-normal text-slate-400">({loginHistory.length} ครั้งล่าสุด)</span>
                        </h3>
                        <button onClick={fetchLoginHistory} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition">
                            <FaSync className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">ผู้ใช้</th>
                                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Email</th>
                                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Role</th>
                                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">เวลา Login</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {loginHistory.map(entry => (
                                    <tr key={entry.id} className="hover:bg-slate-50 transition">
                                        <td className="px-4 py-3 font-bold text-slate-700">{entry.username}</td>
                                        <td className="px-4 py-3 text-slate-500 text-xs">{entry.email}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${ROLE_COLORS[entry.role] || ROLE_COLORS.USER}`}>{entry.role}</span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-500 text-sm">{fmt(entry.loginAt)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {loginHistory.length === 0 && !loading && <div className="text-center py-12 text-slate-400 text-sm">ยังไม่มีประวัติการเข้าสู่ระบบ</div>}
                    {loading && <div className="text-center py-12 text-slate-400 text-sm">กำลังโหลด...</div>}
                </div>
            )}

            {/* ══ Tab: Audit Log ══════════════════════════════════════════════════ */}
            {activeTab === 'audit' && (() => {
                const uniqueUsers   = [...new Set(auditLogs.map(l => l.username).filter(Boolean))];
                const uniqueActions = [...new Set(auditLogs.map(l => l.action).filter(Boolean))];
                return (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="flex flex-wrap justify-between items-center gap-3 p-4 border-b border-slate-100">
                            <h3 className="font-bold text-slate-700">
                                Audit Log
                                <span className="ml-2 text-xs font-normal text-slate-400">({filteredAudit.length}/{auditLogs.length} รายการ)</span>
                            </h3>
                            <div className="flex gap-2 items-center flex-wrap">
                                <select value={filterUser} onChange={e => setFilterUser(e.target.value)}
                                    className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-purple-400 bg-white text-slate-600">
                                    <option value="">ผู้ใช้ทั้งหมด</option>
                                    {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                                <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
                                    className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-purple-400 bg-white text-slate-600">
                                    <option value="">การกระทำทั้งหมด</option>
                                    {uniqueActions.map(a => <option key={a} value={a}>{ACTION_LABELS[a] || a}</option>)}
                                </select>
                                {(filterUser || filterAction) && (
                                    <button onClick={() => { setFilterUser(''); setFilterAction(''); }}
                                        className="text-xs text-slate-400 hover:text-red-500 transition px-1">ล้าง</button>
                                )}
                                <button onClick={exportAuditCSV} title="Export CSV"
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition shadow-sm">
                                    <FaFileDownload /> Export CSV
                                </button>
                                <button onClick={fetchAuditLogs} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition">
                                    <FaSync className={loading ? 'animate-spin' : ''} />
                                </button>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 border-b border-slate-100">
                                    <tr>
                                        <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-36">ผู้ดำเนินการ</th>
                                        <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-32">การกระทำ</th>
                                        <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-28">โครงการ</th>
                                        <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">รายละเอียด</th>
                                        <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-36">เวลา</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {filteredAudit.map(log => (
                                        <tr key={log.id} className="hover:bg-slate-50 transition">
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-slate-700 text-xs">{log.username}</div>
                                                <div className="text-[10px] text-slate-400">{log.email}</div>
                                            </td>
                                            <td className="px-4 py-3"><ActionBadge action={log.action} /></td>
                                            <td className="px-4 py-3 text-slate-500 text-xs">{log.projectName || '-'}</td>
                                            <td className="px-4 py-3 text-slate-600 text-xs leading-relaxed">
                                                {log.details ? log.details.split(' | ').map((part, i) => (
                                                    <span key={i} className="inline-block mr-2">
                                                        {i > 0 && <span className="text-slate-300 mr-2">|</span>}{part}
                                                    </span>
                                                )) : <span className="text-slate-300">-</span>}
                                            </td>
                                            <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{fmt(log.timestamp)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {filteredAudit.length === 0 && !loading && (
                            <div className="text-center py-12 text-slate-400 text-sm">
                                {auditLogs.length === 0 ? 'ยังไม่มี Audit Log' : 'ไม่พบรายการที่ตรงกับ filter'}
                            </div>
                        )}
                        {loading && <div className="text-center py-12 text-slate-400 text-sm">กำลังโหลด...</div>}
                    </div>
                );
            })()}

            {/* ══ Tab: Permissions ════════════════════════════════════════════════ */}
            {activeTab === 'permissions' && isDev && (
                <PermissionsTab permissions={permissions} onSave={savePermissions} />
            )}

            {/* ══ Tab: Notifications ══════════════════════════════════════════════ */}
            {activeTab === 'notifications' && isDev && (
                <NotificationsTab
                    notifications={notifications}
                    onCreate={createNotification}
                    onEdit={updateNotification}
                    onDelete={deleteNotification}
                    onToggle={toggleNotificationActive}
                    currentUser={user}
                />
            )}

            {/* ══ Tab: System Control ══════════════════════════════════════════════ */}
            {activeTab === 'system' && isDev && (
                <div className="space-y-5 max-w-lg">
                    <h3 className="font-bold text-slate-700">ควบคุมระบบ</h3>

                    {/* Maintenance Mode Card */}
                    <div className={`rounded-2xl border-2 p-5 transition-all ${maintenanceMode ? 'border-orange-300 bg-orange-50' : 'border-slate-200 bg-white'}`}>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${maintenanceMode ? 'bg-orange-200' : 'bg-slate-100'}`}>
                                    🔧
                                </div>
                                <div>
                                    <p className="font-bold text-slate-800">Maintenance Mode</p>
                                    <p className="text-xs text-slate-500">บล็อก non-DEV ทั้งหมดออกจากระบบ</p>
                                </div>
                            </div>
                            <button
                                onClick={async () => {
                                    const newState = !maintenanceMode;
                                    if (newState && !confirm('เปิด Maintenance Mode?\n\nผู้ใช้ทุกคนยกเว้น DEV จะเห็นหน้า "ระบบปิดปรับปรุง" ทันที')) return;
                                    await saveMaintenance(newState, maintenanceMessage);
                                }}
                                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none ${maintenanceMode ? 'bg-orange-500' : 'bg-slate-300'}`}
                            >
                                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${maintenanceMode ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>

                        <div className={`text-xs font-bold mb-1 ${maintenanceMode ? 'text-orange-700' : 'text-slate-500'}`}>
                            สถานะ: {maintenanceMode ? '🔴 เปิดอยู่ — ระบบปิดให้บริการ' : '🟢 ปิดอยู่ — ระบบทำงานปกติ'}
                        </div>

                        <div className="mt-4 space-y-2">
                            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide">ข้อความแจ้งผู้ใช้</label>
                            <textarea
                                rows={3}
                                value={maintMsgDraft || maintenanceMessage}
                                onChange={e => setMaintMsgDraft(e.target.value)}
                                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition resize-none"
                                placeholder="ข้อความที่จะแสดงให้ผู้ใช้เห็น..."
                            />
                            <button
                                disabled={maintSaving || !(maintMsgDraft && maintMsgDraft !== maintenanceMessage)}
                                onClick={async () => {
                                    setMaintSaving(true);
                                    await saveMaintenance(maintenanceMode, maintMsgDraft);
                                    setMaintMsgDraft('');
                                    setMaintSaving(false);
                                }}
                                className="px-4 py-1.5 bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition disabled:opacity-40"
                            >
                                {maintSaving ? 'กำลังบันทึก...' : 'บันทึกข้อความ'}
                            </button>
                        </div>
                    </div>

                </div>
            )}

            {/* ══ Modal: Edit User ════════════════════════════════════════════════ */}
            {showEditModal && editUser && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
                        <div className="flex justify-between items-center p-5 border-b border-slate-100">
                            <h3 className="font-bold text-slate-700 text-lg flex items-center gap-2">
                                <FaEdit className="text-blue-500" /> แก้ไขผู้ใช้
                            </h3>
                            <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-700 p-1 rounded"><FaTimes /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="text-xs text-slate-400 bg-slate-50 p-2 rounded-lg">{editUser.email}</div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">ชื่อที่แสดง</label>
                                <input value={editForm.username} onChange={e => setEditForm(f => ({ ...f, username: e.target.value }))}
                                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Role</label>
                                <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-500 bg-white">
                                    <option value="USER">USER — พนักงานทั่วไป</option>
                                    <option value="PROJECT">PROJECT — วิศวกรโครงการ</option>
                                    <option value="ADMIN">ADMIN — ผู้บริหาร</option>
                                    <option value="DEV">DEV — นักพัฒนา</option>
                                </select>
                            </div>
                            <div className="border-t border-slate-100 pt-3">
                                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">รหัสผ่าน</label>
                                {pwResetSent ? (
                                    <p className="text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-lg">
                                        ✓ ส่งลิงก์รีเซ็ตรหัสผ่านไปที่ <strong>{editUser.email}</strong> แล้ว
                                    </p>
                                ) : (
                                    <button type="button" onClick={sendPasswordReset} disabled={pwResetLoading}
                                        className="w-full py-2 bg-orange-50 border border-orange-200 text-orange-700 text-xs font-bold rounded-lg hover:bg-orange-100 active:bg-orange-200 transition disabled:opacity-50 flex items-center justify-center gap-1.5">
                                        <FaPaperPlane className="text-[11px]" />
                                        {pwResetLoading ? 'กำลังส่ง...' : 'ส่งลิงก์รีเซ็ตรหัสผ่านทางอีเมล'}
                                    </button>
                                )}
                            </div>
                            <div className="flex gap-2 pt-1">
                                <button onClick={() => setShowEditModal(false)}
                                    className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm font-bold rounded-xl hover:bg-slate-50 transition">ยกเลิก</button>
                                <button onClick={saveEditUser} disabled={editSaving}
                                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition disabled:opacity-50">
                                    {editSaving ? 'กำลังบันทึก...' : 'บันทึก'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ══ Modal: Project Access ════════════════════════════════════════════ */}
            {showAccessModal && accessUser && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
                        <div className="flex justify-between items-center p-5 border-b border-slate-100">
                            <div>
                                <h3 className="font-bold text-slate-700 text-lg flex items-center gap-2">
                                    <FaLock className="text-purple-500" /> สิทธิ์โครงการ
                                </h3>
                                <p className="text-xs text-slate-400 mt-0.5">{accessUser.username} ({accessUser.email})</p>
                            </div>
                            <button onClick={() => setShowAccessModal(false)} className="text-slate-400 hover:text-slate-700 p-1 rounded"><FaTimes /></button>
                        </div>
                        <div className="p-5 space-y-3">
                            <p className="text-xs text-slate-500">เลือกโครงการและแปลนบ้าน/แปลงบ้านที่บัญชีนี้สามารถมองเห็นได้</p>
                            <div className="flex gap-3 text-xs mb-1">
                                <button onClick={() => setAccessSelections([...allAccessKeys])} className="text-blue-500 hover:text-blue-700 font-medium">เลือกทั้งหมด</button>
                                <span className="text-slate-300">|</span>
                                <button onClick={() => setAccessSelections([])} className="text-slate-400 hover:text-slate-600">ล้างทั้งหมด</button>
                            </div>
                            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                                {accessGroups.map(group => {
                                    const groupProjects = accessProjects.filter(p => p.group === group);
                                    const selectedCount = groupProjects.filter(p => accessSelections.includes(p.key)).length;
                                    const allSelected = selectedCount === groupProjects.length;
                                    const toggleGroup = () => setAccessSelections(prev => allSelected
                                        ? prev.filter(key => !groupProjects.some(p => p.key === key))
                                        : [...new Set([...prev, ...groupProjects.map(p => p.key)])]);
                                    return (
                                        <div key={group} className="rounded-xl border border-slate-200 overflow-hidden">
                                            <label className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 cursor-pointer hover:bg-purple-50 transition">
                                                <input type="checkbox" checked={allSelected} onChange={toggleGroup} className="w-4 h-4 accent-purple-600" />
                                                <FaFolderOpen className="text-blue-400" />
                                                <span className="text-sm font-bold text-slate-700 flex-1">{group}</span>
                                                <span className="text-[10px] text-slate-400">{selectedCount}/{groupProjects.length} แปลง</span>
                                            </label>
                                            <div className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                                {groupProjects.map(project => (
                                                    <label key={project.key} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-purple-50 cursor-pointer transition">
                                                        <input type="checkbox" checked={accessSelections.includes(project.key)} onChange={() => toggleAccessProject(project.key)} className="w-4 h-4 accent-purple-600" />
                                                        <span className="text-xs font-medium text-slate-700 flex-1">{project.name}</span>
                                                        {accessSelections.includes(project.key) ? <FaUnlock className="text-green-400 text-[10px]" /> : <FaLock className="text-red-300 text-[10px]" />}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            {accessSelections.length === 0 && (
                                <div className="text-xs text-red-500 bg-red-50 border border-red-100 p-2 rounded-lg">⚠️ ผู้ใช้จะไม่เห็นโครงการใดเลย</div>
                            )}
                            <div className="flex gap-2 pt-1">
                                <button onClick={() => setShowAccessModal(false)}
                                    className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm font-bold rounded-xl hover:bg-slate-50 transition">ยกเลิก</button>
                                <button onClick={saveProjectAccess} disabled={accessSaving}
                                    className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-xl transition disabled:opacity-50">
                                    {accessSaving ? 'กำลังบันทึก...' : 'บันทึกสิทธิ์'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ══ Modal: Add Project ═══════════════════════════════════════════════ */}
            {showAddProject && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
                        <div className="flex justify-between items-center p-5 border-b border-slate-100">
                            <h3 className="font-bold text-slate-700 text-lg flex items-center gap-2">
                                <FaPlus className="text-green-500" /> เพิ่มโครงการใหม่
                            </h3>
                            <button onClick={() => setShowAddProject(false)} className="text-slate-400 hover:text-slate-700 p-1 rounded"><FaTimes /></button>
                        </div>
                        <form onSubmit={handleAddProject} className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">ชื่อโครงการ</label>
                                <input value={newProjectName} onChange={e => setNewProjectName(e.target.value)} placeholder="เช่น โครงการ ABC"
                                    required className="w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 transition" />
                            </div>
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setShowAddProject(false)}
                                    className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm font-bold rounded-xl hover:bg-slate-50 transition">ยกเลิก</button>
                                <button type="submit"
                                    className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-xl transition">สร้างโครงการ</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ══ Modal: Rename Project ════════════════════════════════════════════ */}
            {showRenameModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
                        <div className="flex justify-between items-center p-5 border-b border-slate-100">
                            <h3 className="font-bold text-slate-700 text-lg flex items-center gap-2">
                                <FaEdit className="text-blue-500" /> เปลี่ยนชื่อโครงการ
                            </h3>
                            <button onClick={() => setShowRenameModal(false)} className="text-slate-400 hover:text-slate-700 p-1 rounded"><FaTimes /></button>
                        </div>
                        <form onSubmit={saveRename} className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">ชื่อใหม่</label>
                                <input value={renameName} onChange={e => setRenameName(e.target.value)}
                                    required className="w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition" />
                            </div>
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setShowRenameModal(false)}
                                    className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm font-bold rounded-xl hover:bg-slate-50 transition">ยกเลิก</button>
                                <button type="submit"
                                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition">บันทึก</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ══ Modal: Create User ═══════════════════════════════════════════════ */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="flex justify-between items-center p-5 border-b border-slate-100">
                            <h3 className="font-bold text-slate-700 text-lg flex items-center gap-2">
                                <FaUserPlus className="text-purple-500" /> สร้าง ID ใหม่
                            </h3>
                            <button onClick={() => { setShowCreateModal(false); setCreateError(''); setForm(EMPTY_FORM); }}
                                className="text-slate-400 hover:text-slate-700 p-1 rounded"><FaTimes /></button>
                        </div>
                        <form onSubmit={handleCreateUser} className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">ชื่อที่แสดงในระบบ</label>
                                <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                                    placeholder="เช่น ช่างสมชาย" required
                                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Username / Email</label>
                                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                                    placeholder="เช่น staff2 หรือ staff2@nutcon.com" required
                                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition" />
                                <p className="text-xs text-slate-400 mt-1">พิมพ์แค่ username ระบบเติม @nutcon.com ให้อัตโนมัติ</p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">รหัสผ่าน</label>
                                <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                                    placeholder="อย่างน้อย 6 ตัวอักษร" required minLength={6}
                                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Role</label>
                                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-purple-500 bg-white">
                                    <option value="USER">USER — พนักงานทั่วไป</option>
                                    <option value="PROJECT">PROJECT — วิศวกรโครงการ</option>
                                    <option value="ADMIN">ADMIN — ผู้บริหาร</option>
                                    <option value="DEV">DEV — นักพัฒนา</option>
                                </select>
                            </div>
                            {createError && <div className="text-red-600 text-xs bg-red-50 border border-red-200 p-3 rounded-lg">{createError}</div>}
                            <button type="submit" disabled={createLoading}
                                className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2">
                                {createLoading ? <><FaSync className="animate-spin" /> กำลังสร้าง...</> : <><FaUserPlus /> สร้าง ID</>}
                            </button>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
};

// ─── PermissionsTab ──────────────────────────────────────────────────────────
const PermissionsTab = ({ permissions, onSave }) => {
    const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(permissions)));
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const toggle = (role, key) => {
        setDraft(prev => {
            const next = JSON.parse(JSON.stringify(prev));
            const newVal = !next[role][key];
            next[role][key] = newVal;
            // ถ้าปิด ADMIN → ปิด USER ด้วย (hierarchy)
            if (role === 'ADMIN' && !newVal) next.USER[key] = false;
            return next;
        });
        setSaved(false);
    };

    const handleSave = async () => {
        setSaving(true);
        await onSave(draft);
        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                        <FaShieldAlt className="text-purple-500" /> สิทธิ์การเข้าถึงฟีเจอร์
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                        DEV มีสิทธิ์ทุกอย่างเสมอ · USER ไม่สามารถมีสิทธิ์เกิน ADMIN · PROJECT อิสระ
                    </p>
                </div>
                <button onClick={handleSave} disabled={saving}
                    className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-purple-700 transition disabled:opacity-50 shadow-sm">
                    {saving ? <FaSync className="animate-spin text-xs" /> : <FaSave className="text-xs" />}
                    {saving ? 'กำลังบันทึก...' : saved ? '✓ บันทึกแล้ว' : 'บันทึกสิทธิ์'}
                </button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                            <th className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">ฟีเจอร์</th>
                            <th className="px-5 py-3 text-center text-xs font-bold text-purple-600 uppercase tracking-wider w-28">
                                DEV
                                <div className="text-[9px] font-normal text-purple-300 normal-case mt-0.5">ทุกอย่างเสมอ</div>
                            </th>
                            <th className="px-5 py-3 text-center text-xs font-bold text-blue-600 uppercase tracking-wider w-28">
                                ADMIN
                                <div className="text-[9px] font-normal text-blue-300 normal-case mt-0.5">ผู้บริหาร</div>
                            </th>
                            <th className="px-5 py-3 text-center text-xs font-bold text-green-600 uppercase tracking-wider w-28">
                                PROJECT
                                <div className="text-[9px] font-normal text-green-300 normal-case mt-0.5">วิศวกรโครงการ</div>
                            </th>
                            <th className="px-5 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider w-28">
                                USER
                                <div className="text-[9px] font-normal text-slate-400 normal-case mt-0.5">พนักงานทั่วไป</div>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {PERM_FEATURES.map(f => (
                            <tr key={f.key} className="hover:bg-slate-50 transition">
                                <td className="px-5 py-3.5">
                                    <div className="font-semibold text-slate-700">{f.label}</div>
                                    <div className="text-[11px] text-slate-400 mt-0.5">{f.desc}</div>
                                </td>

                                {/* DEV — always on, locked */}
                                <td className="px-5 py-3.5 text-center">
                                    <FaToggleOn className="text-2xl text-purple-300 mx-auto opacity-60" />
                                </td>

                                {/* ADMIN */}
                                <td className="px-5 py-3.5 text-center">
                                    <button onClick={() => toggle('ADMIN', f.key)}
                                        className={`text-2xl transition mx-auto block ${draft.ADMIN[f.key] ? 'text-blue-500 hover:text-blue-600' : 'text-slate-300 hover:text-slate-400'}`}>
                                        {draft.ADMIN[f.key] ? <FaToggleOn /> : <FaToggleOff />}
                                    </button>
                                </td>

                                {/* PROJECT — อิสระ ไม่ขึ้นกับ ADMIN */}
                                <td className="px-5 py-3.5 text-center">
                                    <button onClick={() => toggle('PROJECT', f.key)}
                                        className={`text-2xl transition mx-auto block ${draft.PROJECT?.[f.key] ? 'text-green-500 hover:text-green-600' : 'text-slate-300 hover:text-slate-400'}`}>
                                        {draft.PROJECT?.[f.key] ? <FaToggleOn /> : <FaToggleOff />}
                                    </button>
                                </td>

                                {/* USER — locked ถ้า ADMIN ไม่มี */}
                                <td className="px-5 py-3.5 text-center">
                                    <button
                                        onClick={() => draft.ADMIN[f.key] && toggle('USER', f.key)}
                                        title={!draft.ADMIN[f.key] ? 'ADMIN ต้องมีสิทธิ์นี้ก่อน' : ''}
                                        className={`text-2xl transition mx-auto block ${
                                            !draft.ADMIN[f.key]
                                                ? 'text-slate-200 cursor-not-allowed'
                                                : draft.USER[f.key]
                                                    ? 'text-slate-500 hover:text-slate-600'
                                                    : 'text-slate-300 hover:text-slate-400'
                                        }`}>
                                        {draft.USER[f.key] && draft.ADMIN[f.key] ? <FaToggleOn /> : <FaToggleOff />}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Legend */}
                <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex gap-4 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1"><FaToggleOn className="text-blue-400" /> เปิดสิทธิ์</span>
                    <span className="flex items-center gap-1"><FaToggleOff className="text-slate-300" /> ปิดสิทธิ์</span>
                    <span className="flex items-center gap-1"><FaLock className="text-slate-200" /> ล็อค (ระดับสูงกว่าต้องเปิดก่อน)</span>
                </div>
            </div>
        </div>
    );
};

// ─── NotificationsTab ────────────────────────────────────────────────────────

const NOTI_TYPES = [
    { value: 'info',    label: 'ข้อมูลทั่วไป',  color: 'text-blue-600',  bg: 'bg-blue-50',  icon: '💬' },
    { value: 'success', label: 'สำเร็จ/ดี',     color: 'text-green-600', bg: 'bg-green-50', icon: '✅' },
    { value: 'warning', label: 'คำเตือน',       color: 'text-amber-600', bg: 'bg-amber-50', icon: '⚠️' },
    { value: 'error',   label: 'แจ้งปัญหาเร่งด่วน', color: 'text-red-600', bg: 'bg-red-50', icon: '🚨' },
];

const EMPTY_NOTI = {
    title: '', message: '', type: 'info',
    targetType: 'all', targetRoles: [], targetUids: '',
    expiresAt: '', isActive: true,
};

const NotificationsTab = ({ notifications, onCreate, onEdit, onDelete, onToggle, currentUser }) => {
    const [showForm,  setShowForm]  = useState(false);
    const [editId,    setEditId]    = useState(null); // null = create mode, string = edit mode
    const [form,      setForm]      = useState(EMPTY_NOTI);
    const [saving,    setSaving]    = useState(false);
    const [error,     setError]     = useState('');

    const openCreate = () => {
        setEditId(null);
        setForm(EMPTY_NOTI);
        setError('');
        setShowForm(true);
    };

    const openEdit = (n) => {
        setEditId(n.id);
        setForm({
            title:       n.title       || '',
            message:     n.message     || '',
            type:        n.type        || 'info',
            targetType:  n.targetType  || 'all',
            targetRoles: n.targetRoles || [],
            targetUids:  (n.targetUids || []).join(', '),
            expiresAt:   n.expiresAt   ? n.expiresAt.slice(0, 16) : '',
            isActive:    n.isActive    !== false,
        });
        setError('');
        setShowForm(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.title.trim() || !form.message.trim()) { setError('กรุณากรอกหัวข้อและข้อความ'); return; }
        setSaving(true);
        setError('');
        const payload = {
            title:       form.title.trim(),
            message:     form.message.trim(),
            type:        form.type,
            targetType:  form.targetType,
            targetRoles: form.targetType === 'roles' ? form.targetRoles : [],
            targetUids:  form.targetType === 'users'
                ? form.targetUids.split(',').map(s => s.trim()).filter(Boolean)
                : [],
            expiresAt:   form.expiresAt || null,
            isActive:    editId ? form.isActive : true,
        };
        const ok = editId ? await onEdit(editId, payload) : await onCreate(payload);
        if (ok !== false) {
            setForm(EMPTY_NOTI);
            setShowForm(false);
            setEditId(null);
        } else {
            setError('เกิดข้อผิดพลาด กรุณาลองใหม่');
        }
        setSaving(false);
    };

    const toggleRole = (role) => {
        setForm(f => ({
            ...f,
            targetRoles: f.targetRoles.includes(role)
                ? f.targetRoles.filter(r => r !== role)
                : [...f.targetRoles, role],
        }));
    };

    const fmtShort = (iso) => {
        if (!iso) return '-';
        return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    const typeStyle = (type) => NOTI_TYPES.find(t => t.value === type) || NOTI_TYPES[0];

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                        <FaBell className="text-amber-500" /> จัดการการแจ้งเตือน
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">สร้างและจัดการ notification ที่ผู้ใช้จะเห็น</p>
                </div>
                <button
                    onClick={openCreate}
                    className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-bold transition shadow-sm"
                >
                    <FaPlus className="text-xs" /> สร้างการแจ้งเตือน
                </button>
            </div>

            {/* Create Form */}
            {showForm && (
                <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <FaBell className="text-amber-500" />
                            <span className="font-bold text-amber-800 text-sm">
                                {editId ? 'แก้ไขการแจ้งเตือน' : 'สร้างการแจ้งเตือนใหม่'}
                            </span>
                        </div>
                        <button type="button" onClick={() => { setShowForm(false); setEditId(null); }}
                            className="text-amber-400 hover:text-amber-700 p-1 rounded">
                            <FaTimes className="text-xs" />
                        </button>
                    </div>
                    <form onSubmit={handleSubmit} className="p-5 space-y-4">
                        {/* Type */}
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wide">ประเภท</label>
                            <div className="flex gap-2 flex-wrap">
                                {NOTI_TYPES.map(t => (
                                    <button key={t.value} type="button"
                                        onClick={() => setForm(f => ({ ...f, type: t.value }))}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition
                                            ${form.type === t.value
                                                ? `${t.bg} ${t.color} border-current shadow-sm`
                                                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                                    >
                                        {t.icon} {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Title + Message */}
                        <div className="grid grid-cols-1 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">หัวข้อ</label>
                                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                                    placeholder="เช่น แจ้งปิดระบบชั่วคราว" required
                                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">ข้อความ</label>
                                <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                                    placeholder="รายละเอียดของการแจ้งเตือน..." required rows={3}
                                    className="w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition resize-none" />
                            </div>
                        </div>

                        {/* Target */}
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wide">ส่งถึง</label>
                            <div className="flex gap-2 flex-wrap mb-3">
                                {[
                                    { value: 'all',   label: 'ทุกคน',      icon: <FaGlobe className="text-xs" /> },
                                    { value: 'roles', label: 'ตาม Role',   icon: <FaUserTag className="text-xs" /> },
                                    { value: 'users', label: 'ระบุ UID',   icon: <FaUsers className="text-xs" /> },
                                ].map(opt => (
                                    <button key={opt.value} type="button"
                                        onClick={() => setForm(f => ({ ...f, targetType: opt.value }))}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition
                                            ${form.targetType === opt.value
                                                ? 'bg-blue-50 text-blue-600 border-blue-300 shadow-sm'
                                                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                                    >
                                        {opt.icon} {opt.label}
                                    </button>
                                ))}
                            </div>

                            {form.targetType === 'roles' && (
                                <div className="flex gap-2 flex-wrap">
                                    {['ADMIN', 'PROJECT', 'USER'].map(role => (
                                        <label key={role} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 hover:border-blue-300 cursor-pointer transition">
                                            <input type="checkbox" checked={form.targetRoles.includes(role)} onChange={() => toggleRole(role)}
                                                className="w-3.5 h-3.5 accent-blue-600" />
                                            <span className={`text-xs font-bold ${role === 'PROJECT' ? 'text-green-700' : 'text-slate-600'}`}>{role}</span>
                                        </label>
                                    ))}
                                </div>
                            )}

                            {form.targetType === 'users' && (
                                <div>
                                    <input value={form.targetUids} onChange={e => setForm(f => ({ ...f, targetUids: e.target.value }))}
                                        placeholder="UID1, UID2, UID3 (คั่นด้วย ,)"
                                        className="w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition font-mono text-xs" />
                                    <p className="text-[10px] text-slate-400 mt-1">UID ของผู้ใช้จาก Firebase Auth (หาได้ในแท็บ ผู้ใช้)</p>
                                </div>
                            )}
                        </div>

                        {/* Expiry */}
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
                                วันหมดอายุ <span className="normal-case font-normal text-slate-400">(ไม่กำหนด = ไม่หมดอายุ)</span>
                            </label>
                            <input type="datetime-local" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                                className="p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-amber-400 transition bg-white" />
                        </div>

                        {/* Active toggle — edit mode only */}
                        {editId && (
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">สถานะ</span>
                                <button type="button" onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                                    className={`text-2xl transition ${form.isActive ? 'text-green-500' : 'text-slate-300'}`}>
                                    {form.isActive ? <FaToggleOn /> : <FaToggleOff />}
                                </button>
                                <span className="text-xs text-slate-500">{form.isActive ? 'เปิดการแจ้งเตือน' : 'ปิดการแจ้งเตือน'}</span>
                            </div>
                        )}

                        {error && <div className="text-red-600 text-xs bg-red-50 border border-red-200 p-3 rounded-lg">{error}</div>}

                        <div className="flex gap-2 pt-1">
                            <button type="button" onClick={() => { setShowForm(false); setEditId(null); }}
                                className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm font-bold rounded-xl hover:bg-slate-50 transition">ยกเลิก</button>
                            <button type="submit" disabled={saving}
                                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2">
                                {saving
                                    ? <><FaSync className="animate-spin text-xs" /> กำลังบันทึก...</>
                                    : editId
                                        ? <><FaSave className="text-xs" /> บันทึกการแก้ไข</>
                                        : <><FaPaperPlane className="text-xs" /> ส่งการแจ้งเตือน</>}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Notification List */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                    <FaBell className="text-slate-400 text-sm" />
                    <span className="font-bold text-slate-600 text-sm">การแจ้งเตือนทั้งหมด ({notifications.length})</span>
                </div>

                {notifications.length === 0 ? (
                    <div className="py-10 text-center text-slate-400 text-sm">
                        <FaBell className="text-2xl mx-auto mb-2 opacity-30" />
                        <div>ยังไม่มีการแจ้งเตือน</div>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-50">
                        {notifications.map(n => {
                            const ts = typeStyle(n.type);
                            const targetLabel = n.targetType === 'all' ? 'ทุกคน'
                                : n.targetType === 'roles' ? `Role: ${(n.targetRoles || []).join(', ')}`
                                : `UID: ${(n.targetUids || []).length} คน`;
                            return (
                                <div key={n.id} className={`px-4 py-3 flex items-start gap-3 ${n.isActive ? '' : 'opacity-50'}`}>
                                    <span className="text-xl flex-shrink-0 mt-0.5">{ts.icon}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`font-bold text-sm ${ts.color}`}>{n.title}</span>
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${ts.bg} ${ts.color}`}>{ts.label}</span>
                                            {!n.isActive && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-400">ปิด</span>}
                                        </div>
                                        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{n.message}</p>
                                        <div className="flex gap-3 mt-1.5 flex-wrap">
                                            <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                                <FaGlobe className="text-[8px]" /> {targetLabel}
                                            </span>
                                            {n.expiresAt && (
                                                <span className="text-[10px] text-slate-400">หมดอายุ: {fmtShort(n.expiresAt)}</span>
                                            )}
                                            <span className="text-[10px] text-slate-300">{fmtShort(n.createdAt)}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        <button
                                            onClick={() => onToggle(n.id, n.isActive)}
                                            title={n.isActive ? 'ปิดการแจ้งเตือน' : 'เปิดการแจ้งเตือน'}
                                            className={`text-xl transition ${n.isActive ? 'text-green-500 hover:text-slate-400' : 'text-slate-300 hover:text-green-400'}`}
                                        >
                                            {n.isActive ? <FaToggleOn /> : <FaToggleOff />}
                                        </button>
                                        <button onClick={() => openEdit(n)}
                                            title="แก้ไข"
                                            className="p-1.5 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition">
                                            <FaEdit className="text-xs" />
                                        </button>
                                        <button onClick={() => {
                                            if (confirm(`ลบการแจ้งเตือน "${n.title}"?`)) onDelete(n.id);
                                        }}
                                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                                            <FaTrash className="text-xs" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default DevPanel;
