// pages/login/login.ts
import { login } from '../../utils/auth'

Page({
  data: {
    phone: '',
    password: '',
    showPwd: false,
    loading: false,
    error: '',
    successMsg: '',
    phoneFocus: false,
    pwdFocus: false,
  },

  onLoad(options: any) {
    if (options.msg === 'password_changed') {
      this.setData({ successMsg: '密码修改成功，请使用新密码重新登录' })
    }
  },

  onPhoneInput(e: any) { this.setData({ phone: e.detail.value, error: '' }) },
  onPwdInput(e: any) { this.setData({ password: e.detail.value, error: '' }) },
  onPhoneFocus() { this.setData({ phoneFocus: true }) },
  onPhoneBlur() { this.setData({ phoneFocus: false }) },
  onPwdFocus() { this.setData({ pwdFocus: true }) },
  onPwdBlur() { this.setData({ pwdFocus: false }) },
  togglePwd() { this.setData({ showPwd: !this.data.showPwd }) },

  async handleLogin() {
    const { phone, password } = this.data
    if (!phone || !password) {
      this.setData({ error: '请输入手机号和密码' })
      return
    }
    if (!/^1\d{10}$/.test(phone)) {
      this.setData({ error: '请输入有效的11位手机号' })
      return
    }

    this.setData({ loading: true, error: '', successMsg: '' })

    try {
      const res = await login(phone, password)
      if (res.success && res.employee) {
        if (res.mustChangePassword) {
          wx.redirectTo({ url: '/pages/change-password/change-password?first=true' })
        } else {
          wx.switchTab({ url: '/pages/home/home' })
        }
      } else {
        this.setData({ error: res.message || '登录失败' })
      }
    } catch (err: any) {
      this.setData({ error: err.message || '网络异常' })
    } finally {
      this.setData({ loading: false })
    }
  },
})
