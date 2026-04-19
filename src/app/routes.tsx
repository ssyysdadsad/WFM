import { createBrowserRouter } from 'react-router';
import { MainLayout } from './components/Layout';
import { DashboardPage } from './components/DashboardPage';
import { DictPage } from './components/DictPage';
import { ScenePage } from './components/pages/ScenePage';
import { DevicePage } from './components/pages/DevicePage';
import { ProjectPage } from './components/pages/ProjectPage';
import { TaskPage } from './components/pages/TaskPage';
import { DepartmentPage } from './components/pages/DepartmentPage';
import { ChannelPage } from './components/pages/ChannelPage';
import { EmployeePage } from './components/pages/EmployeePage';
import { SkillPage } from './components/pages/SkillPage';
import { LaborRulePage } from './components/pages/LaborRulePage';
import { ScheduleVersionPage } from './components/pages/ScheduleVersionPage';
import { ScheduleMatrixPage } from './components/pages/ScheduleMatrixPage';
import { ShiftChangePage } from './components/pages/ShiftChangePage';
import { ReportPage } from './components/pages/ReportPage';
import { AnnouncementPage } from './components/pages/AnnouncementPage';
import { LoginPage } from './components/auth/LoginPage';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

function ProtectedAppLayout() {
  return (
    <ProtectedRoute>
      <MainLayout />
    </ProtectedRoute>
  );
}

export const router = createBrowserRouter([
  {
    path: '/login',
    Component: LoginPage,
  },
  {
    path: '/',
    Component: ProtectedAppLayout,
    children: [
      { index: true, Component: DashboardPage },
      { path: 'dict', Component: DictPage },
      { path: 'scene', Component: ScenePage },
      { path: 'device', Component: DevicePage },
      { path: 'project', Component: ProjectPage },
      { path: 'task', Component: TaskPage },
      { path: 'department', Component: DepartmentPage },
      { path: 'channel', Component: ChannelPage },
      { path: 'employee', Component: EmployeePage },
      { path: 'skill', Component: SkillPage },
      { path: 'labor-rule', Component: LaborRulePage },
      { path: 'schedule-version', Component: ScheduleVersionPage },
      { path: 'schedule', Component: ScheduleMatrixPage },
      { path: 'shift-change', Component: ShiftChangePage },
      { path: 'report', Component: ReportPage },
      { path: 'announcement', Component: AnnouncementPage },
      { path: '*', Component: () => <div style={{ textAlign: 'center', padding: 60 }}>页面未找到</div> },
    ],
  },
]);
