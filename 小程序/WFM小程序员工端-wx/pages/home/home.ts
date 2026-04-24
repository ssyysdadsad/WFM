// pages/home/home.ts
import { requireAuth, getEmployee } from '../../utils/auth'
import { query } from '../../utils/supabase'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

Page({
  data: {
    loading: true,
    employee: {} as any,
    nameInitial: '用',
    schedule: {} as Record<string, any>,
    shiftTypes: {} as Record<string, any>,
    currentYear: 0,
    currentMonth: 0,
    todayDay: 0,
    weekdayName: '',
    todaySchedule: null as any,
    todayCode: '休',
    todayTime: '',
    todayStyle: { bg: '#F5F5F5', text: '#9E9E9E', label: '休', hours: 0, time: '' },
    futureDays: [] as any[],
    calendarDays: [] as any[],
    workDays: 0,
    totalHours: 0,
  },

  onShow() {
    if (!requireAuth()) return
    const employee = getEmployee()
    const now = new Date()
    this.setData({
      employee,
      nameInitial: (employee && employee.name) ? employee.name.charAt(0) : '用',
      currentYear: now.getFullYear(),
      currentMonth: now.getMonth() + 1,
      todayDay: now.getDate(),
      weekdayName: WEEKDAYS[now.getDay()],
    })
    this.loadData()
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const { currentYear, currentMonth, todayDay, employee } = this.data
      const yearMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}`
      const daysInMonth = new Date(currentYear, currentMonth, 0).getDate()
      const startDate = `${yearMonth}-01`
      const endDate = `${yearMonth}-${String(daysInMonth).padStart(2, '0')}`

      // 并行请求排班 + 班次配置
      const [schedRows, shiftTypes] = await Promise.all([
        this.fetchSchedule(employee.id, startDate, endDate),
        this.fetchShiftTypes(),
      ])

      // 构建 schedule map
      const schedule: Record<string, any> = {}
      schedRows.forEach((row: any) => {
        const day = new Date(row.schedule_date).getDate()
        const code = row._codeInfo
        const itemName = code?.item_name || '休'
        const category = code?.extra_config?.category || 'rest'
        const isRest = category === 'rest' || category === 'leave'
        const rawTime = code?._time || ''
        // 休息时不显示 00:00-00:00
        const time = (isRest || rawTime === '00:00-00:00') ? '' : rawTime
        schedule[String(day)] = {
          code: itemName,
          category,
          hours: Number(row.planned_hours) || 0,
          time,
          project: row._projectName || '',
          shiftName: code?.extra_config?.related_shift_type_item_code ? row._shiftTypeName || '' : '',
        }
      })

      const todaySchedule = schedule[String(todayDay)] || null
      const todayCode = todaySchedule?.code || '休'
      const todayStyle = shiftTypes[todayCode] || { bg: '#F5F5F5', text: '#9E9E9E', label: '休', hours: 0, time: '' }

      // Future days
      const futureDays: any[] = []
      for (let i = 1; i <= 5 && futureDays.length < 5; i++) {
        const d = todayDay + i
        if (d <= daysInMonth) {
          const date = new Date(currentYear, currentMonth - 1, d)
          const daySchedule = schedule[String(d)]
          const shift = daySchedule?.code || '休'
          const style = shiftTypes[shift] || { bg: '#F5F5F5', text: '#9E9E9E' }
          const isRest = shift === '休' || shift === '休息'
          futureDays.push({
            day: d,
            weekday: WEEKDAYS[date.getDay()],
            shift,
            style,
            time: isRest ? '' : (daySchedule?.time || ''),
            project: daySchedule?.project || '',
            shiftName: daySchedule?.shiftName || '',
          })
        }
      }

      // Mini calendar
      const calendarDays: any[] = []
      const firstDow = new Date(currentYear, currentMonth - 1, 1).getDay()
      for (let i = 0; i < firstDow; i++) {
        calendarDays.push({ day: 0, isToday: false })
      }
      for (let d = 1; d <= daysInMonth; d++) {
        calendarDays.push({ day: d, isToday: d === todayDay })
      }

      // Stats
      const workDays = Object.values(schedule).filter((s: any) => s.category === 'work').length
      const totalHours = Object.values(schedule).reduce((sum: number, s: any) => sum + (s.hours || 0), 0)

      this.setData({
        schedule,
        shiftTypes,
        todaySchedule,
        todayCode,
        todayTime: todaySchedule?.time || '',
        todayStyle,
        futureDays,
        calendarDays,
        workDays,
        totalHours: Math.round(totalHours * 10) / 10,
        loading: false,
      })
    } catch (err) {
      console.error('Home load error:', err)
      this.setData({ loading: false })
    }
  },

  async fetchSchedule(employeeId: string, startDate: string, endDate: string): Promise<any[]> {
    // Step 0: 查员工所属项目
    const peRows: any[] = await query('project_employee',
      `employee_id=eq.${employeeId}&is_active=eq.true&select=project_id`
    )
    const myProjectIds = peRows.map(r => r.project_id)

    // Step 1: 查找当前已发布的激活版本（限定员工所属项目）
    let versionQuery = `is_active=eq.true&published_at=not.is.null&select=id`
    if (myProjectIds.length > 0) {
      versionQuery += `&project_id=in.(${myProjectIds.join(',')})`
    }
    const activeVersions: any[] = await query('schedule_version', versionQuery)
    
    // 没有已发布的激活版本时，不返回任何排班数据
    if (!activeVersions || activeVersions.length === 0) return []
    
    const versionIds = activeVersions.map(v => v.id)
    const versionFilter = `&schedule_version_id=in.(${versionIds.join(',')})`
    
    const rows: any[] = await query('schedule',
      `employee_id=eq.${employeeId}&schedule_date=gte.${startDate}&schedule_date=lte.${endDate}${versionFilter}&select=schedule_date,schedule_code_dict_item_id,shift_type_dict_item_id,planned_hours,project_id&order=schedule_date`
    )

    if (!rows || rows.length === 0) return []

    // Get code items
    const codeIds = [...new Set(rows.map(r => r.schedule_code_dict_item_id).filter(Boolean))]
    let codeMap: Record<string, any> = {}
    if (codeIds.length > 0) {
      const codes: any[] = await query('dict_item',
        `id=in.(${codeIds.join(',')})&select=id,item_code,item_name,extra_config`
      )
      codes.forEach(c => { codeMap[c.id] = c })
    }

    // Get shift type items for time info
    const dtList: any[] = await query('dict_type', 'select=id,type_code')
    const shiftTypeId = dtList.find(t => t.type_code === 'shift_type')?.id
    let shiftItemMap: Record<string, any> = {}
    if (shiftTypeId) {
      const items: any[] = await query('dict_item',
        `dict_type_id=eq.${shiftTypeId}&is_enabled=eq.true&select=id,item_code,item_name,extra_config`
      )
      items.forEach(s => { shiftItemMap[s.item_code] = s })
    }

    // Get project names
    const projectIds = [...new Set(rows.filter(r => r.project_id).map(r => r.project_id))]
    let projectMap: Record<string, string> = {}
    if (projectIds.length > 0) {
      const projects: any[] = await query('project',
        `id=in.(${projectIds.join(',')})&select=id,project_name`
      )
      projects.forEach(p => { projectMap[p.id] = p.project_name })
    }

    // Enrich rows
    return rows.map(r => {
      const code = codeMap[r.schedule_code_dict_item_id]
      const relCode = code?.extra_config?.related_shift_type_item_code
      const shiftItem = relCode ? shiftItemMap[relCode] : null
      const shiftExtra = shiftItem?.extra_config || {}
      const startTime = shiftExtra.start_time || ''
      const endTime = shiftExtra.end_time || ''
      return {
        ...r,
        _codeInfo: {
          ...code,
          _time: startTime && endTime ? `${startTime}-${endTime}` : '',
        },
        _projectName: r.project_id ? (projectMap[r.project_id] || '') : '',
        _shiftTypeName: shiftItem?.item_name || '',
      }
    })
  },

  async fetchShiftTypes(): Promise<Record<string, any>> {
    const dtList: any[] = await query('dict_type', 'select=id,type_code')
    const schedTypeId = dtList.find(t => t.type_code === 'schedule_code' || t.type_code === 'shift_code' || t.type_code === 'schedule_type')?.id
    const shiftTypeId = dtList.find(t => t.type_code === 'shift_type')?.id

    if (!schedTypeId) return {}

    const codeItems: any[] = await query('dict_item',
      `dict_type_id=eq.${schedTypeId}&is_enabled=eq.true&select=id,item_code,item_name,extra_config&order=sort_order`
    )

    let shiftItems: any[] = []
    if (shiftTypeId) {
      shiftItems = await query('dict_item',
        `dict_type_id=eq.${shiftTypeId}&is_enabled=eq.true&select=id,item_code,item_name,extra_config`
      )
    }
    const shiftMap: Record<string, any> = {}
    shiftItems.forEach(s => { shiftMap[s.item_code] = s })

    const PALETTE = [
      { bg: '#E8F5E9', text: '#2E7D32' }, { bg: '#E3F2FD', text: '#1565C0' },
      { bg: '#FFF3E0', text: '#E65100' }, { bg: '#F3E5F5', text: '#7B1FA2' },
      { bg: '#FFF8E1', text: '#F9A825' }, { bg: '#FCE4EC', text: '#C62828' },
    ]

    const result: Record<string, any> = {}
    codeItems.forEach((c, i) => {
      const extra = c.extra_config || {}
      const category = extra.category || 'work'
      const isRest = category === 'rest' || category === 'leave'
      const color = extra.color
        ? { bg: extra.color + '20', text: extra.color }
        : isRest ? { bg: '#F5F5F5', text: '#9E9E9E' } : PALETTE[i % PALETTE.length]

      const relCode = extra.related_shift_type_item_code
      const shift = relCode ? shiftMap[relCode] : null
      const shiftExtra = shift?.extra_config || {}

      // 用 item_name 作为 key（如 'A1', 'B2', '休'），员工能看懂
      result[c.item_name] = {
        bg: color.bg,
        text: color.text,
        label: shift ? `${shift.item_name} ${shiftExtra.start_time || ''}-${shiftExtra.end_time || ''}` : c.item_name,
        shiftTypeName: shift?.item_name || '',
        category,
        hours: Number(shiftExtra.planned_hours || extra.standard_hours || 0),
        time: (isRest || (shiftExtra.start_time === '00:00' && shiftExtra.end_time === '00:00'))
          ? '' 
          : (shiftExtra.start_time && shiftExtra.end_time ? `${shiftExtra.start_time}-${shiftExtra.end_time}` : ''),
      }
    })

    return result
  },

  goSchedule() { wx.switchTab({ url: '/pages/schedule/schedule' }) },
  goApply() { wx.switchTab({ url: '/pages/apply/apply' }) },
  goAnnouncement() { wx.switchTab({ url: '/pages/announcement/announcement' }) },
  goProfile() { wx.switchTab({ url: '/pages/profile/profile' }) },
})
