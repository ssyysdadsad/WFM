// pages/schedule/schedule.ts
import { requireAuth, getEmployee } from '../../utils/auth'
import { query } from '../../utils/supabase'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

Page({
  data: {
    loading: false,
    weekdays: WEEKDAYS,
    year: 0,
    month: 0,
    calendarDays: [] as any[],
    schedule: {} as Record<string, any>,
    shiftTypes: {} as Record<string, any>,
    selectedDay: 0,
    selectedWeekday: '',
    selectedDetail: null as any,
    legendItems: [] as any[],
    // New fields for Figma design
    employee: { name: '', no: '', department: '' } as any,
    viewMode: 'month',
    totalPlannedHours: 0,
    totalActualHours: 0,
    searchValue: '',
    weekDays: [] as any[],
    weekLabel: '',
  },

  onShow() {
    if (!requireAuth()) return
    // Load employee info
    const emp = getEmployee()
    if (emp) {
      this.setData({
        employee: {
          name: emp.name,
          no: emp.no,
          department: emp.department,
        },
      })
    }
    const now = new Date()
    this.setData({ year: now.getFullYear(), month: now.getMonth() + 1, selectedDay: now.getDate() })
    this.loadMonth()
  },

  prevMonth() {
    let { year, month } = this.data
    month--
    if (month < 1) { month = 12; year-- }
    this.setData({ year, month, selectedDay: 0, selectedDetail: null })
    this.loadMonth()
  },

  nextMonth() {
    let { year, month } = this.data
    month++
    if (month > 12) { month = 1; year++ }
    this.setData({ year, month, selectedDay: 0, selectedDetail: null })
    this.loadMonth()
  },

  selectDay(e: any) {
    const day = e.currentTarget.dataset.day
    if (!day) return
    const { schedule, shiftTypes, month } = this.data
    const s = schedule[String(day)]
    const code = s?.code || '休'
    const style = shiftTypes[code] || { bg: '#F5F5F5', text: '#9E9E9E', label: '休' }
    const date = new Date(this.data.year, month - 1, day)
    this.setData({
      selectedDay: day,
      selectedWeekday: WEEKDAYS[date.getDay()],
      selectedDetail: s ? { ...s, style } : null,
    })
  },

  switchView(e: any) {
    const mode = e.currentTarget.dataset.mode
    this.setData({ viewMode: mode })
    if (mode === 'week') {
      this.buildWeekDays()
    } else if (mode === 'day') {
      this.buildDayView()
    }
  },

  // ===== Week View =====
  buildWeekDays() {
    const { year, month, selectedDay, schedule, shiftTypes } = this.data
    const current = new Date(year, month - 1, selectedDay || new Date().getDate())
    const dow = current.getDay()
    const startOfWeek = new Date(current)
    startOfWeek.setDate(current.getDate() - dow)

    const today = new Date()
    const weekDays: any[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek)
      d.setDate(startOfWeek.getDate() + i)
      const day = d.getDate()
      const m = d.getMonth() + 1
      const y = d.getFullYear()
      const isThisMonth = y === year && m === month
      const s = isThisMonth ? schedule[String(day)] : null
      const code = s?.code || ''
      const style = code ? (shiftTypes[code] || { bg: '#F5F5F5', text: '#9E9E9E', label: code }) : {}

      weekDays.push({
        day,
        month: m,
        year: y,
        weekdayLabel: WEEKDAYS[d.getDay()],
        code,
        style,
        hours: s?.hours || 0,
        isToday: d.toDateString() === today.toDateString(),
      })
    }

    const s = startOfWeek
    const e2 = new Date(startOfWeek)
    e2.setDate(s.getDate() + 6)
    const weekLabel = `${s.getMonth() + 1}/${s.getDate()} - ${e2.getMonth() + 1}/${e2.getDate()}`

    this.setData({ weekDays, weekLabel })
  },

  prevWeek() {
    const { year, month, selectedDay } = this.data
    const d = new Date(year, month - 1, selectedDay || 1)
    d.setDate(d.getDate() - 7)
    this.setData({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      selectedDay: d.getDate(),
    })
    this.loadMonth().then(() => this.buildWeekDays())
  },

  nextWeek() {
    const { year, month, selectedDay } = this.data
    const d = new Date(year, month - 1, selectedDay || 1)
    d.setDate(d.getDate() + 7)
    this.setData({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      selectedDay: d.getDate(),
    })
    this.loadMonth().then(() => this.buildWeekDays())
  },

  selectWeekDay(e: any) {
    const { day, month: m, year: y } = e.currentTarget.dataset
    if (y === this.data.year && m === this.data.month) {
      this.selectDay({ currentTarget: { dataset: { day } } })
      this.buildWeekDays()
    } else {
      this.setData({ year: y, month: m, selectedDay: day })
      this.loadMonth().then(() => {
        this.selectDay({ currentTarget: { dataset: { day } } })
        this.buildWeekDays()
      })
    }
  },

  // ===== Day View =====
  buildDayView() {
    const { selectedDay } = this.data
    if (selectedDay) {
      this.selectDay({ currentTarget: { dataset: { day: selectedDay } } })
    }
  },

  prevDay() {
    const { year, month, selectedDay } = this.data
    const d = new Date(year, month - 1, selectedDay || 1)
    d.setDate(d.getDate() - 1)
    const newMonth = d.getMonth() + 1
    const newYear = d.getFullYear()
    if (newMonth !== month || newYear !== year) {
      this.setData({ year: newYear, month: newMonth, selectedDay: d.getDate() })
      this.loadMonth().then(() => this.buildDayView())
    } else {
      this.setData({ selectedDay: d.getDate() })
      this.buildDayView()
    }
  },

  nextDay() {
    const { year, month, selectedDay } = this.data
    const daysInMonth = new Date(year, month, 0).getDate()
    const d = new Date(year, month - 1, selectedDay || 1)
    d.setDate(d.getDate() + 1)
    const newMonth = d.getMonth() + 1
    const newYear = d.getFullYear()
    if (newMonth !== month || newYear !== year) {
      this.setData({ year: newYear, month: newMonth, selectedDay: d.getDate() })
      this.loadMonth().then(() => this.buildDayView())
    } else {
      this.setData({ selectedDay: d.getDate() })
      this.buildDayView()
    }
  },

  onSearchInput(e: any) {
    this.setData({ searchValue: e.detail.value })
    const val = parseInt(e.detail.value)
    if (val > 0 && val <= 31) {
      this.selectDay({ currentTarget: { dataset: { day: val } } })
    }
  },

  exportImage() {
    wx.showToast({ title: '功能开发中', icon: 'none' })
  },

  async loadMonth() {
    this.setData({ loading: true })
    try {
      const emp = getEmployee()
      if (!emp) return

      const { year, month } = this.data
      const yearMonth = `${year}-${String(month).padStart(2, '0')}`
      const daysInMonth = new Date(year, month, 0).getDate()
      const firstDow = new Date(year, month - 1, 1).getDay()
      const startDate = `${yearMonth}-01`
      const endDate = `${yearMonth}-${String(daysInMonth).padStart(2, '0')}`

      // 查找当前已发布的激活版本
      const activeVersions: any[] = await query('schedule_version',
        `is_active=eq.true&published_at=not.is.null&select=id`
      )
      
      let rows: any[] = []
      if (activeVersions && activeVersions.length > 0) {
        const versionIds = activeVersions.map(v => v.id)
        const versionFilter = `&schedule_version_id=in.(${versionIds.join(',')})`
        
        // Fetch schedule（只查已发布的激活版本数据）
        rows = await query('schedule',
          `employee_id=eq.${emp.id}&schedule_date=gte.${startDate}&schedule_date=lte.${endDate}${versionFilter}&select=schedule_date,schedule_code_dict_item_id,planned_hours,project_id&order=schedule_date`
        )
      }

      // Fetch code items
      const codeIds = [...new Set(rows.map(r => r.schedule_code_dict_item_id).filter(Boolean))]
      let codeMap: Record<string, any> = {}
      if (codeIds.length > 0) {
        const codes: any[] = await query('dict_item', `id=in.(${codeIds.join(',')})&select=id,item_code,item_name,extra_config`)
        codes.forEach(c => { codeMap[c.id] = c })
      }

      // Fetch shift types config
      const dtList: any[] = await query('dict_type', 'select=id,type_code')
      const schedTypeId = dtList.find(t => t.type_code === 'schedule_code' || t.type_code === 'shift_code')?.id
      const shiftTypeId = dtList.find(t => t.type_code === 'shift_type')?.id

      let shiftItemMap: Record<string, any> = {}
      if (shiftTypeId) {
        const items: any[] = await query('dict_item', `dict_type_id=eq.${shiftTypeId}&is_enabled=eq.true&select=id,item_code,item_name,extra_config`)
        items.forEach(s => { shiftItemMap[s.item_code] = s })
      }

      // Build shift types
      const PALETTE = [
        { bg: '#E8F5E9', text: '#2E7D32' }, { bg: '#E3F2FD', text: '#1565C0' },
        { bg: '#FFF3E0', text: '#E65100' }, { bg: '#F3E5F5', text: '#7B1FA2' },
      ]
      const shiftTypes: Record<string, any> = {}
      const legendItems: any[] = []

      if (schedTypeId) {
        const allCodes: any[] = await query('dict_item', `dict_type_id=eq.${schedTypeId}&is_enabled=eq.true&select=id,item_code,item_name,extra_config&order=sort_order`)
        allCodes.forEach((c, i) => {
          const extra = c.extra_config || {}
          const category = extra.category || 'work'
          const isRest = category === 'rest' || category === 'leave'
          const color = extra.color ? { bg: extra.color + '20', text: extra.color }
            : isRest ? { bg: '#F5F5F5', text: '#9E9E9E' } : PALETTE[i % PALETTE.length]

          const relCode = extra.related_shift_type_item_code
          const shift = relCode ? shiftItemMap[relCode] : null
          const sExtra = shift?.extra_config || {}
          const rawTime = sExtra.start_time && sExtra.end_time ? `${sExtra.start_time}-${sExtra.end_time}` : ''
          const displayTime = (isRest || rawTime === '00:00-00:00') ? '' : rawTime

          // 用 item_name 作 key（如 A1, B2, 休）
          shiftTypes[c.item_name] = {
            bg: color.bg, text: color.text,
            label: shift ? `${shift.item_name} ${displayTime}` : c.item_name,
            category,
            hours: Number(sExtra.planned_hours || extra.standard_hours || 0),
            time: displayTime,
          }
          legendItems.push({ code: c.item_name, label: shift ? shift.item_name : c.item_name, bg: color.bg, text: color.text })
        })
      }

      // Build schedule map + calc total hours
      const schedule: Record<string, any> = {}
      let totalPlannedHours = 0
      rows.forEach(row => {
        const day = new Date(row.schedule_date).getDate()
        const code = codeMap[row.schedule_code_dict_item_id]
        const codeStr = code?.item_name || '休'
        const extra = code?.extra_config || {}
        const category = extra.category || 'rest'
        const isRest = category === 'rest' || category === 'leave'
        const relCode = extra.related_shift_type_item_code
        const shiftItem = relCode ? shiftItemMap[relCode] : null
        const sExtra = shiftItem?.extra_config || {}
        const rawTime = sExtra.start_time && sExtra.end_time ? `${sExtra.start_time}-${sExtra.end_time}` : ''
        const hours = Number(row.planned_hours) || 0

        if (!isRest) totalPlannedHours += hours

        schedule[String(day)] = {
          code: codeStr,
          category,
          hours,
          time: (isRest || rawTime === '00:00-00:00') ? '' : rawTime,
          project: '',
        }
      })

      // Build calendar cells
      const today = new Date()
      const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month
      const calendarDays: any[] = []

      // Empty cells for first week offset
      for (let i = 0; i < firstDow; i++) {
        calendarDays.push({ day: 0, code: '', style: {} })
      }
      for (let d = 1; d <= daysInMonth; d++) {
        const s = schedule[String(d)]
        const code = s?.code || ''
        const style = code ? (shiftTypes[code] || { bg: '#F5F5F5', text: '#9E9E9E' }) : {}
        calendarDays.push({
          day: d,
          code,
          style,
          isToday: isCurrentMonth && d === today.getDate(),
        })
      }

      this.setData({
        schedule, shiftTypes, calendarDays, legendItems,
        totalPlannedHours: Math.round(totalPlannedHours),
        totalActualHours: 0, // 暂无实际工时数据
        loading: false,
      })

      // Auto-select today
      if (isCurrentMonth && this.data.selectedDay) {
        this.selectDay({ currentTarget: { dataset: { day: this.data.selectedDay } } })
      }
    } catch (err) {
      console.error('Schedule load error:', err)
      this.setData({ loading: false })
    }
  },
})
