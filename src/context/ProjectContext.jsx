import React, { createContext, useState, useEffect, useContext, useMemo } from 'react';
import { db, auth } from '../firebase';
import { doc, setDoc, onSnapshot, collection, addDoc, getDocs, query, orderBy, limit, deleteDoc, getDoc, updateDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import {
    loadGisScript, requestToken, uploadToDrive, listDriveBackups, pruneOldDriveBackups,
    isDriveEnabled, saveDriveSession, clearDriveSession,
    getDriveStoredEmail, getDriveLastBackup, setDriveLastBackup, needsDailyBackup,
} from '../utils/googleDriveHelper';

const ProjectContext = createContext();

const MAX_HISTORY = 30;

// ชื่อโครงการ default สำหรับแปลงเดิมที่ยังไม่มี field group (backward compatible)
export const DEFAULT_GROUP = 'โครงการหลัก';
export const getGroupOf = (p) => p?.group || DEFAULT_GROUP;

export const DEFAULT_PERMISSIONS = {
    ADMIN:   { dashboard: true, boq: true, backup: true, monthlySummary: true, loginHistory: false, auditLog: false },
    USER:    { dashboard: false, boq: false, backup: false, monthlySummary: false, loginHistory: false, auditLog: false },
    PROJECT: { dashboard: false, boq: true, backup: false, monthlySummary: false, loginHistory: false, auditLog: false },
};

export const PERM_FEATURES = [
    { key: 'dashboard',      label: 'ภาพรวมโครงการ',         desc: 'หน้า Dashboard รวมทุกโครงการ' },
    { key: 'boq',            label: 'Master BOQ',              desc: 'แก้ไขบัญชีปริมาณงาน' },
    { key: 'backup',         label: 'Backup & Restore',        desc: 'สำรองและกู้คืนข้อมูล' },
    { key: 'monthlySummary', label: 'สรุปยอดรายเดือน',        desc: 'ดูสรุป PU/DV รายเดือนใน Dashboard' },
    { key: 'loginHistory',   label: 'ประวัติการเข้าสู่ระบบ',  desc: 'ดู Login History ของทุก user' },
    { key: 'auditLog',       label: 'Audit Log',               desc: 'ดู Audit Log การกระทำทั้งหมด' },
];

export const ProjectProvider = ({ children }) => {
    const [system, setSystem] = useState({
        active: 0,
        projects: [{ name: "โครงการเริ่มต้น", data: { boq: [], trans: [], docs: [], projectName: "โครงการเริ่มต้น" } }]
    });

    const [activeProjectIndex, setActiveProjectIndex] = useState(0);
    const [loading, setLoading] = useState(true);

    // --- Undo/Redo ---
    const [history, setHistory] = useState([]);
    const [future, setFuture] = useState([]);

    // Reset history เมื่อสลับโปรเจกต์
    useEffect(() => {
        setHistory([]);
        setFuture([]);
    }, [activeProjectIndex]);

    const [permissions, setPermissions] = useState(DEFAULT_PERMISSIONS);

    const [backupsList, setBackupsList] = useState([]);
    const [backupsLoading, setBackupsLoading] = useState(false);

    // --- Google Drive ---
    const [driveToken, setDriveToken] = useState(null);
    const [driveEmail, setDriveEmail] = useState(getDriveStoredEmail());
    const [driveLoading, setDriveLoading] = useState(false);
    const [driveBackupsList, setDriveBackupsList] = useState([]);
    const [driveLastBackup, setDriveLastBackupState] = useState(getDriveLastBackup());
    const [driveAutoBackupStatus, setDriveAutoBackupStatus] = useState(null); // 'running' | 'done' | 'error'

    const GDRIVE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

    const [user, setUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [authUid, setAuthUid] = useState(null); // รู้ UID ทันทีที่ auth ยืนยัน ก่อน profile โหลดเสร็จ

    const [maintenanceMode,    setMaintenanceModeState]    = useState(false);
    const [maintenanceMessage, setMaintenanceMessageState] = useState('ระบบปิดให้บริการชั่วคราวเพื่อปรับปรุง กรุณาติดต่อผู้ดูแลระบบ');

    // Maintenance Mode — real-time, โหลดทันทีไม่รอ auth
    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'system_config', 'global'), (snap) => {
            if (snap.exists()) {
                const d = snap.data();
                setMaintenanceModeState(!!d.maintenanceMode);
                setMaintenanceMessageState(d.maintenanceMessage || 'ระบบปิดให้บริการชั่วคราวเพื่อปรับปรุง');
            }
        }, () => {});
        return () => unsub();
    }, []);

    const saveMaintenance = async (enabled, message) => {
        await setDoc(doc(db, 'system_config', 'global'), { maintenanceMode: enabled, maintenanceMessage: message }, { merge: true });
    };

    // ==========================================
    // 1. Database (Real-time Sync) — เริ่มทันทีที่รู้ UID (ไม่รอ profile)
    // ==========================================
    useEffect(() => {
        if (!authUid) return; // รอ auth ก่อน — ป้องกัน permission error ก่อนล็อกอิน
        setLoading(true);
        const docRef = doc(db, "construction_data", "main_system");
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setSystem(data);
                if (activeProjectIndex >= data.projects.length) {
                    setActiveProjectIndex(0);
                }
            } else {
                const initialData = {
                    active: 0,
                    projects: [{ name: "โครงการเริ่มต้น", data: { boq: [], trans: [], docs: [], projectName: "โครงการเริ่มต้น" } }]
                };
                setDoc(docRef, initialData);
                setSystem(initialData);
            }
            setLoading(false);
        }, (error) => {
            console.error("Firebase Read Error:", error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [authUid]);

    // โหลด permissions จาก Firestore
    useEffect(() => {
        if (!authUid) return;
        getDoc(doc(db, 'system_config', 'permissions')).then(snap => {
            if (snap.exists()) {
                const stored = snap.data();
                setPermissions({
                    ADMIN:   { ...DEFAULT_PERMISSIONS.ADMIN,   ...stored.ADMIN },
                    USER:    { ...DEFAULT_PERMISSIONS.USER,    ...stored.USER },
                    PROJECT: { ...DEFAULT_PERMISSIONS.PROJECT, ...stored.PROJECT },
                });
            }
        }).catch(() => {});
    }, [authUid]);

    const savePermissions = async (newPerms) => {
        setPermissions(newPerms);
        try {
            await setDoc(doc(db, 'system_config', 'permissions'), newPerms);
        } catch (e) {
            console.error('savePermissions error:', e);
            alert('บันทึกสิทธิ์ไม่สำเร็จ: ' + e.message);
        }
    };

    // ตรวจสิทธิ์ — DEV เห็นทุกอย่าง, อื่นๆ ตาม permissions
    const can = (feature) => {
        if (!user) return false;
        if (user.role === 'DEV') return true;
        if (feature === 'devPanel') {
            return !!(permissions[user.role]?.loginHistory || permissions[user.role]?.auditLog);
        }
        return !!(permissions[user.role]?.[feature]);
    };

    // ลบค่า undefined ออกก่อน save (Firebase ไม่รับ undefined)
    const sanitize = (val) => JSON.parse(JSON.stringify(val, (_, v) => v === undefined ? null : v));

    const saveToFirebase = async (newSystem) => {
        try {
            const docRef = doc(db, "construction_data", "main_system");
            await setDoc(docRef, sanitize(newSystem));
        } catch (e) {
            console.error("Firebase Write Error: ", e);
            alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล: " + e.message);
        }
    };

    const currentProjectData = system.projects[activeProjectIndex]?.data || {};
    const currentProjectName = system.projects[activeProjectIndex]?.name || "";

    // --- Actions ---

    // Helper: สร้าง newSystem จาก data ใหม่
    const buildSystem = (newData) => {
        const newProjects = system.projects.map((p, i) =>
            i === activeProjectIndex ? { ...p, data: newData } : p
        );
        return { ...system, projects: newProjects };
    };

    // Audit log — บันทึกการกระทำของผู้ใช้ลง Firestore
    const logAudit = async (action, details = '') => {
        if (!user) return;
        try {
            await addDoc(collection(db, 'audit_logs'), {
                uid: user.uid,
                email: user.email,
                username: user.username,
                role: user.role,
                action,
                projectName: currentProjectName || '',
                details,
                timestamp: new Date().toISOString(),
            });
        } catch (e) {
            console.error('logAudit error:', e);
        }
    };

    // อัปเดตข้อมูลโครงการ — คืน Promise เพื่อให้ caller await ได้
    const updateProjectData = async (newData, auditAction = 'UPDATE_DATA', auditDetails = '') => {
        setHistory(prev => [...prev.slice(-(MAX_HISTORY - 1)), currentProjectData]);
        setFuture([]);
        const newSystem = buildSystem(newData);
        setSystem(newSystem);
        await saveToFirebase(newSystem);
        logAudit(auditAction, auditDetails);
    };

    // ย้อนกลับ
    const undo = async () => {
        if (history.length === 0) return;
        const prevData = history[history.length - 1];
        setFuture(f => [currentProjectData, ...f.slice(0, MAX_HISTORY - 1)]);
        setHistory(h => h.slice(0, -1));
        const newSystem = buildSystem(prevData);
        setSystem(newSystem);
        await saveToFirebase(newSystem);
    };

    // ย้อนไปข้างหน้า
    const redo = async () => {
        if (future.length === 0) return;
        const nextData = future[0];
        setHistory(h => [...h.slice(-(MAX_HISTORY - 1)), currentProjectData]);
        setFuture(f => f.slice(1));
        const newSystem = buildSystem(nextData);
        setSystem(newSystem);
        await saveToFirebase(newSystem);
    };

    const updateProjectName = (newName) => {
        const newProjects = system.projects.map((p, i) =>
            i === activeProjectIndex
                ? { ...p, name: newName, data: { ...p.data, projectName: newName } }
                : p
        );
        const newSystem = { ...system, projects: newProjects };
        setSystem(newSystem);
        saveToFirebase(newSystem);
        logAudit('RENAME_PROJECT', `เปลี่ยนชื่อเป็น "${newName}"`);
    };

    const addProject = (name, group = null) => {
        const targetGroup = group || getGroupOf(system.projects[activeProjectIndex]);
        const newProj = { name, group: targetGroup, data: { boq: [], trans: [], docs: [], projectName: name } };
        const newProjects = [...system.projects, newProj];
        const newSystem = { ...system, projects: newProjects };
        setSystem(newSystem);
        saveToFirebase(newSystem);
        setActiveProjectIndex(newProjects.length - 1);
        logAudit('ADD_PROJECT', `สร้างแปลง "${name}" ในโครงการ "${targetGroup}"`);
    };

    const deleteProject = () => {
        if (system.projects.length <= 1) return alert("ต้องเหลืออย่างน้อย 1 โครงการ");
        const deletedName = system.projects[activeProjectIndex]?.name;
        const newProjects = system.projects.filter((_, i) => i !== activeProjectIndex);
        const newSystem = { ...system, projects: newProjects };
        setSystem(newSystem);
        saveToFirebase(newSystem);
        setActiveProjectIndex(0);
        logAudit('DELETE_PROJECT', `ลบโครงการ "${deletedName}"`);
    };

    // สำหรับ DevPanel — จัดการโครงการโดยระบุ index โดยตรง
    const deleteProjectByIndex = (index) => {
        if (system.projects.length <= 1) { alert("ต้องเหลืออย่างน้อย 1 โครงการ"); return; }
        const deletedName = system.projects[index]?.name;
        const newProjects = system.projects.filter((_, i) => i !== index);
        const newSystem = { ...system, projects: newProjects };
        setSystem(newSystem);
        saveToFirebase(newSystem);
        if (activeProjectIndex === index) setActiveProjectIndex(0);
        else if (activeProjectIndex > index) setActiveProjectIndex(activeProjectIndex - 1);
        logAudit('DELETE_PROJECT', `ลบโครงการ "${deletedName}"`);
    };

    const updateProjectNameByIndex = (index, newName) => {
        const newProjects = system.projects.map((p, i) =>
            i === index ? { ...p, name: newName, data: { ...p.data, projectName: newName } } : p
        );
        const newSystem = { ...system, projects: newProjects };
        setSystem(newSystem);
        saveToFirebase(newSystem);
        logAudit('RENAME_PROJECT', `เปลี่ยนชื่อโครงการ index ${index} เป็น "${newName}"`);
    };

    // ==========================================
    // 1.5 Group (โครงการ) — ชั้นบนของแปลงบ้าน
    // ==========================================

    // โครงการที่ active = โครงการของแปลงที่เลือกอยู่ (derived — ไม่มี state แยก จึงไม่ sync หลุด)
    const activeGroup = getGroupOf(system.projects[activeProjectIndex]);

    // เพิ่มโครงการใหม่ พร้อมแปลงแรก (ทุกโครงการต้องมีอย่างน้อย 1 แปลง)
    const addGroup = (groupName, firstPlotName) => {
        addProject(firstPlotName || 'แปลงที่ 1', groupName);
        logAudit('ADD_GROUP', `สร้างโครงการ "${groupName}"`);
    };

    // เปลี่ยนชื่อโครงการ (อัปเดตทุกแปลงในโครงการนั้น)
    const renameGroup = (oldName, newName) => {
        const newProjects = system.projects.map(p =>
            getGroupOf(p) === oldName ? { ...p, group: newName } : p
        );
        const newSystem = { ...system, projects: newProjects };
        setSystem(newSystem);
        saveToFirebase(newSystem);
        logAudit('RENAME_GROUP', `เปลี่ยนชื่อโครงการ "${oldName}" เป็น "${newName}"`);
    };

    // ย้ายแปลงไปโครงการอื่น (ข้อมูล BOQ/ประวัติในแปลงคงเดิมทั้งหมด)
    const setProjectGroupByIndex = (index, groupName) => {
        const plotName = system.projects[index]?.name;
        const oldGroup = getGroupOf(system.projects[index]);
        if (!groupName || groupName === oldGroup) return;
        const newProjects = system.projects.map((p, i) =>
            i === index ? { ...p, group: groupName } : p
        );
        const newSystem = { ...system, projects: newProjects };
        setSystem(newSystem);
        saveToFirebase(newSystem);
        logAudit('MOVE_PLOT', `ย้ายแปลง "${plotName}" จาก "${oldGroup}" ไป "${groupName}"`);
    };

    // ลบโครงการ = ลบทุกแปลงในโครงการนั้น
    const deleteGroup = (groupName) => {
        const remaining = system.projects.filter(p => getGroupOf(p) !== groupName);
        if (remaining.length === 0) { alert("ต้องเหลืออย่างน้อย 1 โครงการ"); return; }
        const newSystem = { ...system, projects: remaining };
        setSystem(newSystem);
        saveToFirebase(newSystem);
        setActiveProjectIndex(0);
        logAudit('DELETE_GROUP', `ลบโครงการ "${groupName}" (${system.projects.length - remaining.length} แปลง)`);
    };

    // ==========================================
    // 1.6 ยกเลิกใบเบิกค่าแรง (DV) — ลบใบ + ถอน trans คืนยอดจ่าย/เหลือใน BOQ
    // ==========================================
    const cancelDVByIndex = (plotIndex, dvId) => {
        const plot = system.projects[plotIndex];
        if (!plot) return { ok: false, msg: 'ไม่พบแปลง' };
        const data = plot.data || {};
        const dvDoc = (data.docs || []).find(d => d.id === dvId && d.type === 'DV');
        if (!dvDoc) return { ok: false, msg: 'ไม่พบใบเบิก' };

        const trans = [...(data.trans || [])];
        let removed = 0, missed = 0;
        (dvDoc.items || []).forEach(item => {
            const amt = parseFloat(item.amount) || 0;
            const isPay = t => t.type === 'EXPENSE' || t.type === 'DV';
            // 1) จับคู่ด้วย docId (ข้อมูลที่บันทึกหลังอัปเดตนี้)
            let idx = trans.findIndex(t => isPay(t) && t.docId === dvDoc.id && t.itemId === item.id);
            // 2) ข้อมูลเก่า: itemId + ยอดเงิน + เวลาใกล้กับใบ (±1 นาที)
            if (idx === -1) {
                const docTime = new Date(dvDoc.date).getTime();
                idx = trans.findIndex(t => isPay(t) && t.itemId === item.id &&
                    Math.abs((parseFloat(t.a) || 0) - amt) < 0.005 &&
                    Math.abs(new Date(t.date).getTime() - docTime) < 60000);
            }
            // 3) หลวมสุด: itemId + ยอดเงิน
            if (idx === -1) {
                idx = trans.findIndex(t => isPay(t) && t.itemId === item.id &&
                    Math.abs((parseFloat(t.a) || 0) - amt) < 0.005);
            }
            if (idx !== -1) { trans.splice(idx, 1); removed++; } else missed++;
        });

        const newDocs = (data.docs || []).filter(d => d.id !== dvId);
        const newProjects = system.projects.map((p, i) =>
            i === plotIndex ? { ...p, data: { ...data, docs: newDocs, trans } } : p
        );
        const newSystem = { ...system, projects: newProjects };
        setSystem(newSystem);
        saveToFirebase(newSystem);
        logAudit('CANCEL_DV',
            `ยกเลิก ${dvDoc.no} | แปลง ${plot.name} | จ่ายให้ ${dvDoc.payee} | ถอนยอด ${removed} รายการ${missed ? ` (จับคู่ไม่ได้ ${missed})` : ''}`);
        return { ok: true, removed, missed, no: dvDoc.no };
    };

    // ==========================================
    // 1.7 Approval System — งานของวิศวกร (PROJECT) รอ ADMIN/DEV อนุมัติ
    // ==========================================

    // ตั้งค่าว่างานประเภทไหนต้องขออนุมัติ (ติ๊กได้ในแผง DEV)
    const [approvalConfig, setApprovalConfig] = useState({ po: false, dv: false });
    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'system_config', 'approval'), (snap) => {
            if (snap.exists()) setApprovalConfig({ po: false, dv: false, ...snap.data() });
        }, () => {});
        return () => unsub();
    }, []);

    const saveApprovalConfig = async (cfg) => {
        try {
            await setDoc(doc(db, 'system_config', 'approval'), cfg, { merge: true });
            return true;
        } catch (e) { console.error('saveApprovalConfig:', e); return false; }
    };

    // คำขอทั้งหมด (real-time)
    const [approvalRequests, setApprovalRequests] = useState([]);
    useEffect(() => {
        if (!authUid) return;
        const q = query(collection(db, 'approval_requests'), orderBy('requestedAt', 'desc'), limit(100));
        const unsub = onSnapshot(q, snap => {
            setApprovalRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, () => {});
        return () => unsub();
    }, [authUid]);

    // จำนวนที่รอ — ADMIN/DEV เห็นทั้งหมด, PROJECT เห็นเฉพาะของตัวเอง
    const pendingApprovalCount = useMemo(() => {
        if (!user) return 0;
        const pending = approvalRequests.filter(r => r.status === 'PENDING');
        if (user.role === 'ADMIN' || user.role === 'DEV') return pending.length;
        return pending.filter(r => r.requestedByUid === user.uid).length;
    }, [approvalRequests, user]);

    // ส่งแจ้งเตือนเข้า LINE (ผ่าน serverless function — fire-and-forget ไม่บล็อกงานหลัก)
    const notifyLine = async (text) => {
        try {
            const idToken = await auth.currentUser?.getIdToken?.();
            if (!idToken) return;
            await fetch('/api/notify-line', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken, text }),
            });
        } catch (e) {
            console.warn('notifyLine (ไม่กระทบการทำงาน):', e?.message);
        }
    };

    // วิศวกรยื่นคำขอ
    const createApprovalRequest = async (type, plotName, group, payload, summary) => {
        try {
            await addDoc(collection(db, 'approval_requests'), {
                type,                      // 'PO' | 'DV'
                plotName, group,
                payload: sanitize(payload),
                summary: summary || '',
                status: 'PENDING',
                requestedBy: user?.username || user?.email || '-',
                requestedByUid: user?.uid || null,
                requestedAt: new Date().toISOString(),
            });
            await createNotification({
                title: `🟠 งานรออนุมัติ: ${type} (${plotName})`,
                message: `${user?.username} ยื่นขอ${type === 'PO' ? 'เปิดใบสั่งจ้าง' : 'เบิกค่าแรง'} — ${summary}`,
                type: 'warning', isActive: true,
                targetType: 'roles', targetRoles: ['ADMIN', 'DEV'],
            });
            // แจ้งเข้า LINE กลุ่ม
            notifyLine(
                `🟠 มีงานรออนุมัติ\n` +
                `ประเภท: ${type === 'PO' ? 'เปิดใบสั่งจ้าง (PO)' : 'เบิกค่าแรง (DV)'}\n` +
                `โครงการ: ${group} / ${plotName}\n` +
                `ผู้ขอ: ${user?.username || '-'}\n` +
                `รายละเอียด: ${summary}\n` +
                `— กรุณาเข้าระบบเพื่ออนุมัติ`
            );
            logAudit('APPROVAL_REQUEST', `${type} | ${plotName} | ${summary}`);
            return true;
        } catch (e) { console.error('createApprovalRequest:', e); return false; }
    };

    // สร้างเลขที่เอกสารถัดไปของแปลง
    const nextDocNo = (data, type) => {
        const count = (data.docs || []).filter(d => d.type === type).length + 1;
        if (type === 'DV') return `DV${String(count).padStart(3, '0')}`;
        const d = new Date();
        const yy = String(d.getFullYear()).slice(-2);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `PO-${yy}${mm}-${String(count).padStart(3, '0')}`;
    };

    // นำ payload PO ไปใส่ข้อมูลแปลงจริง (ตอนอนุมัติ) — logic เดียวกับหน้า PO
    const applyPOPayload = (data, payload) => {
        const { cart, contractor, date } = payload;
        let updatedBOQ = [...(data.boq || [])];
        let finalCart = [...cart];
        const newItems = cart.filter(i => i.isNew);

        if (newItems.length > 0) {
            let headerIdx = updatedBOQ.findIndex(i => i.type === 'header' && i.name === 'งานเพิ่มเติม');
            if (headerIdx === -1) {
                let maxCode = 0;
                updatedBOQ.forEach(i => {
                    if (i.type === 'header') { const c = parseInt(i.code); if (!isNaN(c) && c > maxCode) maxCode = c; }
                });
                updatedBOQ.push({ id: Date.now(), type: 'header', code: String(maxCode + 1).padStart(2, '0'), name: 'งานเพิ่มเติม' });
                headerIdx = updatedBOQ.length - 1;
            }
            const headerCode = updatedBOQ[headerIdx].code;
            let existingCount = 0;
            for (let i = headerIdx + 1; i < updatedBOQ.length; i++) {
                if (updatedBOQ[i].type === 'header') break;
                existingCount++;
            }
            newItems.forEach((cartItem, idx) => {
                const newBOQId = Date.now() + idx + 1;
                const itemCode = `${headerCode}.${existingCount + idx + 1}`;
                updatedBOQ.splice(headerIdx + 1 + existingCount + idx, 0, {
                    id: newBOQId, type: 'item', code: itemCode,
                    name: cartItem.name, unit: cartItem.unit, q: cartItem.q,
                    mP: cartItem.mPrice, lP: cartItem.lPrice, con: contractor, note: '',
                });
                finalCart = finalCart.map(ci => ci.id === cartItem.id ? { ...ci, id: newBOQId, code: itemCode, isNew: false } : ci);
            });
        }

        // ตั้งราคาที่ตกลงใน PO เป็นงบใน BOQ (เมื่องบเดิมเป็น 0) + ประทับชื่อช่าง
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

        const poNo = nextDocNo(data, 'PO');
        const newDoc = { id: Math.random().toString(36).substr(2, 9), type: 'PO', no: poNo, date, contractor, status: 'WAITING', items: finalCart };
        const newTrans = finalCart.map(item => ({ id: Math.random().toString(36).substr(2, 9), type: 'PO', itemId: item.id, q: item.q, a: 0, date }));
        return {
            ...data,
            boq: updatedBOQ,
            docs: [...(data.docs || []), newDoc],
            trans: [...(data.trans || []), ...newTrans],
        };
    };

    // นำ payload DV ไปใส่ข้อมูลแปลงจริง (ตอนอนุมัติ) — logic เดียวกับหน้า DV
    const applyDVPayload = (data, payload) => {
        const { payee, items, stampCon, lpFixes = {} } = payload;
        const newDoc = {
            id: Math.random().toString(36).substr(2, 9),
            type: 'DV', no: nextDocNo(data, 'DV'),
            date: new Date().toISOString(), payee, items, status: 'PAID',
        };
        const newTrans = [
            ...(data.trans || []),
            ...items.map(i => ({ id: Math.random().toString(36).substr(2, 9), type: 'EXPENSE', itemId: i.id, q: 0, a: i.amount, date: new Date().toISOString(), docId: newDoc.id })),
        ];
        const paidIds = new Set(items.map(i => i.id));
        const newBoq = (data.boq || []).map(i => {
            let next = i;
            if (lpFixes[i.id]) next = { ...next, lP: lpFixes[i.id] };
            if (stampCon && paidIds.has(i.id)) next = { ...next, con: payee };
            return next;
        });
        return { ...data, boq: newBoq, docs: [...(data.docs || []), newDoc], trans: newTrans };
    };

    // ADMIN/DEV อนุมัติ
    const approveRequest = async (req) => {
        try {
            const idx = system.projects.findIndex(p =>
                p.name === req.plotName && getGroupOf(p) === (req.group || DEFAULT_GROUP)
            );
            if (idx === -1) { alert(`ไม่พบแปลง "${req.plotName}" ในโครงการ "${req.group}" — อาจถูกลบ/ย้ายไปแล้ว`); return false; }
            const plot = system.projects[idx];
            const newData = req.type === 'PO'
                ? applyPOPayload(plot.data, req.payload)
                : applyDVPayload(plot.data, req.payload);
            const newProjects = system.projects.map((p, i) => i === idx ? { ...p, data: newData } : p);
            const newSystem = { ...system, projects: newProjects };
            setSystem(newSystem);
            await saveToFirebase(newSystem);
            await updateDoc(doc(db, 'approval_requests', req.id), {
                status: 'APPROVED',
                decidedBy: user?.username || '-', decidedAt: new Date().toISOString(),
            });
            if (req.requestedByUid) {
                await createNotification({
                    title: `✅ อนุมัติแล้ว: ${req.type} (${req.plotName})`,
                    message: `${user?.username} อนุมัติคำขอของคุณ — ${req.summary}`,
                    type: 'success', isActive: true,
                    targetType: 'users', targetUids: [req.requestedByUid],
                });
            }
            logAudit('APPROVAL_APPROVE', `${req.type} | ${req.plotName} | ${req.summary}`);
            return true;
        } catch (e) { console.error('approveRequest:', e); alert('อนุมัติไม่สำเร็จ: ' + e.message); return false; }
    };

    // ADMIN/DEV ปฏิเสธ
    const rejectRequest = async (req, reason = '') => {
        try {
            await updateDoc(doc(db, 'approval_requests', req.id), {
                status: 'REJECTED', rejectReason: reason,
                decidedBy: user?.username || '-', decidedAt: new Date().toISOString(),
            });
            if (req.requestedByUid) {
                await createNotification({
                    title: `❌ ถูกปฏิเสธ: ${req.type} (${req.plotName})`,
                    message: `${user?.username} ปฏิเสธคำขอของคุณ — ${req.summary}${reason ? ` | เหตุผล: ${reason}` : ''}`,
                    type: 'error', isActive: true,
                    targetType: 'users', targetUids: [req.requestedByUid],
                });
            }
            logAudit('APPROVAL_REJECT', `${req.type} | ${req.plotName} | ${req.summary} | ${reason}`);
            return true;
        } catch (e) { console.error('rejectRequest:', e); return false; }
    };

    // DEV ลบคำขอที่ยังรออนุมัติ
    const deleteApprovalRequest = async (req) => {
        if (user?.role !== 'DEV' || req?.status !== 'PENDING') return false;
        try {
            await deleteDoc(doc(db, 'approval_requests', req.id));
            logAudit('APPROVAL_DELETE', `${req.type} | ${req.plotName} | ${req.summary}`);
            return true;
        } catch (e) {
            console.error('deleteApprovalRequest:', e);
            alert('ลบคำขอไม่สำเร็จ: ' + e.message);
            return false;
        }
    };

    // ==========================================
    // 2. Backup System
    // ==========================================
    const fetchBackups = async () => {
        setBackupsLoading(true);
        try {
            const q = query(collection(db, 'backups'), orderBy('createdAt', 'desc'), limit(30));
            const snap = await getDocs(q);
            setBackupsList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
            console.error('fetchBackups error:', e);
        }
        setBackupsLoading(false);
    };

    const createBackup = async (label = '') => {
        try {
            const entry = {
                createdAt: new Date().toISOString(),
                createdBy: user?.username || user?.email || 'unknown',
                label: label.trim() || `Backup ${new Date().toLocaleString('th-TH')}`,
                projectCount: system.projects.length,
                data: sanitize(system),
            };
            await addDoc(collection(db, 'backups'), entry);
            await fetchBackups();
            return true;
        } catch (e) {
            console.error('createBackup error:', e);
            return false;
        }
    };

    const restoreFromBackup = async (backupData) => {
        try {
            await saveToFirebase(backupData);
            return true;
        } catch (e) {
            console.error('restoreFromBackup error:', e);
            return false;
        }
    };

    const deleteBackup = async (backupId) => {
        try {
            await deleteDoc(doc(db, 'backups', backupId));
            setBackupsList(prev => prev.filter(b => b.id !== backupId));
            return true;
        } catch (e) {
            console.error('deleteBackup error:', e);
            return false;
        }
    };

    const downloadJSON = (dataObj, filename) => {
        const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ==========================================
    // 3. Google Drive Backup
    // ==========================================

    // Silent reconnect on app load (ถ้าเคย connect ไว้แล้ว)
    useEffect(() => {
        if (!GDRIVE_CLIENT_ID || !isDriveEnabled()) return;
        loadGisScript()
            .then(() => requestToken(GDRIVE_CLIENT_ID, true))
            .then(token => setDriveToken(token))
            .catch(() => {}); // Silent fail — user reconnects manually
    }, []);

    // Auto daily backup เมื่อได้ token มาแล้ว
    useEffect(() => {
        if (!driveToken || !user) return;
        if (!needsDailyBackup()) return;

        const runAutoBackup = async () => {
            setDriveAutoBackupStatus('running');
            try {
                const date = new Date().toISOString().split('T')[0];
                const filename = `pms888-auto-${date}.json`;
                const payload = { exportedAt: new Date().toISOString(), type: 'auto-daily', version: '1.0', system: sanitize(system) };
                await uploadToDrive(driveToken, filename, payload);
                await pruneOldDriveBackups(driveToken);
                const now = new Date().toISOString();
                setDriveLastBackup(now);
                setDriveLastBackupState(now);
                setDriveAutoBackupStatus('done');
            } catch {
                setDriveAutoBackupStatus('error');
            }
        };
        runAutoBackup();
    }, [driveToken, user]);

    const connectDrive = async () => {
        if (!GDRIVE_CLIENT_ID) {
            alert('กรุณาตั้งค่า VITE_GOOGLE_CLIENT_ID ในไฟล์ .env ก่อน');
            return false;
        }
        setDriveLoading(true);
        try {
            await loadGisScript();
            const token = await requestToken(GDRIVE_CLIENT_ID, false);
            // Get email via Google userinfo
            const info = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${token}` },
            }).then(r => r.json());
            const email = info.email || 'Google Account';
            setDriveToken(token);
            setDriveEmail(email);
            saveDriveSession(email);
            return true;
        } catch {
            return false;
        } finally {
            setDriveLoading(false);
        }
    };

    const disconnectDrive = () => {
        if (driveToken) window.google?.accounts?.oauth2?.revoke(driveToken, () => {});
        setDriveToken(null);
        setDriveEmail(null);
        setDriveBackupsList([]);
        setDriveLastBackupState(null);
        setDriveAutoBackupStatus(null);
        clearDriveSession();
    };

    const backupToDrive = async (label = '') => {
        if (!driveToken) return false;
        setDriveLoading(true);
        try {
            const date = new Date().toISOString().split('T')[0];
            const safeName = (label.trim() || 'manual').replace(/[^a-zA-Z0-9ก-๙\-_]/g, '_');
            const filename = `pms888-${safeName}-${date}.json`;
            const payload = {
                exportedAt: new Date().toISOString(),
                label: label.trim() || `Backup ${new Date().toLocaleString('th-TH')}`,
                type: 'manual',
                version: '1.0',
                system: sanitize(system),
            };
            await uploadToDrive(driveToken, filename, payload);
            await pruneOldDriveBackups(driveToken);
            const now = new Date().toISOString();
            setDriveLastBackup(now);
            setDriveLastBackupState(now);
            await fetchDriveBackups();
            return true;
        } catch {
            return false;
        } finally {
            setDriveLoading(false);
        }
    };

    const fetchDriveBackups = async () => {
        if (!driveToken) return;
        setDriveLoading(true);
        try {
            const files = await listDriveBackups(driveToken);
            setDriveBackupsList(files);
        } catch {
            // Ignore
        } finally {
            setDriveLoading(false);
        }
    };

    // ==========================================
    // 4. Notifications
    // ==========================================

    const [notifications, setNotifications] = useState([]);
    const [readIds,        setReadIds]        = useState([]);

    // Real-time listener สำหรับ notifications
    useEffect(() => {
        if (!authUid) return;
        const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'));
        const unsub = onSnapshot(q, snap => {
            setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, () => {});
        // โหลด read IDs ของ user นี้
        getDoc(doc(db, 'notification_reads', authUid))
            .then(snap => { if (snap.exists()) setReadIds(snap.data().readIds || []); })
            .catch(() => {});
        return () => unsub();
    }, [authUid]);

    // notifications ที่ user นี้ควรเห็น
    const myNotifications = useMemo(() => {
        if (!user) return [];
        const now = new Date();
        return notifications.filter(n => {
            if (!n.isActive) return false;
            if (n.expiresAt && new Date(n.expiresAt) < now) return false;
            if (n.targetType === 'all') return true;
            if (n.targetType === 'roles') return Array.isArray(n.targetRoles) && n.targetRoles.includes(user.role);
            if (n.targetType === 'users') return Array.isArray(n.targetUids)  && n.targetUids.includes(user.uid);
            return false;
        });
    }, [notifications, user]);

    const unreadNotifications = useMemo(
        () => myNotifications.filter(n => !readIds.includes(n.id)),
        [myNotifications, readIds]
    );

    const markNotificationRead = async (notiId) => {
        if (!authUid) return;
        const newReadIds = [...new Set([...readIds, notiId])];
        setReadIds(newReadIds);
        try {
            await setDoc(doc(db, 'notification_reads', authUid), { readIds: newReadIds });
        } catch (e) { console.error('markNotificationRead:', e); }
    };

    const markAllRead = async () => {
        if (!authUid || myNotifications.length === 0) return;
        const newReadIds = [...new Set([...readIds, ...myNotifications.map(n => n.id)])];
        setReadIds(newReadIds);
        try {
            await setDoc(doc(db, 'notification_reads', authUid), { readIds: newReadIds });
        } catch (e) { console.error('markAllRead:', e); }
    };

    const createNotification = async (data) => {
        try {
            await addDoc(collection(db, 'notifications'), {
                ...data,
                createdAt: new Date().toISOString(),
                createdBy: user?.username || user?.email || 'DEV',
            });
            return true;
        } catch (e) { console.error('createNotification:', e); return false; }
    };

    const deleteNotification = async (id) => {
        try {
            await deleteDoc(doc(db, 'notifications', id));
            return true;
        } catch (e) { console.error('deleteNotification:', e); return false; }
    };

    const toggleNotificationActive = async (id, current) => {
        try {
            await updateDoc(doc(db, 'notifications', id), { isActive: !current });
            return true;
        } catch (e) { console.error('toggleNotificationActive:', e); return false; }
    };

    const updateNotification = async (id, data) => {
        try {
            await updateDoc(doc(db, 'notifications', id), {
                ...data,
                updatedAt: new Date().toISOString(),
                updatedBy: user?.username || user?.email || 'DEV',
            });
            return true;
        } catch (e) { console.error('updateNotification:', e); return false; }
    };

    // ==========================================
    // 5. Auth
    // ==========================================

    // Hardcoded fallback สำหรับ accounts ที่รู้จัก (ใช้เมื่อ Firestore ยังไม่มี profile)
    const getDefaultProfile = (email) => {
        if (email === 'admin@nutcon.com')   return { role: 'ADMIN',   username: 'ผู้บริหาร' };
        if (email === 'dev@nutcon.com')     return { role: 'DEV',     username: 'นักพัฒนา' };
        if (email === 'project@nutcon.com') return { role: 'PROJECT', username: 'วิศวกรโครงการ' };
        return { role: 'USER', username: 'พนักงานทั่วไป' };
    };

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                setAuthUid(currentUser.uid); // เริ่ม data snapshot ทันที ไม่ต้องรอ profile
                let profile = null;
                try {
                    const userDocSnap = await getDoc(doc(db, 'users', currentUser.uid));
                    if (userDocSnap.exists()) {
                        profile = userDocSnap.data();
                    } else {
                        // สร้าง profile อัตโนมัติสำหรับ user ที่ login ครั้งแรก
                        const defaults = getDefaultProfile(currentUser.email);
                        profile = {
                            email: currentUser.email,
                            username: defaults.username,
                            role: defaults.role,
                            createdAt: new Date().toISOString(),
                            createdBy: 'system',
                            isActive: true,
                        };
                        await setDoc(doc(db, 'users', currentUser.uid), profile);
                    }
                } catch {
                    profile = { ...getDefaultProfile(currentUser.email), isActive: true };
                }

                if (profile.isActive === false) {
                    await signOut(auth);
                    setAuthLoading(false);
                    return;
                }

                setUser({
                    email: currentUser.email,
                    uid: currentUser.uid,
                    username: profile.username,
                    role: profile.role,
                    projectAccess: profile.projectAccess ?? null, // null = เข้าได้ทุกโครงการ
                });
            } else {
                setUser(null);
                setAuthUid(null);
            }
            setAuthLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const login = async (email, password) => {
        try {
            const credential = await signInWithEmailAndPassword(auth, email, password);
            // บันทึกประวัติการ login
            try {
                const userDocSnap = await getDoc(doc(db, 'users', credential.user.uid));
                const profile = userDocSnap.exists() ? userDocSnap.data() : getDefaultProfile(credential.user.email);
                await addDoc(collection(db, 'login_history'), {
                    uid: credential.user.uid,
                    email: credential.user.email,
                    username: profile.username || credential.user.email,
                    role: profile.role || 'USER',
                    loginAt: new Date().toISOString(),
                });
            } catch { /* non-critical */ }
            return true;
        } catch (error) {
            console.error("Login Error:", error.message);
            return false;
        }
    };

    const logout = async () => {
        try {
            await signOut(auth);
            setUser(null);
        } catch (error) {
            console.error("Logout Error:", error);
        }
    };

    // ==========================================
    // 5. Project Access Control
    // ==========================================

    // คำนวณว่า user ปัจจุบันเห็น project index ไหนได้บ้าง
    const visibleProjectIndices = (() => {
        if (!user || user.role === 'ADMIN' || user.role === 'DEV') {
            return system.projects.map((_, i) => i);
        }
        if (!Array.isArray(user.projectAccess)) {
            return system.projects.map((_, i) => i);
        }
        return system.projects.reduce((acc, p, i) => {
            const accessKey = JSON.stringify([getGroupOf(p), p.name]);
            // รองรับข้อมูลเดิมที่เก็บสิทธิ์ด้วยชื่อแปลงอย่างเดียว
            if (user.projectAccess.includes(accessKey) || user.projectAccess.includes(p.name)) acc.push(i);
            return acc;
        }, []);
    })();

    // รายชื่อโครงการ (group) ที่ user นี้มองเห็น
    const visibleGroups = (() => {
        const set = new Set();
        visibleProjectIndices.forEach(i => set.add(getGroupOf(system.projects[i])));
        return [...set];
    })();

    // index ของแปลงที่อยู่ในโครงการที่เลือก (และ user มีสิทธิ์เห็น)
    const groupProjectIndices = visibleProjectIndices.filter(
        i => getGroupOf(system.projects[i]) === activeGroup
    );

    // สลับโครงการ → ไปแปลงแรกของโครงการนั้น
    const setActiveGroup = (groupName) => {
        const first = visibleProjectIndices.find(i => getGroupOf(system.projects[i]) === groupName);
        if (first !== undefined) setActiveProjectIndex(first);
    };

    // Redirect ไปโครงการที่มองเห็นได้ ถ้า activeProjectIndex อยู่นอกสิทธิ์
    useEffect(() => {
        if (!visibleProjectIndices.length) return;
        if (!visibleProjectIndices.includes(activeProjectIndex)) {
            setActiveProjectIndex(visibleProjectIndices[0]);
        }
    }, [activeProjectIndex, user?.uid, JSON.stringify(user?.projectAccess), system.projects.length]);

    // ==========================================
    // 6. Context Value
    // ==========================================
    return (
        <ProjectContext.Provider value={{
            system,
            activeProjectIndex,
            setActiveProjectIndex,
            visibleProjectIndices,
            // Group (โครงการ)
            activeGroup,
            setActiveGroup,
            visibleGroups,
            groupProjectIndices,
            addGroup,
            renameGroup,
            deleteGroup,
            setProjectGroupByIndex,
            cancelDVByIndex,
            // Approval System
            approvalConfig,
            saveApprovalConfig,
            approvalRequests,
            pendingApprovalCount,
            createApprovalRequest,
            approveRequest,
            rejectRequest,
            deleteApprovalRequest,
            currentProjectData,
            currentProjectName,
            updateProjectData,
            updateProjectName,
            addProject,
            deleteProject,
            deleteProjectByIndex,
            updateProjectNameByIndex,
            undo,
            redo,
            canUndo: history.length > 0,
            canRedo: future.length > 0,
            user,
            login,
            logout,
            loading,
            authLoading,
            logAudit,
            permissions,
            savePermissions,
            can,
            notifications,
            myNotifications,
            unreadNotifications,
            markNotificationRead,
            markAllRead,
            createNotification,
            updateNotification,
            deleteNotification,
            toggleNotificationActive,
            maintenanceMode,
            maintenanceMessage,
            saveMaintenance,
            backupsList,
            backupsLoading,
            fetchBackups,
            createBackup,
            restoreFromBackup,
            deleteBackup,
            downloadJSON,
            // Google Drive
            driveToken,
            driveEmail,
            driveLoading,
            driveBackupsList,
            driveLastBackup,
            driveAutoBackupStatus,
            driveEnabled: !!driveToken,
            connectDrive,
            disconnectDrive,
            backupToDrive,
            fetchDriveBackups,
        }}>
            {!authLoading && children}
        </ProjectContext.Provider>
    );
};

export const useProject = () => useContext(ProjectContext);
