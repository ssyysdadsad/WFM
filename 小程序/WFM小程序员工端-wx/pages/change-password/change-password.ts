// pages/change-password/change-password.ts
import { changePassword, logout } from '../../utils/auth'

Page({
  data: {
    isFirst: false,
    newPwd: '',
    confirmPwd: '',
    showNew: false,
    showConfirm: false,
    loading: false,
    error: '',
    hasMinLen: false,
    hasLetter: false,
    hasNumber: false,
    pwdMatch: false,
    isValid: false,
  },

  onLoad(options: any) {
    if (options.first === 'true') {
      this.setData({ isFirst: true })
    }
  },

  onNewInput(e: any) {
    const pwd = e.detail.value
    this.setData({ newPwd: pwd })
    this.checkRules()
  },

  onConfirmInput(e: any) {
    this.setData({ confirmPwd: e.detail.value })
    this.checkRules()
  },

  toggleNew() { this.setData({ showNew: !this.data.showNew }) },
  toggleConfirm() { this.setData({ showConfirm: !this.data.showConfirm }) },

  checkRules() {
    const { newPwd, confirmPwd } = this.data
    const hasMinLen = newPwd.length >= 8
    const hasLetter = /[a-zA-Z]/.test(newPwd)
    const hasNumber = /\d/.test(newPwd)
    const pwdMatch = newPwd === confirmPwd && confirmPwd.length > 0
    const isValid = hasMinLen && hasLetter && hasNumber && pwdMatch
    this.setData({ hasMinLen, hasLetter, hasNumber, pwdMatch, isValid })
  },

  async handleSubmit() {
    if (!this.data.isValid) {
      this.setData({ error: '请按要求设置密码' })
      return
    }
    this.setData({ loading: true, error: '' })
    try {
      const res = await changePassword(this.data.newPwd)
      if (res.success) {
        await logout()
        wx.redirectTo({ url: '/pages/login/login?msg=password_changed' })
      } else {
        this.setData({ error: res.message || '修改失败' })
      }
    } catch (err: any) {
      this.setData({ error: err.message || '网络异常' })
    } finally {
      this.setData({ loading: false })
    }
  },
})
