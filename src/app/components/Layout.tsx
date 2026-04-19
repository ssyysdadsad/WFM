import React, { useMemo, useState } from 'react';
import { Layout as AntLayout, Menu, theme, Avatar, Dropdown, Button } from 'antd';
import {
  DashboardOutlined,
  BookOutlined,
  EnvironmentOutlined,
  ToolOutlined,
  ProjectOutlined,
  UnorderedListOutlined,
  TeamOutlined,
  BranchesOutlined,
  UserOutlined,
  SafetyCertificateOutlined,
  FieldTimeOutlined,
  CalendarOutlined,
  SwapOutlined,
  BarChartOutlined,
  NotificationOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router';
import { usePermission } from '@/app/hooks/usePermission';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';

const { Header, Sider, Content } = AntLayout;

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: '仪表盘', moduleCode: 'dashboard' },
  {
    key: 'base', icon: <SettingOutlined />, label: '基础配置',
    children: [
      { key: '/dict', icon: <BookOutlined />, label: '字典管理', moduleCode: 'dict' },
      { key: '/scene', icon: <EnvironmentOutlined />, label: '场景管理', moduleCode: 'scene' },
      { key: '/device', icon: <ToolOutlined />, label: '设备管理', moduleCode: 'device' },
      { key: '/skill', icon: <SafetyCertificateOutlined />, label: '技能管理', moduleCode: 'skill' },
      { key: '/labor-rule', icon: <FieldTimeOutlined />, label: '用工规则', moduleCode: 'labor_rule' },
    ],
  },
  {
    key: 'project', icon: <ProjectOutlined />, label: '项目管理',
    children: [
      { key: '/project', icon: <ProjectOutlined />, label: '项目列表', moduleCode: 'project' },
      { key: '/task', icon: <UnorderedListOutlined />, label: '任务管理', moduleCode: 'task' },
    ],
  },
  {
    key: 'org', icon: <TeamOutlined />, label: '组织人员',
    children: [
      { key: '/department', icon: <TeamOutlined />, label: '部门管理', moduleCode: 'department' },
      { key: '/channel', icon: <BranchesOutlined />, label: '渠道管理', moduleCode: 'channel' },
      { key: '/employee', icon: <UserOutlined />, label: '员工管理', moduleCode: 'employee' },
    ],
  },
  {
    key: 'schedule', icon: <CalendarOutlined />, label: '排班管理',
    children: [
      { key: '/schedule-version', icon: <CalendarOutlined />, label: '排班版本', moduleCode: 'schedule_version' },
      { key: '/schedule', icon: <CalendarOutlined />, label: '排班矩阵', moduleCode: 'schedule' },
      { key: '/shift-change', icon: <SwapOutlined />, label: '调班审批', moduleCode: 'shift_change' },
    ],
  },
  { key: '/report', icon: <BarChartOutlined />, label: '统计报表', moduleCode: 'report' },
  { key: '/announcement', icon: <NotificationOutlined />, label: '公告管理', moduleCode: 'announcement' },
];

function filterMenuItems(items: any[], isAdmin: boolean, hasModuleAccess: (moduleCode: string) => boolean): any[] {
  return items.flatMap((item) => {
    if (item.children) {
      const children = filterMenuItems(item.children, isAdmin, hasModuleAccess);
      if (children.length === 0) {
        return [];
      }

      const { moduleCode: _moduleCode, ...rest } = item;
      return [{ ...rest, children }];
    }

    if (!item.moduleCode || isAdmin || hasModuleAccess(item.moduleCode)) {
      const { moduleCode: _moduleCode, ...rest } = item;
      return [rest];
    }

    return [];
  });
}

export function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, logout } = useCurrentUser();
  const { hasModuleAccess, isAdmin } = usePermission();
  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();

  const selectedKey = '/' + (location.pathname.split('/')[1] || '');

  const filteredMenuItems = useMemo(
    () => filterMenuItems(menuItems as any[], isAdmin, hasModuleAccess),
    [hasModuleAccess, isAdmin],
  );

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={220}
        style={{ background: colorBgContainer, borderRight: '1px solid #f0f0f0' }}
      >
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #f0f0f0' }}>
          <h3 style={{ margin: 0, fontSize: collapsed ? 14 : 16, fontWeight: 600, color: '#1677ff' }}>
            {collapsed ? 'WFM' : '企业排班系统'}
          </h3>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          defaultOpenKeys={['base', 'project', 'org', 'schedule']}
          items={filteredMenuItems}
          onClick={({ key }) => navigate(key)}
          style={{ border: 'none' }}
        />
      </Sider>
      <AntLayout>
        <Header style={{ padding: '0 24px', background: colorBgContainer, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f0f0f0' }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
          />
          <Dropdown menu={{
            items: [
              {
                key: 'logout',
                icon: <LogoutOutlined />,
                label: '退出登录',
                onClick: () => {
                  logout();
                  navigate('/login');
                },
              },
            ],
          }}>
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar icon={<UserOutlined />} />
              <span>{currentUser?.displayName ?? '未登录'}</span>
            </div>
          </Dropdown>
        </Header>
        <Content style={{ margin: 16, padding: 24, background: colorBgContainer, borderRadius: borderRadiusLG, overflow: 'auto' }}>
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  );
}
