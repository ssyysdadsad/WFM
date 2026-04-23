// app.ts
import { checkAuth } from './utils/auth'

App({
  globalData: {
    employee: null as any,
    accessToken: '',
    mustChangePassword: false,
  },

  onLaunch() {
    // Check for existing session
    const token = wx.getStorageSync('access_token')
    const employee = wx.getStorageSync('employee')
    if (token && employee) {
      this.globalData.accessToken = token
      this.globalData.employee = employee
      this.globalData.mustChangePassword = employee.mustChangePassword || false

      // If must change password, redirect
      if (this.globalData.mustChangePassword) {
        wx.redirectTo({ url: '/pages/change-password/change-password?first=true' })
        return
      }
    } else {
      // No session, redirect to login
      wx.redirectTo({ url: '/pages/login/login' })
    }
  },
})
