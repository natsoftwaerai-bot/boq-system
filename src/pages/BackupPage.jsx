import React, { useState, useEffect } from 'react';
import { useProject } from '../context/ProjectContext';
import {
    FaCloudUploadAlt, FaUndo, FaTrash, FaDownload, FaDatabase, FaSpinner,
    FaCheckCircle, FaTimesCircle, FaExternalLinkAlt, FaSync,
} from 'react-icons/fa';
import { SiGoogledrive } from 'react-icons/si';

const BackupPage = () => {
    const {
        system,
        backupsList, backupsLoading,
        fetchBackups, createBackup, restoreFromBackup, deleteBackup, downloadJSON,
        driveEnabled, driveEmail, driveLoading, driveBackupsList,
        driveLastBackup, driveAutoBackupStatus,
        connectDrive, disconnectDrive, backupToDrive, fetchDriveBackups,
    } = useProject();

    const [label, setLabel] = useState('');
    const [creating, setCreating] = useState(false);
    const [restoringId, setRestoringId] = useState(null);
    const [driveLabel, setDriveLabel] = useState('');
    const [driveBacking, setDriveBacking] = useState(false);
    const [showDriveList, setShowDriveList] = useState(false);

    useEffect(() => { fetchBackups(); }, []);

    useEffect(() => {
        if (driveEnabled && showDriveList) fetchDriveBackups();
    }, [driveEnabled, showDriveList]);

    const handleCreate = async () => {
        setCreating(true);
        const ok = await createBackup(label);
        if (ok) { alert('สร้าง Backup สำเร็จ!'); setLabel(''); }
        else alert('เกิดข้อผิดพลาดในการสร้าง Backup');
        setCreating(false);
    };

    const handleRestore = async (backup) => {
        if (!confirm(
            `⚠️ ยืนยันการ Restore\n\nBackup: "${backup.label}"\nวันที่: ${formatDate(backup.createdAt)}\n\nข้อมูลปัจจุบันทั้งหมดจะถูกแทนที่ด้วย Backup นี้\nการกระทำนี้ไม่สามารถย้อนกลับได้`
        )) return;
        setRestoringId(backup.id);
        const ok = await restoreFromBackup(backup.data);
        if (ok) alert('Restore ข้อมูลสำเร็จ!');
        else alert('เกิดข้อผิดพลาดในการ Restore');
        setRestoringId(null);
    };

    const handleDelete = async (backup) => {
        if (!confirm(`ลบ Backup "${backup.label}" ใช่หรือไม่?`)) return;
        await deleteBackup(backup.id);
    };

    const handleDownloadCurrent = () => {
        const date = new Date().toISOString().split('T')[0];
        downloadJSON(
            { exportedAt: new Date().toISOString(), version: '1.0', system },
            `pms888-current-${date}.json`
        );
    };

    const handleDownloadBackup = (backup) => {
        const date = backup.createdAt.split('T')[0];
        downloadJSON(
            { exportedAt: backup.createdAt, label: backup.label, system: backup.data },
            `pms888-backup-${date}.json`
        );
    };

    const handleConnectDrive = async () => {
        const ok = await connectDrive();
        if (!ok) alert('ไม่สามารถเชื่อมต่อ Google Drive ได้ กรุณาลองใหม่');
    };

    const handleBackupToDrive = async () => {
        setDriveBacking(true);
        const ok = await backupToDrive(driveLabel);
        if (ok) { alert('Backup ไปยัง Google Drive สำเร็จ!'); setDriveLabel(''); }
        else alert('เกิดข้อผิดพลาดในการ Backup ไปยัง Drive');
        setDriveBacking(false);
    };

    const formatDate = (iso) =>
        new Date(iso).toLocaleString('th-TH', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });

    const nextBackupText = () => {
        if (!driveLastBackup) return 'เร็วๆ นี้';
        const next = new Date(new Date(driveLastBackup).getTime() + 24 * 3600000);
        return next.toLocaleString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6 font-sarabun">

            {/* Header */}
            <div className="flex items-center gap-3">
                <FaDatabase className="text-2xl text-blue-600" />
                <div>
                    <h2 className="text-lg font-bold text-slate-800">Backup &amp; Restore</h2>
                    <p className="text-xs text-slate-400">สำรองและกู้คืนข้อมูลโครงการ</p>
                </div>
            </div>

            {/* Create Backup (Firestore) */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                    <FaCloudUploadAlt className="text-blue-500" /> สร้าง Backup ใหม่
                </h3>
                <div className="flex gap-3 items-end">
                    <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-500 mb-1">ชื่อ Backup (ไม่บังคับ)</label>
                        <input
                            type="text"
                            value={label}
                            onChange={e => setLabel(e.target.value)}
                            placeholder={`เช่น "ก่อนแก้ไขใหญ่" หรือ "สิ้นเดือน ${new Date().toLocaleDateString('th-TH', { month: 'long' })}"`}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
                            onKeyDown={e => e.key === 'Enter' && !creating && handleCreate()}
                        />
                    </div>
                    <button
                        onClick={handleCreate}
                        disabled={creating}
                        className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold rounded-lg text-sm transition shadow-sm whitespace-nowrap"
                    >
                        {creating ? <FaSpinner className="animate-spin" /> : <FaCloudUploadAlt />}
                        {creating ? 'กำลังบันทึก...' : 'สร้าง Backup'}
                    </button>
                    <button
                        onClick={handleDownloadCurrent}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 text-slate-700 font-bold rounded-lg text-sm transition shadow-sm whitespace-nowrap"
                        title="Download ข้อมูลปัจจุบันทั้งหมดเป็นไฟล์ JSON"
                    >
                        <FaDownload /> Download JSON
                    </button>
                </div>
                <p className="text-xs text-slate-400 mt-3">
                    ปัจจุบัน: <span className="font-bold text-slate-600">{system.projects?.length || 0} โครงการ</span>
                    &nbsp;· Backup จะบันทึกลง Firestore พร้อม timestamp ของวันที่สร้าง
                </p>
            </div>

            {/* ─── Google Drive Section ─── */}
            <div className={`rounded-xl border shadow-sm overflow-hidden ${driveEnabled ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-white'}`}>
                {/* Drive Header */}
                <div className="px-6 py-4 flex items-center gap-3 border-b border-slate-100">
                    <SiGoogledrive className={`text-xl ${driveEnabled ? 'text-green-600' : 'text-slate-400'}`} />
                    <div className="flex-1">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2">
                            Google Drive Auto-Backup
                            {driveEnabled && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                                    <FaCheckCircle size={9} /> เชื่อมต่อแล้ว
                                </span>
                            )}
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                            {driveEnabled
                                ? `บัญชี: ${driveEmail} · บันทึกอัตโนมัติทุก 24 ชั่วโมงเมื่อเปิดแอป`
                                : 'เชื่อมต่อเพื่อให้ระบบบันทึก Backup ไปยัง Google Drive รายวันโดยอัตโนมัติ'}
                        </p>
                    </div>
                    {driveEnabled ? (
                        <button
                            onClick={disconnectDrive}
                            className="text-xs text-red-400 hover:text-red-600 font-bold border border-red-200 hover:border-red-300 px-3 py-1.5 rounded-lg transition"
                        >
                            ตัดการเชื่อมต่อ
                        </button>
                    ) : (
                        <button
                            onClick={handleConnectDrive}
                            disabled={driveLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 hover:bg-blue-50 hover:border-blue-300 text-slate-700 font-bold rounded-lg text-sm transition shadow-sm whitespace-nowrap"
                        >
                            {driveLoading ? <FaSpinner className="animate-spin" /> : <SiGoogledrive className="text-blue-500" />}
                            เชื่อมต่อ Google Drive
                        </button>
                    )}
                </div>

                {driveEnabled && (
                    <div className="px-6 py-4 space-y-4">
                        {/* Auto-backup Status */}
                        <div className="flex flex-wrap gap-4 text-xs">
                            <div className="bg-white rounded-lg border border-green-100 px-4 py-3 flex-1 min-w-[180px]">
                                <div className="text-slate-400 mb-1">บันทึกอัตโนมัติล่าสุด</div>
                                <div className="font-bold text-slate-700">
                                    {driveLastBackup ? formatDate(driveLastBackup) : 'ยังไม่ได้บันทึก'}
                                </div>
                                {driveAutoBackupStatus === 'running' && (
                                    <div className="text-blue-500 flex items-center gap-1 mt-1">
                                        <FaSpinner className="animate-spin" size={10} /> กำลัง Auto-backup...
                                    </div>
                                )}
                                {driveAutoBackupStatus === 'done' && (
                                    <div className="text-green-600 flex items-center gap-1 mt-1">
                                        <FaCheckCircle size={10} /> Auto-backup สำเร็จแล้ว
                                    </div>
                                )}
                                {driveAutoBackupStatus === 'error' && (
                                    <div className="text-red-500 flex items-center gap-1 mt-1">
                                        <FaTimesCircle size={10} /> Auto-backup ล้มเหลว
                                    </div>
                                )}
                            </div>
                            <div className="bg-white rounded-lg border border-green-100 px-4 py-3 flex-1 min-w-[180px]">
                                <div className="text-slate-400 mb-1">บันทึกอัตโนมัติครั้งถัดไป</div>
                                <div className="font-bold text-slate-700">{nextBackupText()}</div>
                                <div className="text-slate-400 mt-1">เมื่อเปิดแอปหลังครบ 24 ชม.</div>
                            </div>
                        </div>

                        {/* Manual Drive Backup */}
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Backup ไปยัง Drive ทันที (ไม่บังคับระบุชื่อ)</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={driveLabel}
                                    onChange={e => setDriveLabel(e.target.value)}
                                    placeholder='เช่น "ก่อนปิดโครงการ"'
                                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-400"
                                    onKeyDown={e => e.key === 'Enter' && !driveBacking && handleBackupToDrive()}
                                />
                                <button
                                    onClick={handleBackupToDrive}
                                    disabled={driveBacking || driveLoading}
                                    className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-bold rounded-lg text-sm transition shadow-sm whitespace-nowrap"
                                >
                                    {driveBacking ? <FaSpinner className="animate-spin" /> : <SiGoogledrive />}
                                    {driveBacking ? 'กำลังอัปโหลด...' : 'Backup to Drive'}
                                </button>
                            </div>
                        </div>

                        {/* Drive Backups List Toggle */}
                        <div>
                            <button
                                onClick={() => setShowDriveList(v => !v)}
                                className="text-xs text-green-700 hover:text-green-900 font-bold flex items-center gap-1"
                            >
                                <FaSync size={10} className={driveLoading ? 'animate-spin' : ''} />
                                {showDriveList ? 'ซ่อนรายการไฟล์ใน Drive' : `ดูไฟล์ Backup ใน Drive (${driveBackupsList.length || '...'})`}
                            </button>

                            {showDriveList && (
                                <div className="mt-2 rounded-lg border border-green-100 bg-white overflow-hidden">
                                    {driveLoading && driveBackupsList.length === 0 ? (
                                        <div className="py-6 text-center text-slate-400 text-xs">
                                            <FaSpinner className="animate-spin inline mr-1" /> กำลังโหลด...
                                        </div>
                                    ) : driveBackupsList.length === 0 ? (
                                        <div className="py-6 text-center text-slate-400 text-xs">ยังไม่มีไฟล์ใน Drive</div>
                                    ) : (
                                        <div className="divide-y divide-slate-50">
                                            {driveBackupsList.map((f, idx) => (
                                                <div key={f.id} className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50 text-xs">
                                                    <span className="w-5 h-5 rounded-full bg-green-50 text-green-600 text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                                                        {idx + 1}
                                                    </span>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-bold text-slate-700 truncate">{f.name}</div>
                                                        <div className="text-slate-400">
                                                            {formatDate(f.createdTime)}
                                                        </div>
                                                    </div>
                                                    {f.webViewLink && (
                                                        <a
                                                            href={f.webViewLink}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 hover:bg-blue-50 hover:border-blue-200 text-slate-500 hover:text-blue-600 rounded-lg transition"
                                                        >
                                                            <FaExternalLinkAlt size={9} /> เปิด
                                                        </a>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {!driveEnabled && (
                    <div className="px-6 py-4 text-xs text-slate-500 space-y-1">
                        <p>✅ บันทึกอัตโนมัติทุกวันเมื่อเปิดแอป (ถ้าครบ 24 ชั่วโมง)</p>
                        <p>✅ ไฟล์จะอยู่ในโฟลเดอร์ <strong>PMS888 Backups</strong> ใน Google Drive ของคุณ</p>
                        <p>✅ เก็บสำรองได้สูงสุด 30 ไฟล์ล่าสุด</p>
                    </div>
                )}
            </div>

            {/* Backup List (Firestore) */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2">
                        <FaDatabase className="text-slate-400" /> รายการ Backup ({backupsList.length})
                    </h3>
                    <button
                        onClick={fetchBackups}
                        disabled={backupsLoading}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                    >
                        {backupsLoading ? <FaSpinner className="animate-spin" /> : '↻'} รีเฟรช
                    </button>
                </div>

                {backupsLoading && backupsList.length === 0 ? (
                    <div className="py-10 text-center text-slate-400 text-sm">
                        <FaSpinner className="animate-spin inline mr-2" /> กำลังโหลด...
                    </div>
                ) : backupsList.length === 0 ? (
                    <div className="py-10 text-center text-slate-400 text-sm">
                        ยังไม่มี Backup — กดปุ่ม "สร้าง Backup" เพื่อเริ่มต้น
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {backupsList.map((backup, idx) => (
                            <div key={backup.id} className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50 transition">
                                <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                                    {idx + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-slate-800 text-sm truncate">{backup.label}</div>
                                    <div className="text-xs text-slate-400 mt-0.5">
                                        {formatDate(backup.createdAt)}
                                        &nbsp;· {backup.projectCount} โครงการ
                                        &nbsp;· โดย {backup.createdBy?.includes('@') ? 'Admin' : backup.createdBy}
                                    </div>
                                </div>
                                <div className="flex gap-2 flex-shrink-0">
                                    <button
                                        onClick={() => handleDownloadBackup(backup)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-lg transition"
                                        title="Download Backup นี้เป็น JSON"
                                    >
                                        <FaDownload size={10} /> JSON
                                    </button>
                                    <button
                                        onClick={() => handleRestore(backup)}
                                        disabled={restoringId === backup.id}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white text-xs font-bold rounded-lg transition"
                                        title="กู้คืนข้อมูลจาก Backup นี้"
                                    >
                                        {restoringId === backup.id
                                            ? <FaSpinner className="animate-spin" size={10} />
                                            : <FaUndo size={10} />}
                                        Restore
                                    </button>
                                    <button
                                        onClick={() => handleDelete(backup)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-200 hover:bg-red-50 text-red-400 hover:text-red-600 text-xs font-bold rounded-lg transition"
                                        title="ลบ Backup นี้"
                                    >
                                        <FaTrash size={10} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Note */}
            <div className="text-xs text-slate-400 bg-slate-50 rounded-lg p-4 border border-slate-200">
                <strong>หมายเหตุ:</strong>
                &nbsp;Backup (Firestore) เก็บสูงสุด 30 รายการ · Drive Backup เก็บสูงสุด 30 ไฟล์
                &nbsp;· Restore จะแทนที่ข้อมูลปัจจุบันทั้งหมด แนะนำให้สร้าง Backup ก่อน Restore ทุกครั้ง
            </div>
        </div>
    );
};

export default BackupPage;
