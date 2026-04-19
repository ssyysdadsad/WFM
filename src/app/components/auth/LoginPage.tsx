import { useMemo, useState } from 'react';
import { Alert, Button, Card, Flex, Form, Input, List, Space, Tag, Typography } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { Navigate } from 'react-router';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';

export function LoginPage() {
  const { authMode, currentUser, loading, mockUsers, loginAsUser, loginWithPassword } = useCurrentUser();
  const [loginError, setLoginError] = useState<string | null>(null);

  const sortedUsers = useMemo(
    () =>
      [...mockUsers].sort((left, right) => {
        if (left.user.isAdmin === right.user.isAdmin) {
          return left.label.localeCompare(right.label, 'zh-CN');
        }

        return left.user.isAdmin ? -1 : 1;
      }),
    [mockUsers],
  );

  if (currentUser) {
    return <Navigate to="/" replace />;
  }

  async function handleSupabaseLogin(values: { email: string; password: string }) {
    setLoginError(null);

    try {
      await loginWithPassword(values.email, values.password);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : '登录失败');
    }
  }

  return (
    <Flex align="center" justify="center" style={{ minHeight: '100vh', padding: 24, background: '#f5f7fa' }}>
      <Card style={{ width: '100%', maxWidth: 720 }} styles={{ body: { padding: 24 } }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div>
            <Typography.Title level={3} style={{ marginBottom: 8 }}>
              WFM 后台登录
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {authMode === 'supabase'
                ? '当前已切换为真实 Supabase Auth 登录模式，登录成功后会按会话绑定后台账号与权限。'
                : '当前阶段使用模拟登录打通权限与页面链路。后续切换真实 `Supabase Auth` 时，登录上下文可复用。'}
            </Typography.Paragraph>
          </div>

          {authMode === 'supabase' ? (
            <Form layout="vertical" onFinish={handleSupabaseLogin} disabled={loading}>
              {loginError ? <Alert type="error" showIcon title={loginError} style={{ marginBottom: 16 }} /> : null}

              <Form.Item
                label="邮箱"
                name="email"
                rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '请输入合法邮箱地址' }]}
              >
                <Input placeholder="请输入 Supabase Auth 邮箱" autoComplete="username" />
              </Form.Item>

              <Form.Item
                label="密码"
                name="password"
                rules={[{ required: true, message: '请输入密码' }]}
              >
                <Input.Password placeholder="请输入密码" autoComplete="current-password" />
              </Form.Item>

              <Button type="primary" htmlType="submit" loading={loading} block>
                登录系统
              </Button>
            </Form>
          ) : (
            <List
              loading={loading}
              itemLayout="horizontal"
              dataSource={sortedUsers}
              renderItem={(item) => (
                <List.Item
                  actions={[
                    <Button key={item.id} type="primary" onClick={() => loginAsUser(item.id)}>
                      进入系统
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={<UserOutlined style={{ fontSize: 20, marginTop: 6 }} />}
                    title={
                      <Space size={8}>
                        <span>{item.label}</span>
                        {item.user.roles.map((role) => (
                          <Tag key={role.id} color={role.roleCode === 'admin' ? 'blue' : 'gold'}>
                            {role.roleName}
                          </Tag>
                        ))}
                      </Space>
                    }
                    description={item.description}
                  />
                </List.Item>
              )}
            />
          )}
        </Space>
      </Card>
    </Flex>
  );
}
