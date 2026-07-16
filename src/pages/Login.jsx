import React, { useState } from 'react';
import { useProject } from '../context/ProjectContext';
import { FaUserShield, FaUser, FaLock, FaUserCircle } from 'react-icons/fa';

const Login = () => {
    const { login, maintenanceMode, maintenanceMessage } = useProject();

    // เปลี่ยนจาก email เป็น username
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    
    const [error, setError] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoggingIn(true);
        
        // --- ส่วนสำคัญ: แปลง Username สั้นๆ ให้เป็น Email ---
        let emailToLogin = username;
        
        // ถ้าพิมพ์มาแค่ชื่อสั้นๆ (ไม่มี @) ให้เติมหางให้
        if (!username.includes('@')) {
            if (username === 'user') emailToLogin = 'staff@nutcon.com';
            else emailToLogin = `${username}@nutcon.com`;
        }
        // ------------------------------------------------

        const success = await login(emailToLogin, password);
        
        if (success) {
            // ผ่าน
        } else {
            setError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
            setIsLoggingIn(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center font-sarabun px-4">
            <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-sm relative overflow-hidden animate-fade-in-up">
                
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-purple-500"></div>
                
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-slate-800 mb-2 tracking-tight">PMS 888</h1>
                    <p className="text-slate-500 text-sm font-medium">เข้าสู่ระบบ (Cloud System)</p>
                </div>

                {maintenanceMode && (
                    <div className="mb-5 bg-orange-50 border border-orange-200 rounded-xl p-3 flex items-start gap-2.5">
                        <span className="text-lg mt-0.5">🔧</span>
                        <div>
                            <p className="text-xs font-bold text-orange-700">ระบบปิดปรับปรุงชั่วคราว</p>
                            <p className="text-xs text-orange-600 mt-0.5">{maintenanceMessage}</p>
                        </div>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    
                    {/* เปลี่ยนช่อง Email เป็น Username */}
                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
                            ชื่อผู้ใช้ (Username)
                        </label>
                        <div className="relative group">
                            <span className="absolute left-3 top-3 text-slate-400 group-focus-within:text-blue-500 transition">
                                <FaUserCircle/>
                            </span>
                            <input 
                                type="text" 
                                className="w-full pl-10 p-2.5 border border-slate-300 rounded-lg bg-slate-50 text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition text-sm font-bold"
                                placeholder="UserName"  // Placeholder เปลี่ยน
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
                            รหัสผ่าน (Password)
                        </label>
                        <div className="relative group">
                            <span className="absolute left-3 top-3 text-slate-400 group-focus-within:text-blue-500 transition">
                                <FaLock/>
                            </span>
                            <input 
                                type="password" 
                                className="w-full pl-10 p-2.5 border border-slate-300 rounded-lg bg-slate-50 text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition text-sm font-bold"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="text-red-500 text-xs text-center font-bold bg-red-50 border border-red-100 p-3 rounded-lg animate-pulse flex items-center justify-center gap-2">
                            <i className="fas fa-exclamation-circle"></i> {error}
                        </div>
                    )}

                    <button 
                        disabled={isLoggingIn}
                        className={`w-full py-3 rounded-xl font-bold text-white transition-all shadow-lg mt-4 flex justify-center items-center gap-2 transform active:scale-95
                            ${isLoggingIn 
                                ? 'bg-slate-400 cursor-not-allowed shadow-none' 
                                : 'bg-slate-800 hover:bg-slate-900 hover:shadow-xl'
                            }`}
                    >
                        {isLoggingIn ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}
                    </button>
                </form>
            </div>
            
            <div className="fixed bottom-4 text-slate-500 text-[10px] opacity-50">
                &copy; 2024 NUT CON. Construction System
            </div>
        </div>
    );
};

export default Login;