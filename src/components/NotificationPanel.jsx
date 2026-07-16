import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useProject } from '../context/ProjectContext';
import { FaBell, FaTimes, FaCheckDouble, FaCircle } from 'react-icons/fa';

const TYPE_STYLES = {
    info:    { unreadBg: 'bg-blue-50',  border: 'border-l-blue-400',  icon: '💬', dot: 'bg-blue-500',   title: 'text-blue-800',  titleRead: 'text-slate-600' },
    success: { unreadBg: 'bg-green-50', border: 'border-l-green-400', icon: '✅', dot: 'bg-green-500',  title: 'text-green-800', titleRead: 'text-slate-600' },
    warning: { unreadBg: 'bg-amber-50', border: 'border-l-amber-400', icon: '⚠️', dot: 'bg-amber-500',  title: 'text-amber-800', titleRead: 'text-slate-600' },
    error:   { unreadBg: 'bg-red-50',   border: 'border-l-red-400',   icon: '🚨', dot: 'bg-red-500',    title: 'text-red-800',   titleRead: 'text-slate-600' },
};

const timeAgo = (iso) => {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (m < 1)  return 'เมื่อกี้';
    if (m < 60) return `${m} นาทีที่แล้ว`;
    if (h < 24) return `${h} ชั่วโมงที่แล้ว`;
    return `${d} วันที่แล้ว`;
};

const NotificationPanel = () => {
    const { myNotifications, unreadNotifications, markNotificationRead, markAllRead } = useProject();
    const [open,     setOpen]     = useState(false);
    const [showRead, setShowRead] = useState(false);
    const [panelPos, setPanelPos] = useState({ top: 0, right: 0 });
    const buttonRef = useRef(null);
    const panelRef  = useRef(null);

    const handleOpen = () => {
        if (!open && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setPanelPos({
                top:   rect.bottom + 8,
                right: window.innerWidth - rect.right,
            });
        }
        setOpen(o => !o);
    };

    // ปิด panel เมื่อคลิกนอก
    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (
                panelRef.current  && !panelRef.current.contains(e.target) &&
                buttonRef.current && !buttonRef.current.contains(e.target)
            ) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const displayed = showRead ? myNotifications : unreadNotifications;
    const unreadCount = unreadNotifications.length;

    return (
        <div className="relative">
            {/* Bell Button */}
            <button
                ref={buttonRef}
                onClick={handleOpen}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold border transition shadow-sm
                    ${open
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                title="การแจ้งเตือน"
            >
                <FaBell className={unreadCount > 0 ? 'text-amber-500' : ''} />
                {unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown Panel — portal ไป body เพื่อหนี stacking context ของ top bar
                (ไม่งั้นโดน sticky toolbar/หัวตารางของ Master BOQ ที่ z สูงกว่าทับ) */}
            {open && createPortal(
                <div
                    ref={panelRef}
                    style={{ position: 'fixed', top: panelPos.top, right: panelPos.right }}
                    className="w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-[999] overflow-hidden"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                        <div className="flex items-center gap-2">
                            <FaBell className="text-amber-500 text-sm" />
                            <span className="font-bold text-slate-700 text-sm">การแจ้งเตือน</span>
                            {unreadCount > 0 && (
                                <span className="bg-red-100 text-red-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                    {unreadCount} ใหม่
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            {unreadCount > 0 && (
                                <button
                                    onClick={markAllRead}
                                    className="text-[10px] text-blue-500 hover:text-blue-700 font-medium flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-50 transition"
                                    title="อ่านทั้งหมด"
                                >
                                    <FaCheckDouble className="text-[9px]" /> อ่านทั้งหมด
                                </button>
                            )}
                            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded">
                                <FaTimes className="text-xs" />
                            </button>
                        </div>
                    </div>

                    {/* Toggle show read */}
                    {myNotifications.length > unreadCount && (
                        <div className="px-4 py-2 border-b border-slate-100 flex justify-end">
                            <button
                                onClick={() => setShowRead(s => !s)}
                                className="text-[10px] text-slate-400 hover:text-slate-600 font-medium transition"
                            >
                                {showRead ? 'ซ่อนที่อ่านแล้ว' : `แสดงที่อ่านแล้วด้วย (${myNotifications.length - unreadCount})`}
                            </button>
                        </div>
                    )}

                    {/* Notification List */}
                    <div className="max-h-96 overflow-y-auto">
                        {displayed.length === 0 ? (
                            <div className="py-10 text-center text-slate-400 text-sm">
                                <FaBell className="text-2xl mx-auto mb-2 opacity-30" />
                                <div>ไม่มีการแจ้งเตือน</div>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {displayed.map(n => {
                                    const style  = TYPE_STYLES[n.type] || TYPE_STYLES.info;
                                    const isRead = !unreadNotifications.find(u => u.id === n.id);
                                    return (
                                        <div
                                            key={n.id}
                                            onClick={() => !isRead && markNotificationRead(n.id)}
                                            className={`px-4 py-3.5 border-l-4 transition cursor-default
                                                ${isRead
                                                    ? 'bg-white border-l-transparent hover:bg-slate-50'
                                                    : `${style.unreadBg} ${style.border} hover:brightness-95`
                                                }`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <span className="text-xl flex-shrink-0 mt-0.5 leading-none">{style.icon}</span>
                                                <div className="flex-1 min-w-0">
                                                    {/* Title row */}
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                        {!isRead && (
                                                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${style.dot}`} />
                                                        )}
                                                        <span className={`font-bold text-[13px] leading-tight ${isRead ? style.titleRead : style.title}`}>
                                                            {n.title}
                                                        </span>
                                                    </div>
                                                    {/* Message */}
                                                    <p className={`text-[12px] leading-relaxed ${isRead ? 'text-slate-400' : 'text-slate-700'}`}>
                                                        {n.message}
                                                    </p>
                                                    {/* Footer row */}
                                                    <div className="flex items-center justify-between mt-2">
                                                        <span className={`text-[10px] ${isRead ? 'text-slate-300' : 'text-slate-400'}`}>
                                                            {timeAgo(n.createdAt)}
                                                        </span>
                                                        {!isRead && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); markNotificationRead(n.id); }}
                                                                className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold bg-white/70 hover:bg-white px-2 py-0.5 rounded-full border border-blue-200 transition"
                                                            >
                                                                รับทราบ
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default NotificationPanel;
