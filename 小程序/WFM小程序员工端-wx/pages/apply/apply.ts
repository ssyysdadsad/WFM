// pages/apply/apply.ts
import { requireAuth, getEmployee } from '../../utils/auth'
import { query, insert } from '../../utils/supabase'

Page({
  data: {
    activeTab: 'list',
    loading: false,
    submitting: false,
    requests: [] as any[],
    // Form fields
    requestType: 'swap' as 'direct_change' | 'swap',
    employee: { name: '', department: '' } as any,
    formOrigDate: '',
    myShiftCode: '',
    myScheduleId: '',
    formTargetDate: '',
    formTargetShiftLabel: '',
    formTargetShiftId: '',
    targetShiftIsRest: false,
    myShiftIsRest: false,
    targetScheduleId: '',
    formTargetEmpId: '',
    formTargetEmpName: '',
    formReason: '',
    formError: '',
    formSuccess: '',
    // Picker options
    shiftOptions: [] as any[],
    shiftPickerIndex: 0,
    targetEmployeeOptions: [] as any[],
    targetEmpPickerIndex: 0,
    // Internal
    _pendingStatusId: '',
    _activeVersionIds: [] as string[],

    // === Urgent shift data ===
    urgentLoading: false,
    urgentShifts: [] as any[],
    mySignups: [] as any[],
    showSignupModal: false,
    signupShiftId: '',
    signupShiftTitle: '',
    signupRemark: '',
    signupError: '',
    signupSubmitting: false,
  },

  onShow() {
    if (!requireAuth()) return
    const emp = getEmployee()
    if (emp) {
      this.setData({
        employee: { name: emp.name, no: emp.no, department: emp.department, id: emp.id },
      })
    }
    this.loadRequests()
    this.loadShiftOptions()
    this.loadActiveVersionIds()
    this.loadUrgentShifts()
  },

  switchTab(e: any) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab, formError: '', formSuccess: '' })
    if (tab === 'urgent') {
      this.loadUrgentShifts()
    }
  },

  switchRequestType(e: any) {
    this.setData({
      requestType: e.currentTarget.dataset.type,
      formError: '',
      formSuccess: '',
      formTargetEmpId: '',
      formTargetEmpName: '',
    })
  },

  // ===== Form handlers =====
  async onOrigDateChange(e: any) {
    const date = e.detail.value
    this.setData({ formOrigDate: date, myShiftCode: '', myScheduleId: '', myShiftIsRest: false, formError: '' })
    // Auto-detect my shift on this date
    await this.detectMyShift(date)
    // For swap mode, load available employees for this date
    if (this.data.requestType === 'swap') {
      await this.loadTargetEmployees(date)
    }
  },

  async onTargetDateChange(e: any) {
    const date = e.detail.value
    this.setData({ formTargetDate: date, formTargetShiftLabel: '', formTargetShiftId: '', targetShiftIsRest: false })
    // Auto-detect target employee's shift on this date (swap mode)
    if (this.data.requestType === 'swap' && this.data.formTargetEmpId) {
      await this.detectTargetShift(this.data.formTargetEmpId, date)
    }
  },
  onReasonInput(e: any) { this.setData({ formReason: e.detail.value }) },

  onShiftPickerChange(e: any) {
    const idx = Number(e.detail.value)
    const opt = this.data.shiftOptions[idx]
    if (opt) {
      this.setData({
        shiftPickerIndex: idx,
        formTargetShiftLabel: opt.label,
        formTargetShiftId: opt.id,
      })
    }
  },

  async onTargetEmpChange(e: any) {
    const idx = Number(e.detail.value)
    const opt = this.data.targetEmployeeOptions[idx]
    if (opt) {
      this.setData({
        targetEmpPickerIndex: idx,
        formTargetEmpId: opt.id,
        formTargetEmpName: opt.label,
        formTargetShiftLabel: '',
        formTargetShiftId: '',
        targetShiftIsRest: false,
      })
      // If target date is already set, auto-detect shift
      if (this.data.formTargetDate) {
        await this.detectTargetShift(opt.id, this.data.formTargetDate)
      }
    }
  },

  /** 自动检测对方在指定日期的班次 */
  async detectTargetShift(empId: string, date: string) {
    try {
      const versionIds = this.data._activeVersionIds
      let vf = ''
      if (versionIds.length > 0) vf = `&schedule_version_id=in.(${versionIds.join(',')})`

      const rows: any[] = await query('schedule',
        `employee_id=eq.${empId}&schedule_date=eq.${date}${vf}&select=id,schedule_code_dict_item_id&limit=1`
      )
      if (rows.length > 0) {
        const scheduleId = rows[0].id
        const codeId = rows[0].schedule_code_dict_item_id
        const codes: any[] = await query('dict_item', `id=eq.${codeId}&select=id,item_name,extra_config&limit=1`)
        const codeItem = codes?.[0]
        const codeName = codeItem?.item_name || '?'
        const category = codeItem?.extra_config?.category || 'work'
        const isRest = category === 'rest' || category === 'leave'

        this.setData({
          formTargetShiftLabel: codeName,
          formTargetShiftId: codeId,
          targetShiftIsRest: isRest,
          targetScheduleId: scheduleId,
        })

        if (isRest) {
          this.setData({ formError: `对方在 ${date} 的班次为「${codeName}」（休息），无法互换` })
        } else {
          this.setData({ formError: '' })
        }
      } else {
        this.setData({
          formTargetShiftLabel: '无排班',
          formTargetShiftId: '',
          targetShiftIsRest: true,
          targetScheduleId: '',
          formError: `对方在 ${date} 无排班记录，无法互换`,
        })
      }
    } catch (e) {
      console.error('Detect target shift error:', e)
    }
  },

  // ===== Data loaders =====
  async loadActiveVersionIds() {
    try {
      const versions: any[] = await query('schedule_version', 'is_active=eq.true&select=id')
      this.setData({ _activeVersionIds: versions.map(v => v.id) })
    } catch (e) { /* ignore */ }
  },

  async loadShiftOptions() {
    try {
      const dtList: any[] = await query('dict_type', 'select=id,type_code')
      const schedTypeId = dtList.find(t => t.type_code === 'schedule_code' || t.type_code === 'shift_code')?.id
      if (!schedTypeId) return

      const codes: any[] = await query('dict_item',
        `dict_type_id=eq.${schedTypeId}&is_enabled=eq.true&select=id,item_code,item_name&order=sort_order`
      )
      const shiftOptions = codes.map(c => ({
        id: c.id,
        code: c.item_code,
        label: c.item_name || c.item_code,
      }))
      this.setData({ shiftOptions })

      // Also get pending status ID
      const approvalTypeId = dtList.find(t => t.type_code === 'approval_status')?.id
      if (approvalTypeId) {
        const items: any[] = await query('dict_item',
          `dict_type_id=eq.${approvalTypeId}&item_code=eq.pending&select=id&limit=1`
        )
        if (items?.[0]) this.setData({ _pendingStatusId: items[0].id })
      }
    } catch (e) { console.error('Load shift options error:', e) }
  },

  async detectMyShift(date: string) {
    try {
      const emp = getEmployee()
      if (!emp) return
      const versionIds = this.data._activeVersionIds
      let vf = ''
      if (versionIds.length > 0) vf = `&schedule_version_id=in.(${versionIds.join(',')})`

      const rows: any[] = await query('schedule',
        `employee_id=eq.${emp.id}&schedule_date=eq.${date}${vf}&select=id,schedule_code_dict_item_id&limit=1`
      )
      if (rows.length > 0) {
        const codeId = rows[0].schedule_code_dict_item_id
        const codes: any[] = await query('dict_item', `id=eq.${codeId}&select=item_name,extra_config&limit=1`)
        const codeItem = codes?.[0]
        const codeName = codeItem?.item_name || '?'
        const category = codeItem?.extra_config?.category || 'work'
        const isRest = category === 'rest' || category === 'leave'

        this.setData({
          myShiftCode: codeName,
          myScheduleId: rows[0].id,
          myShiftIsRest: isRest,
        })

        // 已经是休息的员工不需要申请调班
        if (isRest) {
          this.setData({ formError: `您在 ${date} 的班次为「${codeName}」（休息），无需申请调班` })
        } else {
          this.setData({ formError: '' })
        }
      } else {
        this.setData({ myShiftCode: '无排班', myScheduleId: '', myShiftIsRest: false })
      }
    } catch (e) { console.error('Detect shift error:', e) }
  },

  async loadTargetEmployees(date: string) {
    try {
      const emp = getEmployee()
      if (!emp) return
      const versionIds = this.data._activeVersionIds
      let vf = ''
      if (versionIds.length > 0) vf = `&schedule_version_id=in.(${versionIds.join(',')})`

      // Find employees who are on rest/leave on this date (same department)
      const allScheds: any[] = await query('schedule',
        `schedule_date=eq.${date}${vf}&select=employee_id,schedule_code_dict_item_id`
      )

      // Get rest code dict_item ids
      const dtList: any[] = await query('dict_type', 'select=id,type_code')
      const schedTypeId = dtList.find(t => t.type_code === 'schedule_code' || t.type_code === 'shift_code')?.id
      if (!schedTypeId) return

      const allCodes: any[] = await query('dict_item',
        `dict_type_id=eq.${schedTypeId}&is_enabled=eq.true&select=id,item_name,extra_config`
      )
      const restCodeIds = new Set(allCodes.filter(c => {
        const cat = c.extra_config?.category
        return cat === 'rest' || cat === 'leave'
      }).map(c => c.id))

      // Filter employees who have rest on this date
      const restEmpIds = allScheds
        .filter(s => restCodeIds.has(s.schedule_code_dict_item_id) && s.employee_id !== emp.id)
        .map(s => s.employee_id)

      if (restEmpIds.length === 0) {
        this.setData({ targetEmployeeOptions: [] })
        return
      }

      const uniqueIds = [...new Set(restEmpIds)]
      const employees: any[] = await query('employee',
        `id=in.(${uniqueIds.join(',')})`+`&select=id,full_name,employee_no`
      )

      const targetEmployeeOptions = employees.map(e => ({
        id: e.id,
        label: `${e.full_name} (${e.employee_no})`,
      }))
      this.setData({ targetEmployeeOptions })
    } catch (e) {
      console.error('Load target employees error:', e)
      this.setData({ targetEmployeeOptions: [] })
    }
  },

  // ===== Load request list =====
  async loadRequests() {
    this.setData({ loading: true })
    try {
      const emp = getEmployee()
      if (!emp) return

      const rows: any[] = await query('shift_change_request',
        `applicant_employee_id=eq.${emp.id}&select=*&order=created_at.desc`
      )

      const statusIds = [...new Set(rows.map(r => r.approval_status_dict_item_id).filter(Boolean))]
      let statusMap: Record<string, string> = {}
      if (statusIds.length > 0) {
        const items: any[] = await query('dict_item', `id=in.(${statusIds.join(',')})`+`&select=id,item_code,item_name`)
        items.forEach(i => { statusMap[i.id] = i.item_code })
      }

      const schedIds = [...new Set([
        ...rows.map(r => r.original_schedule_id),
        ...rows.map(r => r.target_schedule_id),
      ].filter(Boolean))]

      let schedMap: Record<string, any> = {}
      if (schedIds.length > 0) {
        const scheds: any[] = await query('schedule', `id=in.(${schedIds.join(',')})`+`&select=id,schedule_date,schedule_code_dict_item_id`)
        const codeIds2 = [...new Set(scheds.map(s => s.schedule_code_dict_item_id).filter(Boolean))]
        let codeNameMap: Record<string, string> = {}
        if (codeIds2.length > 0) {
          const codes: any[] = await query('dict_item', `id=in.(${codeIds2.join(',')})`+`&select=id,item_code,item_name`)
          codes.forEach(c => { codeNameMap[c.id] = c.item_name || c.item_code })
        }
        scheds.forEach(s => {
          schedMap[s.id] = { date: s.schedule_date, code: codeNameMap[s.schedule_code_dict_item_id] || '?' }
        })
      }

      // Get target employee names
      const targetEmpIds = [...new Set(rows.map(r => r.target_employee_id).filter(Boolean))]
      let empNameMap: Record<string, string> = {}
      if (targetEmpIds.length > 0) {
        const emps: any[] = await query('employee', `id=in.(${targetEmpIds.join(',')})`+`&select=id,full_name`)
        emps.forEach(e => { empNameMap[e.id] = e.full_name })
      }

      const statusStyles: Record<string, { label: string; bg: string; color: string }> = {
        pending: { label: '待审批', bg: '#FFF8E1', color: '#F9A825' },
        approved: { label: '已通过', bg: '#E4FAF5', color: '#12B8A0' },
        rejected: { label: '已拒绝', bg: '#FFF0EE', color: '#D96B5A' },
      }

      const requests = rows.map(r => {
        const statusCode = statusMap[r.approval_status_dict_item_id] || 'pending'
        const style = statusStyles[statusCode] || statusStyles.pending
        const orig = schedMap[r.original_schedule_id]
        const target = schedMap[r.target_schedule_id]

        return {
          id: r.id,
          typeLabel: r.request_type === 'swap' ? '互换' : '变更',
          statusLabel: style.label,
          statusBg: style.bg,
          statusColor: style.color,
          originalDate: orig?.date || '',
          originalShift: orig?.code || '',
          targetDate: target?.date || r.target_date || '',
          targetShift: target?.code || '',
          targetEmployeeName: empNameMap[r.target_employee_id] || '',
          reason: r.reason || '',
          createdAt: r.created_at ? r.created_at.split('T')[0] : '',
        }
      })

      this.setData({ requests, loading: false })
    } catch (err) {
      console.error('Load requests error:', err)
      this.setData({ loading: false })
    }
  },

  // ===== Submit =====
  async handleSubmit() {
    const { requestType, formOrigDate, formReason, myScheduleId, _pendingStatusId } = this.data
    if (!formOrigDate) { this.setData({ formError: '请选择原排班日期' }); return }
    if (!myScheduleId) { this.setData({ formError: '该日期未找到排班记录' }); return }
    // 已经是休息状态则不允许申请调班
    if (this.data.myShiftIsRest) {
      this.setData({ formError: `您在 ${formOrigDate} 已经是休息状态，无需申请调班` }); return
    }
    if (!formReason) { this.setData({ formError: '请输入调班事由' }); return }
    if (!_pendingStatusId) { this.setData({ formError: '系统配置异常' }); return }

    if (requestType === 'swap' && !this.data.formTargetEmpId) {
      this.setData({ formError: '请选择调班对象' }); return
    }
    if (requestType === 'swap' && !this.data.formTargetDate) {
      this.setData({ formError: '请选择换回排班日期' }); return
    }
    if (requestType === 'swap' && this.data.targetShiftIsRest) {
      this.setData({ formError: '对方在该日期为休息状态，无法互换' }); return
    }
    if (requestType === 'swap' && !this.data.formTargetShiftId) {
      this.setData({ formError: '未获取到对方班次信息，请选择换回日期' }); return
    }

    this.setData({ submitting: true, formError: '', formSuccess: '' })
    try {
      const emp = getEmployee()
      if (!emp) return

      const payload: any = {
        request_type: requestType,
        applicant_employee_id: emp.id,
        original_schedule_id: myScheduleId,
        reason: formReason,
        approval_status_dict_item_id: _pendingStatusId,
      }

      if (requestType === 'swap') {
        payload.target_employee_id = this.data.formTargetEmpId
        payload.target_schedule_id = this.data.targetScheduleId
        if (this.data.formTargetDate) payload.target_date = this.data.formTargetDate
        if (this.data.formTargetShiftId) payload.target_schedule_code_dict_item_id = this.data.formTargetShiftId
      } else if (requestType === 'direct_change') {
        payload.target_date = this.data.formTargetDate || this.data.formOrigDate
        if (this.data.formTargetShiftId) {
          payload.target_schedule_code_dict_item_id = this.data.formTargetShiftId
        }
        // Get shift_type_dict_item_id from the selected shift code
        if (this.data.formTargetShiftId) {
          try {
            const codeItem: any[] = await query('dict_item', `id=eq.${this.data.formTargetShiftId}&select=extra_config&limit=1`)
            const relatedCode = codeItem?.[0]?.extra_config?.related_shift_type_item_code
            if (relatedCode) {
              const dtList: any[] = await query('dict_type', 'type_code=eq.shift_type&select=id&limit=1')
              if (dtList?.[0]) {
                const shiftTypes: any[] = await query('dict_item', `dict_type_id=eq.${dtList[0].id}&item_code=eq.${relatedCode}&select=id&limit=1`)
                if (shiftTypes?.[0]) payload.target_shift_type_dict_item_id = shiftTypes[0].id
              }
            }
          } catch (e) { /* ignore */ }
        }
      }

      await insert('shift_change_request', payload)

      this.setData({
        formSuccess: '调班申请已提交！',
        formOrigDate: '', myShiftCode: '', myScheduleId: '',
        formTargetDate: '', formTargetShiftLabel: '', formTargetShiftId: '',
        formTargetEmpId: '', formTargetEmpName: '', targetScheduleId: '',
        formReason: '', submitting: false,
      })
      this.loadRequests()
    } catch (err: any) {
      this.setData({ formError: err.message || '提交失败', submitting: false })
    }
  },

  // ===== Urgent Shift Methods =====

  /** 加载可报名的紧急班次 + 我的报名记录 */
  async loadUrgentShifts() {
    this.setData({ urgentLoading: true })
    try {
      const emp = getEmployee()
      if (!emp) { this.setData({ urgentLoading: false }); return }

      // 1. 获取 status=open 且 signup_deadline > now 的紧急班次
      const shifts: any[] = await query('urgent_shift',
        `status=eq.open&select=*&order=shift_date`
      )

      // 2. 获取项目名称
      const projectIds = [...new Set(shifts.filter(s => s.project_id).map(s => s.project_id))]
      let projectMap: Record<string, string> = {}
      if (projectIds.length > 0) {
        const projects: any[] = await query('project', `id=in.(${projectIds.join(',')})`+`&select=id,project_name`)
        projects.forEach(p => { projectMap[p.id] = p.project_name })
      }

      // 3. 获取技能名称
      const skillIds = [...new Set(shifts.filter(s => s.skill_id).map(s => s.skill_id))]
      let skillMap: Record<string, string> = {}
      if (skillIds.length > 0) {
        const skills: any[] = await query('skill', `id=in.(${skillIds.join(',')})`+`&select=id,skill_name`)
        skills.forEach(s => { skillMap[s.id] = s.skill_name })
      }

      // 4. 获取该员工的所有报名记录
      const allShiftIds = shifts.map(s => s.id)
      let mySignupMap: Record<string, any> = {}
      let signupCountMap: Record<string, number> = {}
      if (allShiftIds.length > 0) {
        // 我的报名
        const mySignups: any[] = await query('urgent_shift_signup',
          `employee_id=eq.${emp.id}&urgent_shift_id=in.(${allShiftIds.join(',')})`+`&select=id,urgent_shift_id,status`
        )
        mySignups.forEach(s => { mySignupMap[s.urgent_shift_id] = s })

        // 各班次报名总数
        const allSignups: any[] = await query('urgent_shift_signup',
          `urgent_shift_id=in.(${allShiftIds.join(',')})`+`&select=urgent_shift_id,status`
        )
        allSignups.forEach(s => {
          if (!signupCountMap[s.urgent_shift_id]) signupCountMap[s.urgent_shift_id] = 0
          signupCountMap[s.urgent_shift_id]++
        })
      }

      // 5. 检测时间冲突 + 用工规则校验
      const shiftDates = [...new Set(shifts.map(s => s.shift_date))]
      let scheduleMap: Record<string, { category: string; startTime: string; endTime: string; hours: number }> = {}
      let monthlyHours = 0
      let weeklyHours = 0
      let dailyHoursMap: Record<string, number> = {}
      let consecutiveDays = 0

      // 获取用工规则
      let laborRules: any[] = []
      try {
        laborRules = await query('labor_rule', 'is_enabled=eq.true&select=*&order=priority')
      } catch { /* ignore */ }

      if (shiftDates.length > 0) {
        // 获取当月所有排班用于工时统计
        const firstDate = shiftDates.sort()[0]
        const monthStart = firstDate.substring(0, 8) + '01'
        const mDate = new Date(firstDate)
        const monthEnd = new Date(mDate.getFullYear(), mDate.getMonth() + 1, 0)
        const monthEndStr = `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, '0')}-${String(monthEnd.getDate()).padStart(2, '0')}`

        // 本周范围
        const dayOfWeek = mDate.getDay() || 7
        const weekStartObj = new Date(mDate)
        weekStartObj.setDate(weekStartObj.getDate() - dayOfWeek + 1)
        const weekEndObj = new Date(weekStartObj)
        weekEndObj.setDate(weekEndObj.getDate() + 6)
        const weekStart = weekStartObj.toISOString().split('T')[0]
        const weekEnd = weekEndObj.toISOString().split('T')[0]

        try {
          // 仅查询激活版本的排班，避免多版本数据重复累加
          const versionIds = this.data._activeVersionIds
          let vf = ''
          if (versionIds.length > 0) vf = `&schedule_version_id=in.(${versionIds.join(',')})`

          const monthSchedules: any[] = await query('schedule',
            `employee_id=eq.${emp.id}&schedule_date=gte.${monthStart}&schedule_date=lte.${monthEndStr}${vf}&select=schedule_date,planned_hours,schedule_code_dict_item_id`
          )

          // 获取排班编码分类信息
          const allCodeIds = [...new Set(monthSchedules.map(s => s.schedule_code_dict_item_id).filter(Boolean))]
          let codeClassMap: Record<string, string> = {}
          if (allCodeIds.length > 0) {
            const codeItems: any[] = await query('dict_item', `id=in.(${allCodeIds.join(',')})&select=id,extra_config`)
            codeItems.forEach(c => { codeClassMap[c.id] = c.extra_config?.category || 'work' })
          }

          // 统计月/周工时、当天工时、连续工作天数
          const workDatesSet = new Set<string>()
          monthSchedules.forEach(s => {
            const cat = codeClassMap[s.schedule_code_dict_item_id] || 'work'
            if (cat === 'rest' || cat === 'leave') return
            const hours = Number(s.planned_hours) || 0
            monthlyHours += hours
            if (s.schedule_date >= weekStart && s.schedule_date <= weekEnd) weeklyHours += hours
            dailyHoursMap[s.schedule_date] = (dailyHoursMap[s.schedule_date] || 0) + hours
            workDatesSet.add(s.schedule_date)
          })

          // 连续工作天数（从紧急班次日期往前算）
          for (const date of shiftDates) {
            let count = 1 // 加上紧急班次当天
            const d = new Date(date)
            for (let i = 1; i <= 14; i++) {
              d.setDate(d.getDate() - 1)
              if (workDatesSet.has(d.toISOString().split('T')[0])) count++
              else break
            }
            if (count > consecutiveDays) consecutiveDays = count
          }

        } catch { /* ignore */ }

        // 检测每天的排班冲突
        if (this.data._activeVersionIds.length > 0) {
          const vf = `&schedule_version_id=in.(${this.data._activeVersionIds.join(',')})`
          for (const date of shiftDates) {
            try {
              const scheds: any[] = await query('schedule',
                `employee_id=eq.${emp.id}&schedule_date=eq.${date}${vf}&select=schedule_code_dict_item_id&limit=1`
              )
              if (scheds.length > 0) {
                const codeId = scheds[0].schedule_code_dict_item_id
                const codes: any[] = await query('dict_item', `id=eq.${codeId}&select=extra_config&limit=1`)
                const ec = codes?.[0]?.extra_config || {}
                scheduleMap[date] = {
                  category: ec.category || 'work',
                  startTime: ec.start_time || '',
                  endTime: ec.end_time || '',
                  hours: Number(ec.standard_hours) || 0,
                }
              }
            } catch { /* ignore */ }
          }
        }
      }

      // 6. 构建紧急班次列表
      const now = new Date()
      const urgentShifts = shifts
        .filter(s => new Date(s.signup_deadline) > now) // 仅显示未过截止时间的
        .map(s => {
          const mySchedule = scheduleMap[s.shift_date]
          let hasConflict = false
          if (mySchedule && mySchedule.category !== 'rest' && mySchedule.category !== 'leave') {
            // 有工作排班 => 时间冲突
            hasConflict = true
          }

          // 用工规则校验
          const urgentHours = s.start_time && s.end_time
            ? Math.max(0, (parseInt(s.end_time.split(':')[0]) * 60 + parseInt(s.end_time.split(':')[1] || '0') - parseInt(s.start_time.split(':')[0]) * 60 - parseInt(s.start_time.split(':')[1] || '0')) / 60)
            : 0
          const laborWarnings: string[] = []

          for (const rule of laborRules) {
            const prefix = rule.is_hard_constraint ? '⛔' : '⚠️'

            if (rule.daily_hours_limit) {
              const dayH = (dailyHoursMap[s.shift_date] || 0) + urgentHours
              if (dayH > Number(rule.daily_hours_limit)) {
                laborWarnings.push(`${prefix} 当天总工时${dayH.toFixed(1)}h超出日上限${rule.daily_hours_limit}h`)
              }
            }
            if (rule.weekly_hours_limit) {
              const weekH = weeklyHours + urgentHours
              if (weekH > Number(rule.weekly_hours_limit)) {
                laborWarnings.push(`${prefix} 本周总工时${weekH.toFixed(1)}h超出周上限${rule.weekly_hours_limit}h`)
              }
            }
            if (rule.monthly_hours_limit) {
              const monthH = monthlyHours + urgentHours
              if (monthH > Number(rule.monthly_hours_limit)) {
                laborWarnings.push(`${prefix} 本月总工时${monthH.toFixed(1)}h超出月上限${rule.monthly_hours_limit}h`)
              }
            }
            if (rule.max_consecutive_work_days && consecutiveDays > rule.max_consecutive_work_days) {
              laborWarnings.push(`${prefix} 连续工作${consecutiveDays}天超出上限${rule.max_consecutive_work_days}天`)
            }
            if (rule.min_shift_interval_hours && (dailyHoursMap[s.shift_date] || 0) > 0) {
              laborWarnings.push(`${prefix} 当天已有排班，注意班次间隔≥${rule.min_shift_interval_hours}h`)
            }
          }

          return {
            id: s.id,
            title: s.title,
            shiftDate: s.shift_date,
            startTime: s.start_time ? s.start_time.substring(0, 5) : '',
            endTime: s.end_time ? s.end_time.substring(0, 5) : '',
            requiredCount: s.required_count || 1,
            signupCount: signupCountMap[s.id] || 0,
            projectName: s.project_id ? projectMap[s.project_id] || '' : '',
            skillName: s.skill_id ? skillMap[s.skill_id] || '' : '',
            description: s.description || '',
            deadline: s.signup_deadline ? s.signup_deadline.replace('T', ' ').substring(0, 16) : '',
            alreadySignedUp: !!mySignupMap[s.id],
            hasConflict,
            laborWarnings,
          }
        })

      // 7. 加载我的全部报名记录（含已过截止的）
      const allMySignups: any[] = await query('urgent_shift_signup',
        `employee_id=eq.${emp.id}&select=*&order=created_at.desc`
      )
      const signupShiftIds = [...new Set(allMySignups.map(s => s.urgent_shift_id))]
      let signupShiftMap: Record<string, any> = {}
      if (signupShiftIds.length > 0) {
        const signupShifts: any[] = await query('urgent_shift',
          `id=in.(${signupShiftIds.join(',')})`+`&select=id,title,shift_date,start_time,end_time,project_id`
        )
        signupShifts.forEach(s => { signupShiftMap[s.id] = s })
      }

      const statusStylesUrgent: Record<string, { label: string; bg: string; color: string }> = {
        pending: { label: '待审核', bg: '#FFF8E1', color: '#F9A825' },
        approved: { label: '已通过', bg: '#E4FAF5', color: '#12B8A0' },
        rejected: { label: '未通过', bg: '#FFF0EE', color: '#D96B5A' },
      }

      const mySignups = allMySignups.map(s => {
        const shift = signupShiftMap[s.urgent_shift_id] || {}
        const style = statusStylesUrgent[s.status] || statusStylesUrgent.pending
        return {
          id: s.id,
          shiftTitle: shift.title || '紧急班次',
          shiftDate: shift.shift_date || '',
          timeRange: shift.start_time && shift.end_time
            ? `${shift.start_time.substring(0,5)}-${shift.end_time.substring(0,5)}` : '',
          projectName: shift.project_id ? projectMap[shift.project_id] || '' : '',
          statusLabel: style.label,
          statusBg: style.bg,
          statusColor: style.color,
          remark: s.remark || '',
          signupTime: s.created_at ? s.created_at.split('T')[0] : '',
        }
      })

      this.setData({ urgentShifts, mySignups, urgentLoading: false })
    } catch (err) {
      console.error('Load urgent shifts error:', err)
      this.setData({ urgentLoading: false })
    }
  },

  /** 点击报名按钮 */
  onSignupUrgent(e: any) {
    const id = e.currentTarget.dataset.id
    const title = e.currentTarget.dataset.title
    this.setData({
      showSignupModal: true,
      signupShiftId: id,
      signupShiftTitle: title,
      signupRemark: '',
      signupError: '',
    })
  },

  onSignupRemarkInput(e: any) {
    this.setData({ signupRemark: e.detail.value })
  },

  closeSignupModal() {
    this.setData({ showSignupModal: false, signupShiftId: '', signupShiftTitle: '', signupRemark: '', signupError: '' })
  },

  /** 确认报名 */
  async confirmSignup() {
    const { signupShiftId, signupRemark } = this.data
    if (!signupShiftId) return

    this.setData({ signupSubmitting: true, signupError: '' })
    try {
      const emp = getEmployee()
      if (!emp) return

      await insert('urgent_shift_signup', {
        urgent_shift_id: signupShiftId,
        employee_id: emp.id,
        status: 'pending',
        remark: signupRemark || null,
      })

      wx.showToast({ title: '报名成功！', icon: 'success' })
      this.setData({ showSignupModal: false, signupSubmitting: false })
      this.loadUrgentShifts()
    } catch (err: any) {
      const msg = err?.message || '报名失败'
      this.setData({ signupError: msg, signupSubmitting: false })
    }
  },
})
