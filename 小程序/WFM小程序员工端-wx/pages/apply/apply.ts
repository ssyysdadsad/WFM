// pages/apply/apply.ts
import { requireAuth, getEmployee } from '../../utils/auth'
import { query, insert, update } from '../../utils/supabase'

Page({
  data: {
    activeTab: 'list',
    loading: false,
    submitting: false,
    requests: [] as any[],
    // 三种类型: leave | direct_swap | swap_with_payback
    requestType: 'direct_swap' as 'leave' | 'direct_swap' | 'swap_with_payback',
    employee: { name: '', department: '' } as any,
    // 申请人日期/班次
    formOrigDate: '',
    myShiftCode: '',
    myShiftCodeId: '',
    myScheduleId: '',
    myShiftIsRest: false,
    // 对方员工
    targetEmployeeOptions: [] as any[],
    targetEmpPickerIndex: 0,
    formTargetEmpId: '',
    formTargetEmpName: '',
    targetScheduleId: '',
    targetShiftCode: '',
    targetShiftCodeId: '',
    // direct_swap: 对方日期（可跨日）
    formTargetDate: '',
    // swap_with_payback: 还班日
    paybackDateOptions: [] as any[],
    paybackDateLabels: [] as string[],
    selectedPaybackIndex: 0,
    selectedPaybackDate: '',
    selectedPaybackScheduleId: '',
    // 公共
    formReason: '',
    formError: '',
    formSuccess: '',
    // 待我确认
    pendingPeerRequests: [] as any[],
    pendingPeerLoading: false,
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
      this.setData({ employee: { name: emp.name, no: emp.no, department: emp.department, id: emp.id } })
    }
    this.loadRequests()
    this.loadShiftOptions()
    this.loadActiveVersionIds().then(() => { this.loadUrgentShifts() })
  },

  switchTab(e: any) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab, formError: '', formSuccess: '' })
    if (tab === 'urgent') this.loadUrgentShifts()
    else if (tab === 'peer') this.loadPendingPeerRequests()
  },

  switchRequestType(e: any) {
    const type = e.currentTarget.dataset.type
    this.setData({
      requestType: type, formError: '', formSuccess: '',
      formTargetEmpId: '', formTargetEmpName: '',
      targetScheduleId: '', targetShiftCode: '', targetShiftCodeId: '',
      formTargetDate: '',
      paybackDateOptions: [], paybackDateLabels: [], selectedPaybackDate: '', selectedPaybackScheduleId: '',
      targetEmployeeOptions: [],
    })
    if (this.data.formOrigDate && !this.data.myShiftIsRest) {
      this.loadTargetEmployees(this.data.formOrigDate, type)
    }
  },

  async onOrigDateChange(e: any) {
    const date = e.detail.value
    this.setData({
      formOrigDate: date, myShiftCode: '', myShiftCodeId: '', myScheduleId: '',
      myShiftIsRest: false, formError: '',
      formTargetEmpId: '', formTargetEmpName: '', targetScheduleId: '',
      targetShiftCode: '', targetShiftCodeId: '', formTargetDate: '',
      paybackDateOptions: [], paybackDateLabels: [], selectedPaybackDate: '', selectedPaybackScheduleId: '',
      targetEmployeeOptions: [],
    })
    await this.detectMyShift(date)
    if (!this.data.myShiftIsRest) {
      await this.loadTargetEmployees(date, this.data.requestType)
    }
  },

  onReasonInput(e: any) { this.setData({ formReason: e.detail.value }) },

  async onTargetDateChange(e: any) {
    const date = e.detail.value
    this.setData({ formTargetDate: date, formTargetEmpId: '', formTargetEmpName: '', targetScheduleId: '', targetShiftCode: '', targetShiftCodeId: '' })
    await this.loadTargetEmployees(date, 'direct_swap')
  },

  async onTargetEmpChange(e: any) {
    const idx = Number(e.detail.value)
    const opt = this.data.targetEmployeeOptions[idx]
    if (!opt) return
    this.setData({
      targetEmpPickerIndex: idx,
      formTargetEmpId: opt.id,
      formTargetEmpName: opt.name,
      targetScheduleId: opt.scheduleId || '',
      targetShiftCode: opt.shiftCode || '',
      targetShiftCodeId: opt.shiftCodeId || '',
      paybackDateOptions: [], paybackDateLabels: [], selectedPaybackDate: '', selectedPaybackScheduleId: '',
    })
    if (this.data.requestType === 'swap_with_payback') {
      await this.loadPaybackDates(opt.id)
    }
  },

  onPaybackDateChange(e: any) {
    const idx = Number(e.detail.value)
    const opt = this.data.paybackDateOptions[idx]
    if (opt) {
      this.setData({ selectedPaybackIndex: idx, selectedPaybackDate: opt.date, selectedPaybackScheduleId: opt.targetScheduleId })
    }
  },

  async detectMyShift(date: string) {
    try {
      const emp = getEmployee(); if (!emp) return
      const vf = this.data._activeVersionIds.length > 0 ? `&schedule_version_id=in.(${this.data._activeVersionIds.join(',')})` : ''
      const rows: any[] = await query('schedule', `employee_id=eq.${emp.id}&schedule_date=eq.${date}${vf}&select=id,schedule_code_dict_item_id&limit=1`)
      if (rows.length > 0) {
        const codeId = rows[0].schedule_code_dict_item_id
        const codes: any[] = await query('dict_item', `id=eq.${codeId}&select=item_name,extra_config&limit=1`)
        const codeItem = codes?.[0]
        const codeName = codeItem?.item_name || '?'
        const isRest = ['rest', 'leave'].includes(codeItem?.extra_config?.category)
        this.setData({ myShiftCode: codeName, myShiftCodeId: codeId, myScheduleId: rows[0].id, myShiftIsRest: isRest })
        if (isRest) this.setData({ formError: `您在 ${date} 已是休息，无需申请调班` })
        else this.setData({ formError: '' })
      } else {
        this.setData({ myShiftCode: '无排班', myShiftCodeId: '', myScheduleId: '', myShiftIsRest: false, formError: `您在 ${date} 没有排班，无法申请` })
      }
    } catch (e) { console.error('detectMyShift', e) }
  },

  async loadActiveVersionIds() {
    try {
      const emp = getEmployee()
      let q = 'is_active=eq.true&published_at=not.is.null&select=id'
      if (emp?.id) {
        const pe: any[] = await query('project_employee', `employee_id=eq.${emp.id}&is_active=eq.true&select=project_id`)
        const pids = pe.map(r => r.project_id)
        if (pids.length > 0) q += `&project_id=in.(${pids.join(',')})`
      }
      const v: any[] = await query('schedule_version', q)
      this.setData({ _activeVersionIds: v.map(x => x.id) })
    } catch (e) { /* ignore */ }
  },

  async loadShiftOptions() {
    try {
      const dtList: any[] = await query('dict_type', 'select=id,type_code')
      const approvalTypeId = dtList.find(t => t.type_code === 'approval_status')?.id
      if (approvalTypeId) {
        const items: any[] = await query('dict_item', `dict_type_id=eq.${approvalTypeId}&item_code=eq.pending&select=id&limit=1`)
        if (items?.[0]) this.setData({ _pendingStatusId: items[0].id })
      }
    } catch (e) { console.error('loadShiftOptions', e) }
  },

  async loadTargetEmployees(date: string, mode: string) {
    if (mode === 'leave') { this.setData({ targetEmployeeOptions: [] }); return }
    try {
      const emp = getEmployee(); if (!emp) return
      const vf = this.data._activeVersionIds.length > 0 ? `&schedule_version_id=in.(${this.data._activeVersionIds.join(',')})` : ''
      const pe: any[] = await query('project_employee', `employee_id=eq.${emp.id}&is_active=eq.true&select=project_id`)
      const pids = pe.map(r => r.project_id)
      if (pids.length === 0) { this.setData({ targetEmployeeOptions: [] }); return }
      const peers: any[] = await query('project_employee', `project_id=in.(${pids.join(',')})&is_active=eq.true&select=employee_id`)
      const peerIds = [...new Set(peers.map(r => r.employee_id).filter((id: string) => id !== emp.id))]
      if (peerIds.length === 0) { this.setData({ targetEmployeeOptions: [] }); return }
      const scheds: any[] = await query('schedule', `schedule_date=eq.${date}${vf}&employee_id=in.(${peerIds.join(',')})&select=id,employee_id,schedule_code_dict_item_id`)
      const dtList: any[] = await query('dict_type', 'select=id,type_code')
      const schedTypeId = dtList.find(t => t.type_code === 'schedule_code' || t.type_code === 'shift_code')?.id
      if (!schedTypeId) return
      const allCodes: any[] = await query('dict_item', `dict_type_id=eq.${schedTypeId}&is_enabled=eq.true&select=id,item_name,extra_config`)
      const restIds = new Set(allCodes.filter(c => ['rest', 'leave'].includes(c.extra_config?.category)).map(c => c.id))
      const codeNames: Record<string, string> = {}
      allCodes.forEach(c => { codeNames[c.id] = c.item_name || '?' })
      const schedMap = new Map<string, any>()
      scheds.forEach(s => schedMap.set(s.employee_id, s))
      let filteredIds: string[] = []
      if (mode === 'direct_swap') {
        filteredIds = peerIds.filter((id: string) => {
          const s = schedMap.get(id)
          return s && !restIds.has(s.schedule_code_dict_item_id) && s.schedule_code_dict_item_id !== this.data.myShiftCodeId
        })
      } else {
        filteredIds = peerIds.filter((id: string) => { const s = schedMap.get(id); return !s || restIds.has(s.schedule_code_dict_item_id) })
      }
      if (filteredIds.length === 0) { this.setData({ targetEmployeeOptions: [] }); return }
      const emps: any[] = await query('employee', `id=in.(${filteredIds.join(',')})&select=id,full_name,employee_no`)
      const opts = emps.map(e => {
        const s = schedMap.get(e.id)
        const code = s ? (codeNames[s.schedule_code_dict_item_id] || '') : '休'
        return { id: e.id, name: e.full_name, label: `${e.full_name}${e.employee_no ? '(' + e.employee_no + ')' : ''} [${code}]`, scheduleId: s?.id || '', shiftCode: code, shiftCodeId: s?.schedule_code_dict_item_id || '' }
      })
      this.setData({ targetEmployeeOptions: opts })
    } catch (e) { console.error('loadTargetEmployees', e); this.setData({ targetEmployeeOptions: [] }) }
  },

  async loadPaybackDates(targetEmpId: string) {
    try {
      const emp = getEmployee(); if (!emp) return
      const date = this.data.formOrigDate
      const vids = this.data._activeVersionIds
      if (vids.length === 0) return
      const d = new Date(date)
      const monthEnd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()}`
      const scheds: any[] = await query('schedule', `schedule_version_id=in.(${vids.join(',')})&schedule_date=gte.${date}&schedule_date=lte.${monthEnd}&employee_id=in.(${emp.id},${targetEmpId})&select=id,employee_id,schedule_date,schedule_code_dict_item_id`)
      const dtList: any[] = await query('dict_type', 'select=id,type_code')
      const schedTypeId = dtList.find(t => t.type_code === 'schedule_code' || t.type_code === 'shift_code')?.id
      if (!schedTypeId) return
      const allCodes: any[] = await query('dict_item', `dict_type_id=eq.${schedTypeId}&is_enabled=eq.true&select=id,item_name,extra_config`)
      const restIds = new Set(allCodes.filter(c => ['rest', 'leave'].includes(c.extra_config?.category)).map(c => c.id))
      const codeNames: Record<string, string> = {}; allCodes.forEach(c => { codeNames[c.id] = c.item_name || '?' })
      const myMap = new Map<string, any>(); const tgtMap = new Map<string, any>()
      scheds.forEach(s => {
        const isRest = !s.schedule_code_dict_item_id || restIds.has(s.schedule_code_dict_item_id)
        if (s.employee_id === emp.id) myMap.set(s.schedule_date, { isRest })
        else tgtMap.set(s.schedule_date, { isRest, id: s.id, codeId: s.schedule_code_dict_item_id })
      })
      const opts: any[] = []; const labels: string[] = []
      const cur = new Date(date); cur.setDate(cur.getDate() + 1); const end = new Date(monthEnd)
      while (cur <= end) {
        const ds = cur.toISOString().split('T')[0]
        const myIsRest = myMap.get(ds)?.isRest ?? true
        const tgt = tgtMap.get(ds)
        if (myIsRest && tgt && !tgt.isRest) {
          const code = codeNames[tgt.codeId] || '?'
          opts.push({ date: ds, targetCode: code, targetScheduleId: tgt.id })
          labels.push(`${ds}（我休，对方上${code}）`)
        }
        cur.setDate(cur.getDate() + 1)
      }
      this.setData({ paybackDateOptions: opts, paybackDateLabels: labels })
      if (opts.length === 0) this.setData({ formError: '本月内无合适还班日，建议改为申请请假' })
      else this.setData({ formError: '' })
    } catch (e) { console.error('loadPaybackDates', e) }
  },

  async loadRequests() {
    this.setData({ loading: true })
    try {
      const emp = getEmployee(); if (!emp) return
      const rows: any[] = await query('shift_change_request', `applicant_employee_id=eq.${emp.id}&select=*&order=created_at.desc`)
      const statusIds = [...new Set(rows.map(r => r.approval_status_dict_item_id).filter(Boolean))]
      let statusMap: Record<string, string> = {}
      if (statusIds.length > 0) {
        const items: any[] = await query('dict_item', `id=in.(${statusIds.join(',')})&select=id,item_code`)
        items.forEach(i => { statusMap[i.id] = i.item_code })
      }
      const schedIds = [...new Set([...rows.map(r => r.original_schedule_id), ...rows.map(r => r.target_schedule_id)].filter(Boolean))]
      let schedMap: Record<string, any> = {}
      if (schedIds.length > 0) {
        const scheds: any[] = await query('schedule', `id=in.(${schedIds.join(',')})&select=id,schedule_date,schedule_code_dict_item_id`)
        const codeIds = [...new Set(scheds.map(s => s.schedule_code_dict_item_id).filter(Boolean))]
        let codeNames: Record<string, string> = {}
        if (codeIds.length > 0) { const c: any[] = await query('dict_item', `id=in.(${codeIds.join(',')})&select=id,item_name`); c.forEach(x => { codeNames[x.id] = x.item_name || '?' }) }
        scheds.forEach(s => { schedMap[s.id] = { date: s.schedule_date, code: codeNames[s.schedule_code_dict_item_id] || '?' } })
      }
      const empIds = [...new Set(rows.map(r => r.target_employee_id).filter(Boolean))]
      let empNames: Record<string, string> = {}
      if (empIds.length > 0) { const e: any[] = await query('employee', `id=in.(${empIds.join(',')})&select=id,full_name`); e.forEach(x => { empNames[x.id] = x.full_name }) }
      const ss: Record<string, any> = { pending: { label: '待审批', bg: '#FFF8E1', color: '#F9A825' }, approved: { label: '已通过', bg: '#E4FAF5', color: '#12B8A0' }, rejected: { label: '已拒绝', bg: '#FFF0EE', color: '#D96B5A' } }
      const tl: Record<string, string> = { leave: '请假', direct_swap: '直接换班', swap_with_payback: '互换调班', swap: '换班', take_off: '请假' }
      const pl: Record<string, string> = { pending_peer: '待对方确认', peer_approved: '对方已同意', peer_rejected: '对方已拒绝', not_required: '' }
      const requests = rows.map(r => {
        const style = ss[statusMap[r.approval_status_dict_item_id]] || ss.pending
        const orig = schedMap[r.original_schedule_id]; const target = schedMap[r.target_schedule_id]
        return { id: r.id, typeLabel: tl[r.request_type] || r.request_type, statusLabel: style.label, statusBg: style.bg, statusColor: style.color, originalDate: orig?.date || '', originalShift: orig?.code || '', targetDate: target?.date || r.target_date || '', targetShift: target?.code || '', targetEmployeeName: empNames[r.target_employee_id] || '', paybackDate: r.payback_date || '', peerStatusLabel: pl[r.peer_status || 'not_required'] || '', reason: r.reason || '', createdAt: r.created_at ? r.created_at.split('T')[0] : '' }
      })
      this.setData({ requests, loading: false })
    } catch (err) { console.error('loadRequests', err); this.setData({ loading: false }) }
  },

  async handleSubmit() {
    const { requestType, formOrigDate, formReason, myScheduleId, _pendingStatusId } = this.data
    if (!formOrigDate) { this.setData({ formError: '请选择日期' }); return }
    if (!myScheduleId) { this.setData({ formError: '该日期未找到排班记录' }); return }
    if (this.data.myShiftIsRest) { this.setData({ formError: '您已是休息状态，无需申请' }); return }
    if (!formReason) { this.setData({ formError: '请输入调班事由' }); return }
    if (!_pendingStatusId) { this.setData({ formError: '系统配置异常' }); return }
    if (requestType === 'direct_swap' && !this.data.formTargetEmpId) { this.setData({ formError: '请选择换班对象' }); return }
    if (requestType === 'direct_swap' && !this.data.targetScheduleId) { this.setData({ formError: '对方在选定日期无排班' }); return }
    if (requestType === 'swap_with_payback' && !this.data.formTargetEmpId) { this.setData({ formError: '请选择顶班人员' }); return }
    this.setData({ submitting: true, formError: '', formSuccess: '' })
    try {
      const emp = getEmployee(); if (!emp) return
      const payload: any = { request_type: requestType, applicant_employee_id: emp.id, original_schedule_id: myScheduleId, reason: formReason, approval_status_dict_item_id: _pendingStatusId, peer_status: requestType === 'leave' ? 'not_required' : 'pending_peer' }
      if (requestType === 'direct_swap') {
        payload.target_employee_id = this.data.formTargetEmpId
        payload.target_schedule_id = this.data.targetScheduleId
        payload.target_date = this.data.formTargetDate || formOrigDate
      } else if (requestType === 'swap_with_payback') {
        payload.target_employee_id = this.data.formTargetEmpId
        payload.target_schedule_id = this.data.targetScheduleId
        if (this.data.selectedPaybackDate) { payload.payback_date = this.data.selectedPaybackDate; payload.payback_schedule_id = this.data.selectedPaybackScheduleId }
      }
      await insert('shift_change_request', payload)
      if (payload.target_employee_id) {
        try { await insert('employee_message', { employee_id: payload.target_employee_id, title: '调班确认请求', content: `${emp.name} 向您发起了${requestType === 'direct_swap' ? '直接换班' : '互换调班'}申请(${formOrigDate})，请在「调班申请-待我确认」中处理。`, is_read: false }) } catch { /* ignore */ }
      }
      this.setData({ formSuccess: '调班申请已提交！', formOrigDate: '', myShiftCode: '', myShiftCodeId: '', myScheduleId: '', formTargetDate: '', formTargetEmpId: '', formTargetEmpName: '', targetScheduleId: '', targetShiftCode: '', targetShiftCodeId: '', formReason: '', submitting: false, paybackDateOptions: [], paybackDateLabels: [], selectedPaybackDate: '', selectedPaybackScheduleId: '', targetEmployeeOptions: [] })
      this.loadRequests()
    } catch (err: any) { this.setData({ formError: err.message || '提交失败', submitting: false }) }
  },

  async loadPendingPeerRequests() {
    this.setData({ pendingPeerLoading: true })
    try {
      const emp = getEmployee(); if (!emp) return
      const rows: any[] = await query('shift_change_request', `target_employee_id=eq.${emp.id}&peer_status=eq.pending_peer&select=*&order=created_at.desc`)
      const appIds = [...new Set(rows.map(r => r.applicant_employee_id).filter(Boolean))]
      let nameMap: Record<string, string> = {}
      if (appIds.length > 0) { const e: any[] = await query('employee', `id=in.(${appIds.join(',')})&select=id,full_name`); e.forEach(x => { nameMap[x.id] = x.full_name }) }
      const allIds = [...new Set([...rows.map(r => r.original_schedule_id), ...rows.map(r => r.target_schedule_id)].filter(Boolean))]
      let schedInfo: Record<string, any> = {}
      if (allIds.length > 0) {
        const s: any[] = await query('schedule', `id=in.(${allIds.join(',')})&select=id,schedule_date,schedule_code_dict_item_id`)
        const cids = [...new Set(s.map(x => x.schedule_code_dict_item_id).filter(Boolean))]
        let cn: Record<string, string> = {}
        if (cids.length > 0) { const c: any[] = await query('dict_item', `id=in.(${cids.join(',')})&select=id,item_name`); c.forEach(x => { cn[x.id] = x.item_name || '?' }) }
        s.forEach(x => { schedInfo[x.id] = { date: x.schedule_date, code: cn[x.schedule_code_dict_item_id] || '?' } })
      }
      const tl: Record<string, string> = { direct_swap: '直接换班', swap_with_payback: '互换调班', leave: '请假', swap: '换班', take_off: '请假替班' }
      const reqs = rows.map(r => {
        const orig = schedInfo[r.original_schedule_id]; const tgt = schedInfo[r.target_schedule_id]
        return { id: r.id, applicantName: nameMap[r.applicant_employee_id] || '未知', requestType: r.request_type, typeLabel: tl[r.request_type] || r.request_type, originalDate: orig?.date || '', targetDate: tgt?.date || r.target_date || '', applicantShift: orig?.code || '', myShiftOnThatDay: r.request_type === 'direct_swap' ? (tgt?.code || '') : '休', paybackDate: r.payback_date || '', reason: r.reason || '', createdAt: r.created_at ? r.created_at.split('T')[0] : '' }
      })
      this.setData({ pendingPeerRequests: reqs, pendingPeerLoading: false })
    } catch (e) { console.error('loadPendingPeerRequests', e); this.setData({ pendingPeerLoading: false }) }
  },

  async handlePeerResponse(e: any) {
    const { id, action } = e.currentTarget.dataset
    if (!id || !action) return
    wx.showModal({
      title: action === 'approve' ? '确认同意？' : '确认拒绝？',
      content: action === 'approve' ? '同意后此调班申请将提交管理员审批' : '拒绝后此调班申请将关闭',
      success: async (res) => {
        if (!res.confirm) return
        try {
          const updateData: any = { peer_status: action === 'approve' ? 'peer_approved' : 'peer_rejected', peer_responded_at: new Date().toISOString() }
          if (action === 'reject') {
            const dtList: any[] = await query('dict_type', 'select=id,type_code')
            const approvalTypeId = dtList.find(t => t.type_code === 'approval_status')?.id
            if (approvalTypeId) { const items: any[] = await query('dict_item', `dict_type_id=eq.${approvalTypeId}&item_code=eq.rejected&select=id&limit=1`); if (items?.[0]) updateData.approval_status_dict_item_id = items[0].id }
          }
          await update('shift_change_request', `id=eq.${id}`, updateData)
          wx.showToast({ title: action === 'approve' ? '已同意' : '已拒绝', icon: 'success' })
          this.loadPendingPeerRequests()
        } catch (err: any) { wx.showToast({ title: err.message || '操作失败', icon: 'none' }) }
      }
    })
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
      const shiftDates = [...new Set(shifts.reduce((acc: string[], s: any) => {
        const dates = Array.isArray(s.shift_dates) ? s.shift_dates : [s.shift_date];
        return acc.concat(dates);
      }, []))]
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
          let versionIds = this.data._activeVersionIds
          if (versionIds.length === 0) {
            // 异步竞态：版本ID可能还没加载完，在此直接查询（含项目隔离）
            let fallbackQuery = 'is_active=eq.true&published_at=not.is.null&select=id'
            if (emp?.id) {
              const peRows2: any[] = await query('project_employee',
                `employee_id=eq.${emp.id}&is_active=eq.true&select=project_id`
              )
              const pids = peRows2.map(r => r.project_id)
              if (pids.length > 0) fallbackQuery += `&project_id=in.(${pids.join(',')})`
            }
            const vers: any[] = await query('schedule_version', fallbackQuery)
            versionIds = vers.map(v => v.id)
            this.setData({ _activeVersionIds: versionIds })
          }
          if (versionIds.length === 0) {
            // 没有已发布的激活版本，不查排班
          }
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
          const shiftDatesList: string[] = Array.isArray(s.shift_dates) ? s.shift_dates : [s.shift_date]
          let hasConflict = false
          for (const sd of shiftDatesList) {
            const mySchedule = scheduleMap[sd]
            if (mySchedule && mySchedule.category !== 'rest' && mySchedule.category !== 'leave') {
              hasConflict = true
              break
            }
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
            shiftDate: (Array.isArray(s.shift_dates) && s.shift_dates.length > 0) ? s.shift_dates.join('、') : s.shift_date,
            shiftDates: Array.isArray(s.shift_dates) ? s.shift_dates : [s.shift_date],
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
          `id=in.(${signupShiftIds.join(',')})`+`&select=id,title,shift_date,shift_dates,start_time,end_time,project_id`
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
          shiftDate: (Array.isArray(shift.shift_dates) && shift.shift_dates.length > 0) ? shift.shift_dates.join('、') : (shift.shift_date || ''),
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
