// utils/request.ts — wx.request Promise 封装

interface RequestOptions {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  data?: any
  header?: Record<string, string>
}

interface RequestResult<T = any> {
  data: T
  statusCode: number
  header: Record<string, string>
}

export function request<T = any>(options: RequestOptions): Promise<RequestResult<T>> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: options.url,
      method: options.method || 'GET',
      data: options.data,
      header: {
        'Content-Type': 'application/json',
        ...options.header,
      },
      success(res: any) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ data: res.data, statusCode: res.statusCode, header: res.header })
        } else {
          const errMsg = res.data?.msg || res.data?.error_description || res.data?.message || `请求失败 (${res.statusCode})`
          reject(new Error(errMsg))
        }
      },
      fail(err: any) {
        reject(new Error(err.errMsg || '网络请求失败'))
      },
    })
  })
}
