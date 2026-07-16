import React, { useState } from 'react'; // Import useState
import { useProject } from '../context/ProjectContext';
import PrintModal from '../components/PrintModal'; // Import Modal
import { FaPrint } from 'react-icons/fa';

const POHistory = () => {
    const { currentProjectData } = useProject();
    const poList = (currentProjectData.docs || []).filter(d => d.type === 'PO').reverse();
    
    // State สำหรับ Modal
    const [previewData, setPreviewData] = useState(null);

    return (
        <div className="max-w-5xl mx-auto">
            <h2 className="font-bold mb-4 text-slate-700 text-lg">ประวัติใบสั่งซื้อ (PO History)</h2>
            
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b">
                        <tr>
                            <th className="p-4">เลขที่ PO</th>
                            <th className="p-4">วันที่</th>
                            <th className="p-4">ร้านค้า/ผู้รับจ้าง</th>
                            <th className="p-4 text-center">รายการ</th>
                            <th className="p-4 text-right">มูลค่ารวม</th>
                            <th className="p-4 text-center">สถานะ</th>
                            <th className="p-4 text-center w-20">พิมพ์</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {poList.length === 0 ? (
                            <tr><td colSpan="7" className="p-6 text-center text-slate-400">ไม่พบประวัติการสั่งจ้าง</td></tr>
                        ) : (
                            poList.map(doc => {
                                const total = doc.items.reduce((s, i) =>
                                    s + (i.mTotal || 0) + (i.lTotal || 0), 0);
                                return (
                                    <tr key={doc.id} className="hover:bg-slate-50 transition">
                                        <td className="p-4 font-bold text-orange-600">{doc.no}</td>
                                        <td className="p-4 text-slate-500">{new Date(doc.date).toLocaleDateString('th-TH')}</td>
                                        <td className="p-4 font-medium">{doc.contractor || '-'}</td>
                                        <td className="p-4 text-center"><span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold border">{doc.items.length} รายการ</span></td>
                                        <td className="p-4 text-right font-mono text-slate-700">
                                            {total > 0 ? total.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${doc.status === 'DONE' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                {doc.status === 'DONE' ? 'จัดซื้อแล้ว' : 'รอจัดซื้อ'}
                                            </span>
                                        </td>
                                        <td className="p-4 text-center">
                                            <button
                                                onClick={() => setPreviewData(doc)}
                                                className="text-slate-400 hover:text-blue-600 transition"
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

            {/* เรียกใช้ Modal */}
            <PrintModal 
                isOpen={!!previewData} 
                onClose={() => setPreviewData(null)} 
                data={previewData} 
            />
        </div>
    );
};

export default POHistory;