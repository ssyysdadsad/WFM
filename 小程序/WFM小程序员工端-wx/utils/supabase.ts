// utils/supabase.ts — Supabase REST API 封装（不用 JS SDK）
import { request } from './request'

const SUPABASE_URL = 'https://gtzbjvqqxsrffsvglula.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0emJqdnFxeHNyZmZzdmdsdWxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzOTA2MDYsImV4cCI6MjA5MTk2NjYwNn0.F24I7-E0TnyRIKcaW2U0pu2Wa-N_qprqVStmUCOfLno'

/** 判断 JWT 是否即将过期（提前 60 秒刷新） */
function isTokenExpired(): boolean {
  const token = wx.getStorageSync('access_token')
  if (!token) return true
  try {
    // 解析 JWT payload（base64url -> base64 -> decode）
    const parts = token.split('.')
    if (parts.length < 2) return true
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    // padding
    while (b64.length % 4) b64 += '='
    const jsonStr = decodeURIComponent(
      Array.from(new Uint8Array(wx.base64ToArrayBuffer(b64)))
        .map((b: number) => '%' + ('00' + b.toString(16)).slice(-2))
        .join('')
    )
    const payload = JSON.parse(jsonStr)
    const exp = payload.exp * 1000
    return Date.now() > exp - 60000
  } catch {
    return true
  }
}

/** 用 refresh_token 刷新 access_token */
let refreshPromise: Promise<void> | null = null

async function refreshAccessToken(): Promise<void> {
  // 防止并发多次刷新
  if (refreshPromise) return refreshPromise
  
  refreshPromise = (async () => {
    const refreshToken = wx.getStorageSync('refresh_token')
    if (!refreshToken) {
      throw new Error('no_refresh_token')
    }
    try {
      const res = await request<any>({
        url: `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
        method: 'POST',
        header: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
        data: { refresh_token: refreshToken },
      })
      // 保存新 token
      wx.setStorageSync('access_token', res.data.access_token)
      wx.setStorageSync('refresh_token', res.data.refresh_token)
      const app = getApp()
      if (app?.globalData) {
        app.globalData.accessToken = res.data.access_token
      }
    } catch (err) {
      // refresh 也失败了，清除登录跳转登录页
      wx.removeStorageSync('access_token')
      wx.removeStorageSync('refresh_token')
      wx.redirectTo({ url: '/pages/login/login' })
      throw err
    } finally {
      refreshPromise = null
    }
  })()
  
  return refreshPromise
}

/** 获取通用 headers（自动刷新过期 token） */
async function getHeaders(withAuth = true): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'apikey': ANON_KEY,
    'Content-Type': 'application/json',
  }
  if (withAuth) {
    // 检查 token 是否过期，自动刷新
    if (isTokenExpired()) {
      try {
        await refreshAccessToken()
      } catch (e) {
        // 刷新失败，使用 anon key
      }
    }
    const token = wx.getStorageSync('access_token')
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
  }
  return headers
}

/** PostgREST 查询 */
export async function query<T = any>(table: string, params: string = '', options?: { single?: boolean }): Promise<T> {
  const headers = await getHeaders()
  if (options?.single) {
    headers['Accept'] = 'application/vnd.pgrst.object+json'
  }
  const res = await request<T>({
    url: `${SUPABASE_URL}/rest/v1/${table}?${params}`,
    method: 'GET',
    header: headers,
  })
  return res.data
}

/** PostgREST 插入 */
export async function insert<T = any>(table: string, data: any): Promise<T> {
  const headers = await getHeaders()
  headers['Prefer'] = 'return=representation'
  const res = await request<T>({
    url: `${SUPABASE_URL}/rest/v1/${table}`,
    method: 'POST',
    header: headers,
    data,
  })
  return res.data
}

/** PostgREST 更新 */
export async function update<T = any>(table: string, params: string, data: any): Promise<T> {
  const headers = await getHeaders()
  headers['Prefer'] = 'return=representation'
  const res = await request<T>({
    url: `${SUPABASE_URL}/rest/v1/${table}?${params}`,
    method: 'PATCH',
    header: headers,
    data,
  })
  return res.data
}

// ========== GoTrue Auth API ==========

export interface AuthResult {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token: string
  user: {
    id: string
    phone: string
    [key: string]: any
  }
}

/** 手机号 + 密码登录（使用虚拟 email: 手机号@wfm.local） */
export async function signInWithPhone(phone: string, password: string): Promise<AuthResult> {
  const email = `${phone}@wfm.local`
  const res = await request<AuthResult>({
    url: `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    method: 'POST',
    header: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
    data: { email, password },
  })
  return res.data
}

/** 修改密码 */
export async function updatePassword(newPassword: string): Promise<any> {
  const token = wx.getStorageSync('access_token')
  const res = await request({
    url: `${SUPABASE_URL}/auth/v1/user`,
    method: 'PUT',
    header: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: { password: newPassword },
  })
  return res.data
}

/** 登出 */
export async function signOut(): Promise<void> {
  const token = wx.getStorageSync('access_token')
  if (token) {
    try {
      await request({
        url: `${SUPABASE_URL}/auth/v1/logout`,
        method: 'POST',
        header: {
          'apikey': ANON_KEY,
          'Authorization': `Bearer ${token}`,
        },
      })
    } catch (e) {
      // ignore
    }
  }
}

/** 调用 Edge Function */
export async function callEdgeFunction(name: string, data: any): Promise<any> {
  const token = wx.getStorageSync('access_token')
  const res = await request({
    url: `${SUPABASE_URL}/functions/v1/${name}`,
    method: 'POST',
    header: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data,
  })
  return res.data
}

export { SUPABASE_URL, ANON_KEY }
