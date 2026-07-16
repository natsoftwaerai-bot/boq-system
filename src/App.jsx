import React, { useState, useEffect } from 'react';
import { useProject } from './context/ProjectContext';
import { exportToExcel, importFromExcel } from './utils/excelHelper';
import { FaFileImport, FaFileExport, FaUndo, FaRedo } from 'react-icons/fa';

// --- Components ---
import Sidebar from './components/Sidebar';
import NotificationPanel from './components/NotificationPanel';
import Login from './pages/Login';

// --- Pages ---
import Dashboard from './pages/Dashboard';
import BOQ from './pages/BOQ';
import PO from './pages/PO';
import POHistory from './pages/POHistory';
import PUPending from './pages/PUPending';
import PUHistory from './pages/PUHistory';
import DV from './pages/DV';
import DVHistory from './pages/DVHistory';
import BackupPage from './pages/BackupPage';
import DevPanel from './pages/DevPanel';
import Approvals from './pages/Approvals';

function App() {
  // ดึงค่าต่างๆ จาก Context
  const {
      user,
      loading,
      authLoading,
      currentProjectData,
      currentProjectName,
      updateProjectData,
      undo, redo, canUndo, canRedo,
      can,
      logout,
      maintenanceMode,
      maintenanceMessage,
      activeGroup,
  } = useProject();

  // Keyboard shortcuts: Ctrl+Z = undo, Ctrl+Y / Ctrl+Shift+Z = redo
  useEffect(() => {
      const handleKey = (e) => {
          if (!(e.ctrlKey || e.metaKey)) return;
          if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); if (canUndo) undo(); }
          if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); if (canRedo) redo(); }
      };
      window.addEventListener('keydown', handleKey);
      return () => window.removeEventListener('keydown', handleKey);
  }, [undo, redo, canUndo, canRedo]);
  
  // State สำหรับจัดการหน้าปัจจุบัน (Default: dashboard)
  const [activePage, setActivePage] = useState('dashboard');

  // --- 1. ส่วนเช็คสิทธิ์และการ Redirect ---
  // ถ้าเข้าหน้าที่ไม่มีสิทธิ์ ให้ redirect ไป PO
  useEffect(() => {
    if (!user || !can) return;
    if (activePage === 'dashboard' && !can('dashboard')) setActivePage('po');
    if (activePage === 'boq'       && !can('boq'))       setActivePage('po');
    if (activePage === 'backup'    && !can('backup'))     setActivePage('po');
    if (activePage === 'devpanel'  && !can('devPanel'))   setActivePage('po');
  }, [user, activePage, can]);

  // --- 2. ส่วนแสดงผล Loading Screen ---
  // แสดงเมื่อกำลังโหลดข้อมูลจาก Firebase หรือกำลังเช็คสถานะ Login
  if (authLoading || (user && loading)) {
      return (
          <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white font-sarabun">
              <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500 mb-6"></div>
              <h2 className="text-2xl font-bold animate-pulse">กำลังเชื่อมต่อฐานข้อมูล...</h2>
              <p className="text-slate-400 text-sm mt-2">PMS 888</p>
          </div>
      );
  }

  // --- 3. ส่วนตรวจสอบการ Login ---
  // ถ้าไม่มี User ให้แสดงหน้า Login
  if (!user) {
      return <Login />;
  }

  // --- 3.5 Maintenance Mode — บล็อก non-DEV ทันที ---
  if (maintenanceMode && user.role !== 'DEV') {
      return (
          <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center font-sarabun px-4 text-center">
              <div className="bg-white rounded-2xl shadow-2xl p-10 max-w-md w-full">
                  <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-5">
                      <span className="text-3xl">🔧</span>
                  </div>
                  <h1 className="text-2xl font-bold text-slate-800 mb-2">ระบบปิดปรับปรุง</h1>
                  <p className="text-slate-500 text-sm leading-relaxed mb-6">{maintenanceMessage}</p>
                  <div className="text-xs text-slate-400 bg-slate-50 rounded-lg p-3 mb-6">
                      เข้าสู่ระบบในฐานะ <span className="font-bold text-slate-600">{user.username}</span>
                      <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          user.role === 'ADMIN' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                      }`}>{user.role}</span>
                  </div>
                  <button onClick={logout}
                      className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold rounded-xl transition">
                      ออกจากระบบ
                  </button>
              </div>
          </div>
      );
  }

  // DEV มีสิทธิ์เท่า ADMIN + เพิ่มเติม
  const isAdmin = user.role === 'ADMIN' || user.role === 'DEV';
  const isDev = user.role === 'DEV';

  // --- 4. ฟังก์ชัน Import Excel ---
  const handleImport = (e) => {
      const file = e.target.files[0];
      if(!file) return;
      
      if(confirm("⚠️ คำเตือน: การนำเข้าข้อมูลจะทับข้อมูลปัจจุบันของโครงการนี้ทั้งหมด\nยืนยันที่จะทำรายการหรือไม่?")) {
          importFromExcel(file, async (newData) => {
              newData.projectName = currentProjectName;
              // ถ้าไฟล์ import ไม่มี trans/docs ให้คงข้อมูลเดิมไว้
              if (!newData.trans || newData.trans.length === 0) {
                  newData.trans = currentProjectData.trans || [];
              }
              if (!newData.docs || newData.docs.length === 0) {
                  newData.docs = currentProjectData.docs || [];
              }
              try {
                  await updateProjectData(newData); // รอให้ Firebase save เสร็จก่อน
                  alert("นำเข้าข้อมูลสำเร็จ!");
              } catch (err) {
                  alert("เกิดข้อผิดพลาด: " + err.message);
              }
          });
      }
      e.target.value = null; // Reset input file ให้เลือกไฟล์เดิมซ้ำได้
  };

  // --- 5. Render หน้าจอหลัก (Main Layout) ---
  return (
    <div className="flex h-screen w-screen bg-slate-50 font-sarabun overflow-hidden">
        {/* Sidebar เมนูซ้าย */}
        <Sidebar activePage={activePage} setActivePage={setActivePage} />
        
        {/* Main Content พื้นที่ขวา */}
        <main className="flex-1 flex flex-col overflow-hidden bg-slate-100">
          
          {/* Top Bar (Header) */}
          <div className="h-14 bg-white border-b border-slate-200 flex justify-between items-center px-6 shadow-sm z-10 shrink-0">
            <h2 className="font-bold text-slate-700 text-lg">
                {activePage === 'dashboard' ? `ภาพรวมโครงการ — ${activeGroup}` :
                 activePage === 'boq' ? 'บัญชีปริมาณงาน (Master BOQ)' : 
                 activePage === 'po' ? 'เปิดใบสั่งซื้อ (PO)' :
                 activePage === 'po-hist' ? 'ประวัติใบสั่งซื้อ (PO History)' :
                 activePage === 'pu' ? 'บันทึกรับของ/จ่ายเงิน (PU)' :
                 activePage === 'pu-hist' ? 'ประวัติการจัดซื้อ (PU History)' :
                 activePage === 'dv' ? 'เบิกค่าแรง (DV)' :
                 activePage === 'dv-hist' ? 'ประวัติค่าแรง (DV History)' :
                 activePage === 'approvals' ? 'คำขอรออนุมัติ' :
                 activePage === 'backup' ? 'Backup & Restore' :
                 activePage === 'devpanel' ? 'Developer Panel' :
                 activePage.toUpperCase()}
            </h2>

            <div className="flex gap-2 items-center">
                {/* Import/Export — Admin เท่านั้น */}
                {isAdmin && (
                    <>
                        <input type="file" id="import-file" hidden accept=".xlsx" onChange={handleImport} />
                        <button
                            onClick={() => document.getElementById('import-file').click()}
                            className="bg-white border border-slate-300 text-slate-600 px-3 py-1.5 rounded text-xs font-bold hover:bg-green-50 hover:text-green-700 hover:border-green-200 flex items-center gap-1 transition shadow-sm"
                            title="นำเข้าข้อมูลจาก Excel"
                        >
                            <FaFileImport /> Import
                        </button>
                        <button
                            onClick={() => exportToExcel(currentProjectData, currentProjectName)}
                            className="bg-white border border-slate-300 text-slate-600 px-3 py-1.5 rounded text-xs font-bold hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 flex items-center gap-1 transition shadow-sm"
                            title="ส่งออกข้อมูลเป็น Excel"
                        >
                            <FaFileExport /> Export
                        </button>
                        <div className="w-px h-5 bg-slate-200 mx-0.5"></div>
                    </>
                )}

                {/* Notification Bell */}
                <NotificationPanel />
                <div className="w-px h-5 bg-slate-200 mx-0.5"></div>

                {/* Undo / Redo — ทุกคน */}
                <button
                    onClick={undo}
                    disabled={!canUndo}
                    title="ย้อนกลับ (Ctrl+Z)"
                    className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-bold border transition shadow-sm
                        ${canUndo
                            ? 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50 hover:border-slate-400'
                            : 'bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed'}`}
                >
                    <FaUndo /> Undo
                </button>
                <button
                    onClick={redo}
                    disabled={!canRedo}
                    title="ย้อนไปข้างหน้า (Ctrl+Y)"
                    className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-bold border transition shadow-sm
                        ${canRedo
                            ? 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50 hover:border-slate-400'
                            : 'bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed'}`}
                >
                    <FaRedo /> Redo
                </button>
            </div>
          </div>
          
          {/* Page Content Area */}
          <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
             {/* Pages controlled by permissions */}
             {can('dashboard') && activePage === 'dashboard' && <Dashboard />}
             {can('boq')       && activePage === 'boq'       && <BOQ />}

             {/* Common Pages (เข้าได้ทุกคน) */}
             {activePage === 'po'      && <PO setActivePage={setActivePage} />}
             {activePage === 'po-hist' && <POHistory />}

             {activePage === 'pu'      && <PUPending setActivePage={setActivePage} />}
             {activePage === 'pu-hist' && <PUHistory />}

             {activePage === 'dv'      && <DV setActivePage={setActivePage} />}
             {activePage === 'dv-hist' && <DVHistory />}

             {activePage === 'approvals' && <Approvals />}

             {can('backup')   && activePage === 'backup'   && <BackupPage />}
             {can('devPanel') && activePage === 'devpanel' && <DevPanel />}
          </div>
        </main>
      </div>
  );
}

export default App;