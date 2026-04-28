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
    const { year, month, calendarDays, legendItems, employee, totalPlannedHours, totalActualHours } = this.data
    if (!calendarDays || calendarDays.length === 0) {
      wx.showToast({ title: '暂无排班数据', icon: 'none' })
      return
    }

    wx.showLoading({ title: '正在生成图片...' })

    const selectorQuery = wx.createSelectorQuery()
    selectorQuery.select('#exportCanvas')
      .fields({ node: true, size: true })
      .exec((res: any) => {
        if (!res[0] || !res[0].node) {
          wx.hideLoading()
          wx.showToast({ title: '生成失败', icon: 'none' })
          return
        }

        const canvas = res[0].node
        const dpr = wx.getWindowInfo().pixelRatio || 2
        const W = 750
        // Pre-calculate height
        const calRows = Math.ceil(calendarDays.length / 7)
        const legendRows = Math.ceil(legendItems.length / 2)
        const H = 240 + 36 + calRows * 88 + 24 + 44 + legendRows * 52 + 60
        canvas.width = W * dpr
        canvas.height = H * dpr
        const ctx = canvas.getContext('2d') as any
        ctx.scale(dpr, dpr)

        // ======= Drawing helpers =======
        function roundRect(x: number, y: number, w: number, h: number, r: number) {
          ctx.beginPath()
          ctx.moveTo(x + r, y)
          ctx.lineTo(x + w - r, y)
          ctx.arcTo(x + w, y, x + w, y + r, r)
          ctx.lineTo(x + w, y + h - r)
          ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
          ctx.lineTo(x + r, y + h)
          ctx.arcTo(x, y + h, x, y + h - r, r)
          ctx.lineTo(x, y + r)
          ctx.arcTo(x, y, x + r, y, r)
          ctx.closePath()
        }

        // ======= Background =======
        const gradient = ctx.createLinearGradient(0, 0, W, H)
        gradient.addColorStop(0, '#F0F5FF')
        gradient.addColorStop(1, '#E8F0FE')
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, W, H)

        // ======= Header area =======
        // Brand bar
        roundRect(24, 24, W - 48, 96, 16)
        const headerGrad = ctx.createLinearGradient(24, 24, W - 24, 120)
        headerGrad.addColorStop(0, '#1E6FD9')
        headerGrad.addColorStop(1, '#3B82F6')
        ctx.fillStyle = headerGrad
        ctx.fill()

        // App name
        ctx.fillStyle = '#FFFFFF'
        ctx.font = 'bold 30px sans-serif'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText('WFM排班', 48, 72)

        // Month title
        ctx.textAlign = 'right'
        ctx.font = '26px sans-serif'
        ctx.fillText(`${year}年${month}月排班表`, W - 48, 72)

        // ======= Employee card =======
        let y = 140
        roundRect(24, y, W - 48, 80, 12)
        ctx.fillStyle = '#FFFFFF'
        ctx.fill()
        ctx.strokeStyle = '#E2E8F0'
        ctx.lineWidth = 1
        ctx.stroke()

        // Avatar circle
        ctx.beginPath()
        ctx.arc(72, y + 40, 24, 0, Math.PI * 2)
        ctx.fillStyle = '#1E6FD9'
        ctx.fill()
        ctx.fillStyle = '#FFF'
        ctx.font = 'bold 22px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText((employee.name || '员').charAt(0), 72, y + 42)

        // Name & department
        ctx.textAlign = 'left'
        ctx.fillStyle = '#1E293B'
        ctx.font = 'bold 24px sans-serif'
        ctx.fillText(`${employee.name || '员工'} · ${employee.no || ''}`, 108, y + 30)
        ctx.fillStyle = '#94A3B8'
        ctx.font = '20px sans-serif'
        ctx.fillText(employee.department || '', 108, y + 58)

        // Hours stats
        ctx.textAlign = 'right'
        ctx.fillStyle = '#3B82F6'
        ctx.font = 'bold 22px sans-serif'
        ctx.fillText(`应${totalPlannedHours}h / 已${totalActualHours}h`, W - 48, y + 42)

        // ======= Calendar =======
        y = 240
        const padding = 24
        const calW = W - padding * 2
        const cellW = Math.floor(calW / 7)
        const cellH = 88

        // Weekday headers
        const weekLabels = ['日', '一', '二', '三', '四', '五', '六']
        ctx.textAlign = 'center'
        ctx.font = 'bold 22px sans-serif'
        weekLabels.forEach((label, i) => {
          const cx = padding + cellW * i + cellW / 2
          ctx.fillStyle = (i === 0 || i === 6) ? '#F59E0B' : '#64748B'
          ctx.fillText(label, cx, y + 16)
        })

        y += 36

        // Calendar grid
        const today = new Date()
        const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month
        const todayDate = today.getDate()

        calendarDays.forEach((cell: any, idx: number) => {
          const col = idx % 7
          const row = Math.floor(idx / 7)
          const cx = padding + cellW * col + cellW / 2
          const cy = y + cellH * row + cellH / 2

          if (!cell.day) return

          // Cell background
          const isToday = isCurrentMonth && cell.day === todayDate
          if (isToday) {
            roundRect(cx - cellW / 2 + 4, cy - cellH / 2 + 4, cellW - 8, cellH - 8, 10)
            ctx.fillStyle = '#EFF6FF'
            ctx.fill()
            ctx.strokeStyle = '#3B82F6'
            ctx.lineWidth = 2
            ctx.stroke()
          } else {
            roundRect(cx - cellW / 2 + 4, cy - cellH / 2 + 4, cellW - 8, cellH - 8, 8)
            ctx.fillStyle = '#FFFFFF'
            ctx.fill()
            ctx.strokeStyle = '#F1F5F9'
            ctx.lineWidth = 1
            ctx.stroke()
          }

          // Day number
          ctx.textAlign = 'center'
          ctx.fillStyle = isToday ? '#1E6FD9' : '#334155'
          ctx.font = isToday ? 'bold 22px sans-serif' : '20px sans-serif'
          ctx.fillText(String(cell.day), cx, cy - 10)

          // Shift code
          if (cell.code) {
            const codeColor = cell.style?.text || '#9E9E9E'
            ctx.fillStyle = codeColor
            ctx.font = 'bold 18px sans-serif'
            ctx.fillText(cell.code, cx, cy + 12)
            // Start time
            if (cell.startTime) {
              ctx.font = '14px sans-serif'
              ctx.fillStyle = codeColor
              ctx.globalAlpha = 0.7
              ctx.fillText(cell.startTime, cx, cy + 28)
              ctx.globalAlpha = 1.0
            }
          }
        })

        // ======= Legend =======
        const rows = Math.ceil(calendarDays.length / 7)
        y = y + cellH * rows + 24

        // Legend header
        roundRect(24, y, 6, 26, 3)
        ctx.fillStyle = '#1E6FD9'
        ctx.fill()
        ctx.textAlign = 'left'
        ctx.fillStyle = '#1E293B'
        ctx.font = 'bold 24px sans-serif'
        ctx.fillText('班次图例', 40, y + 18)
        y += 44

        // Legend items in 2 columns
        const colWidth = (calW - 16) / 2
        legendItems.forEach((item: any, i: number) => {
          const col = i % 2
          const row = Math.floor(i / 2)
          const lx = padding + col * (colWidth + 16)
          const ly = y + row * 52

          // Code badge
          roundRect(lx, ly, 42, 36, 8)
          ctx.fillStyle = item.bg || '#F5F5F5'
          ctx.fill()
          ctx.strokeStyle = (item.text || '#9E9E9E') + '30'
          ctx.lineWidth = 1
          ctx.stroke()
          ctx.textAlign = 'center'
          ctx.fillStyle = item.text || '#9E9E9E'
          ctx.font = 'bold 18px sans-serif'
          ctx.fillText(item.code, lx + 21, ly + 22)

          // Label
          ctx.textAlign = 'left'
          ctx.fillStyle = '#334155'
          ctx.font = '20px sans-serif'
          ctx.fillText(item.label || item.code, lx + 52, ly + 16)

          // Time/hours
          const detail = item.time || (item.category === 'rest' ? '休息' : item.category === 'leave' ? '请假' : '')
          if (detail) {
            ctx.fillStyle = '#94A3B8'
            ctx.font = '16px sans-serif'
            ctx.fillText(detail, lx + 52, ly + 34)
          }

          // Hours
          if (item.hours > 0) {
            ctx.textAlign = 'right'
            ctx.fillStyle = '#3B82F6'
            ctx.font = 'bold 18px sans-serif'
            ctx.fillText(`${item.hours}h`, lx + colWidth - 8, ly + 22)
          }
        })

        // ======= Footer watermark =======
        const footerY = y + Math.ceil(legendItems.length / 2) * 52 + 24
        ctx.textAlign = 'center'
        ctx.fillStyle = '#CBD5E1'
        ctx.font = '18px sans-serif'
        ctx.fillText(`WFM智能排班系统 · ${year}年${month}月`, W / 2, footerY)

        // ======= Save to album =======
        setTimeout(() => {
          wx.canvasToTempFilePath({
            canvas,
            width: W * dpr,
            height: H * dpr,
            destWidth: W * 2,
            destHeight: H * 2,
            success(tempRes: any) {
              wx.hideLoading()
              // Preview first, then allow save
              wx.previewImage({
                urls: [tempRes.tempFilePath],
                current: tempRes.tempFilePath,
              })
              // Also try to save
              wx.saveImageToPhotosAlbum({
                filePath: tempRes.tempFilePath,
                success() {
                  wx.showToast({ title: '已保存到相册', icon: 'success' })
                },
                fail(err: any) {
                  if (err.errMsg?.includes('auth deny') || err.errMsg?.includes('authorize')) {
                    wx.showModal({
                      title: '需要授权',
                      content: '请在设置中允许保存图片到相册',
                      confirmText: '去设置',
                      success(mRes: any) {
                        if (mRes.confirm) wx.openSetting({})
                      }
                    })
                  }
                }
              })
            },
            fail() {
              wx.hideLoading()
              wx.showToast({ title: '生成失败', icon: 'none' })
            }
          })
        }, 300)
      })
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

      // 查员工所属项目
      const peRows: any[] = await query('project_employee',
        `employee_id=eq.${emp.id}&is_active=eq.true&select=project_id`
      )
      const myProjectIds = peRows.map(r => r.project_id)

      // 查找当前已发布的激活版本（限定员工所属项目）
      let versionQuery = `is_active=eq.true&published_at=not.is.null&select=id`
      if (myProjectIds.length > 0) {
        versionQuery += `&project_id=in.(${myProjectIds.join(',')})`
      }
      const activeVersions: any[] = await query('schedule_version', versionQuery)
      
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
          // 优先从关联班次取时间，其次从编码自身取时间
          const st = sExtra.start_time || extra.start_time || ''
          const et = sExtra.end_time || extra.end_time || ''
          const rawTime = st && et ? `${st}-${et}` : ''
          const displayTime = (isRest || rawTime === '00:00-00:00') ? '' : rawTime

          // 用 item_name 作 key（如 A1, B2, 休）
          shiftTypes[c.item_name] = {
            bg: color.bg, text: color.text,
            label: shift ? `${shift.item_name} ${displayTime}` : (displayTime ? `${c.item_name} ${displayTime}` : c.item_name),
            category,
            hours: Number(sExtra.planned_hours || extra.planned_hours || extra.standard_hours || 0),
            time: displayTime,
          }
          legendItems.push({
            code: c.item_name,
            label: displayTime || (isRest ? '休息' : c.item_name),
            bg: color.bg, text: color.text,
            time: displayTime,
            hours: Number(sExtra.planned_hours || extra.planned_hours || extra.standard_hours || 0),
            category,
          })
        })
      }

      // Build schedule map + calc total hours
      const schedule: Record<string, any> = {}
      let totalPlannedHours = 0
      let totalActualHours = 0
      const todayStr = new Date().toISOString().split('T')[0]
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
        const _st = sExtra.start_time || extra.start_time || ''
        const _et = sExtra.end_time || extra.end_time || ''
        const rawTime = _st && _et ? `${_st}-${_et}` : ''
        const hours = Number(row.planned_hours) || 0

        if (!isRest) {
          totalPlannedHours += hours
          // 已过去的日期（含今天）算已完成工时
          if (row.schedule_date <= todayStr) {
            totalActualHours += hours
          }
        }

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
        // 提取开始时间（取 time 的前半部分，如 "09:00-18:00" → "09:00"）
        const timeStr = s?.time || ''
        const startTime = timeStr ? timeStr.split('-')[0] : ''
        calendarDays.push({
          day: d,
          code,
          style,
          startTime,
          isToday: isCurrentMonth && d === today.getDate(),
        })
      }

      this.setData({
        schedule, shiftTypes, calendarDays, legendItems,
        totalPlannedHours: Math.round(totalPlannedHours),
        totalActualHours: Math.round(totalActualHours),
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
