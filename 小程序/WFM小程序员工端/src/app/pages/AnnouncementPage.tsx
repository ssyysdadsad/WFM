import { useState, useEffect } from 'react';
import { Bell, ChevronRight, Megaphone, Settings, BookOpen, Loader2 } from 'lucide-react';
import { getAnnouncements, getAnnouncementDetail } from '../services/api';

const typeIcons: Record<string, { icon: typeof Bell; color: string; bg: string }> = {
  '排班通知': { icon: Bell, color: '#2895FF', bg: '#EBF4FF' },
  '调班通知': { icon: Settings, color: '#12B8A0', bg: '#E4FAF5' },
  '系统通知': { icon: Megaphone, color: '#7B6FE2', bg: '#EEEAFF' },
  '培训通知': { icon: BookOpen, color: '#F08235', bg: '#FFF2E8' },
};

export function AnnouncementPage() {
  const [selectedType, setSelectedType] = useState('全部');
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [selectedAnn, setSelectedAnn] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  const types = ['全部', '排班通知', '调班通知', '系统通知', '培训通知'];

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await getAnnouncements(selectedType);
        if (res.success) setAnnouncements(res.data || []);
      } catch (err) { console.error('Load announcements error:', err); }
      finally { setLoading(false); }
    }
    load();
  }, [selectedType]);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await getAnnouncementDetail(id);
      if (res.success) setSelectedAnn(res.data);
    } catch (err) { console.error('Load detail error:', err); }
    finally { setDetailLoading(false); }
  };

  if (selectedAnn) {
    const ti = typeIcons[selectedAnn.type] || typeIcons['系统通知'];
    const Icon = ti.icon;
    return (
      <div className="flex-1 overflow-y-auto flex flex-col" style={{ background: 'linear-gradient(160deg, #F6F8FA 0%, #E9F4FF 100%)' }}>
        <div className="bg-white px-5 pt-3 pb-3 shrink-0 border-b border-[#DDE9FF]">
          <button onClick={() => setSelectedAnn(null)} className="text-[13px] text-[#2895FF] mb-2">← 返回列表</button>
          <h2 className="text-[16px] font-semibold text-[#1A2E4A]">公告详情</h2>
        </div>
        <div className="px-5 pt-4 pb-4">
          <div className="bg-white rounded-xl p-5 shadow-[0_2px_10px_rgba(40,149,255,0.08)] border border-[#DDE9FF]">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: ti.bg }}>
                <Icon size={16} style={{ color: ti.color }} />
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: ti.bg, color: ti.color }}>{selectedAnn.type}</span>
            </div>
            <h3 className="text-[15px] font-semibold text-[#1A2E4A] mb-2">{selectedAnn.title}</h3>
            <p className="text-[11px] text-[#A3B5C8] mb-4">{selectedAnn.date} 发布</p>
            <div className="text-[13px] text-[#4A5E75] leading-relaxed">{selectedAnn.content}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto flex flex-col" style={{ background: 'linear-gradient(160deg, #F6F8FA 0%, #E9F4FF 100%)' }}>
      {/* Header with teal-green accent */}
      <div className="bg-white px-5 pt-3 pb-3 shrink-0 border-b border-[#DDE9FF]">
        <h2 className="text-[16px] font-semibold text-[#1A2E4A] mb-3">公告通知</h2>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {types.map(t => (
            <button key={t} onClick={() => setSelectedType(t)}
              className={`px-3 py-1 rounded-full text-[12px] whitespace-nowrap transition-all ${
                selectedType === t
                  ? 'text-white shadow-sm'
                  : 'bg-[#F6F8FA] text-[#A3B5C8] border border-[#DDE9FF]'
              }`}
              style={selectedType === t ? { background: 'linear-gradient(90deg, #2895FF, #62D9FF)' } : {}}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-3 pb-4 space-y-3">
        {loading || detailLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-[#2895FF]" />
          </div>
        ) : announcements.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[#C0CFDD]">
            <Bell size={40} className="mb-2" />
            <p className="text-[13px]">暂无公告</p>
          </div>
        ) : (
          announcements.map(a => {
            const ti = typeIcons[a.type] || typeIcons['系统通知'];
            const Icon = ti.icon;
            return (
              <button key={a.id} onClick={() => openDetail(a.id)}
                className="w-full bg-white rounded-xl p-4 shadow-[0_1px_6px_rgba(40,149,255,0.07)] border border-[#DDE9FF] flex items-start gap-3 text-left">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: ti.bg }}>
                  <Icon size={18} style={{ color: ti.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-[13px] font-medium text-[#1A2E4A] truncate">{a.title}</h4>
                    <ChevronRight size={16} className="text-[#C0CFDD] shrink-0" />
                  </div>
                  <p className="text-[11px] text-[#A3B5C8] line-clamp-1">{a.content}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: ti.bg, color: ti.color }}>{a.type}</span>
                    <span className="text-[10px] text-[#C0CFDD]">{a.date}</span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}