// pages/announcement/announcement.ts
import { requireAuth } from '../../utils/auth'
import { query } from '../../utils/supabase'

const TYPE_STYLES: Record<string, { emoji: string; bg: string; color: string }> = {
  '排班通知': { emoji: '🔔', bg: '#EBF4FF', color: '#2895FF' },
  '调班通知': { emoji: '⚙️', bg: '#E4FAF5', color: '#12B8A0' },
  '系统通知': { emoji: '📢', bg: '#EEEAFF', color: '#7B6FE2' },
  '培训通知': { emoji: '📖', bg: '#FFF2E8', color: '#F08235' },
}
const DEFAULT_STYLE = { emoji: '📢', bg: '#EEEAFF', color: '#7B6FE2' }

Page({
  data: {
    loading: false,
    types: ['全部', '排班通知', '调班通知', '系统通知', '培训通知'],
    selectedType: '全部',
    announcements: [] as any[],
    allAnnouncements: [] as any[],
    selectedAnn: null as any,
  },

  onShow() {
    if (!requireAuth()) return
    this.loadAnnouncements()
  },

  onTypeChange(e: any) {
    const type = e.currentTarget.dataset.type
    this.setData({ selectedType: type })
    this.filterList(type)
  },

  filterList(type: string) {
    const { allAnnouncements } = this.data
    const filtered = type === '全部' ? allAnnouncements : allAnnouncements.filter(a => a.type === type)
    this.setData({ announcements: filtered })
  },

  async loadAnnouncements() {
    this.setData({ loading: true })
    try {
      const rows: any[] = await query('announcement',
        'select=id,title,content,announcement_type_dict_item_id,published_at,is_pinned&order=is_pinned.desc,published_at.desc'
      )

      // Get type names
      const typeIds = [...new Set((rows || []).map(r => r.announcement_type_dict_item_id).filter(Boolean))]
      let typeMap: Record<string, string> = {}
      if (typeIds.length > 0) {
        const types: any[] = await query('dict_item', `id=in.(${typeIds.join(',')})&select=id,item_name`)
        types.forEach(t => { typeMap[t.id] = t.item_name })
      }

      const allAnnouncements = (rows || []).map(r => {
        const typeName = typeMap[r.announcement_type_dict_item_id] || '通知'
        const style = TYPE_STYLES[typeName] || DEFAULT_STYLE
        return {
          id: r.id,
          title: r.title,
          content: r.content,
          type: typeName,
          date: r.published_at ? r.published_at.split('T')[0] : '',
          emoji: style.emoji,
          tagBg: style.bg,
          tagColor: style.color,
          isPinned: r.is_pinned ?? false,
        }
      })

      this.setData({ allAnnouncements, loading: false })
      this.filterList(this.data.selectedType)
    } catch (err) {
      console.error('Load announcements error:', err)
      this.setData({ loading: false })
    }
  },

  async openDetail(e: any) {
    const id = e.currentTarget.dataset.id
    try {
      const rows: any[] = await query('announcement',
        `id=eq.${id}&select=id,title,content,announcement_type_dict_item_id,published_at&limit=1`
      )
      if (!rows || rows.length === 0) return
      const r = rows[0]

      let typeName = '通知'
      if (r.announcement_type_dict_item_id) {
        const types: any[] = await query('dict_item', `id=eq.${r.announcement_type_dict_item_id}&select=item_name&limit=1`)
        typeName = types?.[0]?.item_name || '通知'
      }
      const style = TYPE_STYLES[typeName] || DEFAULT_STYLE

      this.setData({
        selectedAnn: {
          id: r.id,
          title: r.title,
          content: r.content,
          type: typeName,
          date: r.published_at ? r.published_at.split('T')[0] : '',
          tagBg: style.bg,
          tagColor: style.color,
        },
      })
    } catch (err) {
      console.error('Load detail error:', err)
    }
  },

  closeDetail() {
    this.setData({ selectedAnn: null })
  },
})
