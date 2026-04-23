// utils/auth.ts — 认证工具
import { signInWithPhone, signOut as supabaseSignOut, updatePassword, query, update } from './supabase'

export interface EmployeeProfile {
  id: string
  name: string
  no: string
  department: string
  departmentId: string
  channelId: string
  phone: string
  onboardDate: string
  position: string
  mustChangePassword: boolean
}

/** 登录 */
export async function login(phone: string, password: string): Promise<{
  success: boolean
  message?: string
  employee?: EmployeeProfile
  mustChangePassword?: boolean
}> {
  try {
    const authData = await signInWithPhone(phone, password)

    // 保存 token + auth user id
    wx.setStorageSync('access_token', authData.access_token)
    wx.setStorageSync('refresh_token', authData.refresh_token)
    wx.setStorageSync('auth_user_id', authData.user.id)

    const authUserId = authData.user.id

    // 查 user_account
    const accounts: any[] = await query('user_account',
      `auth_user_id=eq.${authUserId}&is_enabled=eq.true&select=id,employee_id,must_change_password,mobile_number&limit=1`
    )
    if (!accounts || accounts.length === 0) {
      return { success: false, message: '未找到关联的员工账号' }
    }
    const account = accounts[0]

    // 查 employee
    if (!account.employee_id) {
      return { success: false, message: '账号未关联员工信息' }
    }

    const emps: any[] = await query('employee',
      `id=eq.${account.employee_id}&select=id,full_name,employee_no,department_id,channel_id,mobile_number,onboard_date&limit=1`
    )
    if (!emps || emps.length === 0) {
      return { success: false, message: '未找到员工信息' }
    }
    const emp = emps[0]

    // 查部门名
    let deptName = ''
    if (emp.department_id) {
      try {
        const depts: any[] = await query('department',
          `id=eq.${emp.department_id}&select=department_name&limit=1`
        )
        deptName = depts?.[0]?.department_name || ''
      } catch (e) { /* ignore */ }
    }

    const employee: EmployeeProfile = {
      id: emp.id,
      name: emp.full_name,
      no: emp.employee_no,
      department: deptName,
      departmentId: emp.department_id || '',
      channelId: emp.channel_id || '',
      phone: emp.mobile_number || '',
      onboardDate: emp.onboard_date || '',
      position: '',
      mustChangePassword: account.must_change_password,
    }

    // 存入本地
    wx.setStorageSync('employee', employee)

    // 更新 globalData
    const app = getApp()
    app.globalData.accessToken = authData.access_token
    app.globalData.employee = employee
    app.globalData.mustChangePassword = account.must_change_password

    return { success: true, employee, mustChangePassword: account.must_change_password }
  } catch (err: any) {
    let msg = err.message || '登录失败'
    if (msg.includes('Invalid login credentials')) {
      msg = '手机号或密码错误'
    }
    return { success: false, message: msg }
  }
}

/** 修改密码 */
export async function changePassword(newPassword: string): Promise<{ success: boolean; message?: string }> {
  try {
    await updatePassword(newPassword)

    // 清除 must_change_password 标记
    const authUserId = wx.getStorageSync('auth_user_id')
    if (authUserId) {
      await update('user_account', `auth_user_id=eq.${authUserId}`, { must_change_password: false })
    }

    return { success: true, message: '密码修改成功' }
  } catch (err: any) {
    return { success: false, message: err.message || '修改密码失败' }
  }
}

/** 退出登录 */
export async function logout() {
  try {
    await supabaseSignOut()
  } catch (e) { /* ignore */ }
  wx.removeStorageSync('access_token')
  wx.removeStorageSync('refresh_token')
  wx.removeStorageSync('auth_user_id')
  wx.removeStorageSync('employee')

  const app = getApp()
  app.globalData.accessToken = ''
  app.globalData.employee = null
  app.globalData.mustChangePassword = false
}

/** 检查是否已登录 */
export function checkAuth(): boolean {
  const token = wx.getStorageSync('access_token')
  const employee = wx.getStorageSync('employee')
  return !!(token && employee)
}

/** 要求登录，未登录跳转 */
export function requireAuth() {
  if (!checkAuth()) {
    wx.redirectTo({ url: '/pages/login/login' })
    return false
  }
  return true
}

/** 获取本地缓存的员工信息 */
export function getEmployee(): EmployeeProfile | null {
  return wx.getStorageSync('employee') || null
}
