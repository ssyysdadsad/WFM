import { RouterProvider } from 'react-router';
import { ConfigProvider } from 'antd';
import { router } from './routes';
import { AuthProvider } from './hooks/useCurrentUser';

export default function App() {
  return (
    <AuthProvider>
      <ConfigProvider
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
