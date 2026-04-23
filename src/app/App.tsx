import { RouterProvider } from 'react-router';
import { ConfigProvider } from 'antd';
import { router } from './routes';
import { AuthProvider } from './hooks/useCurrentUser';

import zhCN from 'antd/locale/zh_CN';
import 'dayjs/locale/zh-cn';

export default function App() {
  return (
    <AuthProvider>
      <ConfigProvider
        locale={zhCN}
        theme={{
          token: {
            colorPrimary: '#1677ff',
            borderRadius: 6,
            fontSize: 13,
          },
        }}
      >
        <RouterProvider router={router} />
      </ConfigProvider>
    </AuthProvider>
  );
}
