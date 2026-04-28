// pages/profile/profile.ts
import { requireAuth, getEmployee, logout } from '../../utils/auth'
import { query } from '../../utils/supabase'

Page({
  data: {
    loading: true,
    employee: {} as any,
    workAge: '—',
    skills: [] as any[],
  },

  onShow() {
    if (!requireAuth()) return
    this.loadProfile()
  },

  async loadProfile() {
    this.setData({ loading: true })
    try {
      const emp = getEmployee()
      if (!emp) return

      // Fetch latest employee data
      const emps: any[] = await query('employee',
        `id=eq.${emp.id}&select=id,full_name,employee_no,department_id,channel_id,mobile_number,onboard_date&limit=1`
      )
      if (emps && emps.length > 0) {
        const e = emps[0]
        let deptName = emp.department
        if (e.department_id) {
          try {
            const depts: any[] = await query('department', `id=eq.${e.department_id}&select=department_name&limit=1`)
            deptName = depts?.[0]?.department_name || deptName
          } catch (_) {}
        }

        // Get all skills
        let position = ''
        const skillList: any[] = []
        try {
          const empSkills: any[] = await query('employee_skill',
            `employee_id=eq.${emp.id}&select=skill_id,skill_level,is_primary&order=is_primary.desc`
          )
          if (empSkills && empSkills.length > 0) {
            const lvMap: Record<number, string> = { 1: '初级', 2: '中级', 3: '高级' }
            for (const es of empSkills) {
              try {
                const sk: any[] = await query('skill', `id=eq.${es.skill_id}&select=skill_name&limit=1`)
                const name = sk?.[0]?.skill_name || '未知技能'
                const level = lvMap[es.skill_level] || ''
                skillList.push({ name, level, isPrimary: !!es.is_primary })
                if (es.is_primary) {
                  position = `${name} · ${level}`
                }
              } catch (_) {}
            }
          }
        } catch (_) {}
        this.setData({ skills: skillList })

        const updated = {
          ...emp,
          name: e.full_name,
          no: e.employee_no,
          department: deptName,
          phone: e.mobile_number || '',
          onboardDate: e.onboard_date || '',
          position,
        }

        wx.setStorageSync('employee', updated)
        this.setData({ employee: updated })
      } else {
        this.setData({ employee: emp })
      }

      // Calculate work age
      const employee = this.data.employee
      if (employee.onboardDate) {
        const start = new Date(employee.onboardDate)
        const now = new Date()
        const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
        const workAge = months < 12
          ? `${months}个月`
          : `${Math.floor(months / 12)}年${months % 12 > 0 ? `${months % 12}个月` : ''}`
        this.setData({ workAge })
      }
    } catch (err) {
      console.error('Profile load error:', err)
      const emp = getEmployee()
      if (emp) this.setData({ employee: emp })
    } finally {
      this.setData({ loading: false })
    }
  },

  goChangePassword() {
    wx.navigateTo({ url: '/pages/change-password/change-password' })
  },

  async handleLogout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: async (res) => {
        if (res.confirm) {
          await logout()
          wx.redirectTo({ url: '/pages/login/login' })
        }
      },
    })
  },
})
