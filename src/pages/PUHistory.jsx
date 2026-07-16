import React, { useState } from 'react';
import { useProject } from '../context/ProjectContext';
import { FaPrint } from 'react-icons/fa';
import PrintModal from '../components/PrintModal'; // Import Modal

const PUHistory = () => {
    const { currentProjectData } = useProject();
    const puList = (currentProjectData.docs || []).filter(d => d.type === 'PU').reverse();
    const [previewData, setPreviewData] = useState(null); // State สำหรับ Modal

    return (
        <div className="max-w-5xl mx-auto">
            <h2 className="font-bold mb-4 text-green-600 text-lg">ประวัติการจัดซื้อ (PU History)</h2>
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b">
                        <tr>
                            <th className="p-4">เลขที่ PU</th>
                            <th className="p-4">อ้างอิง PO</th>
                            <th className="p-4">วันที่</th>
                            <th className="p-4 text-right">ยอดรวมจ่ายจริง</th>
                            <th className="p-4 text-center w-20">พิมพ์</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {puList.length === 0 ? (
                            <tr><td colSpan="5" className="p-6 text-center text-slate-400">ยังไม่มีข้อมูล</td></tr>
                        ) : (
                            puList.map(doc => {
                                const totalAmount = doc.items.reduce((sum, item) => sum + (item.total || 0), 0);
                                return (
                                    <tr key={doc.id} className="hover:bg-slate-50 transition">
                                        <td className="p-4 font-bold text-green-600">{doc.no}</td>
                                        <td className="p-4 text-slate-500">{doc.ref}</td>
                                        <td className="p-4 text-slate-500">{new Date(doc.date).toLocaleDateString('th-TH')}</td>
                                        <td className="p-4 text-right font-bold text-slate-700">
                                            {totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}
                                        </td>
                                        <td className="p-4 text-center">
                                            <button 
                                                onClick={() => setPreviewData(doc)}
                                                className="text-slate-400 hover:text-green-600 transition"
                                            >
                                                <FaPrint size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Print Modal */}
            <PrintModal 
                isOpen={!!previewData} 
                onClose={() => setPreviewData(null)} 
                data={previewData} 
            />
        </div>
    );
};

export default PUHistory;