import { createBrowserRouter } from 'react-router';
import { AuthLayout } from './components/AuthLayout';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { HomePage } from './pages/HomePage';
import { SchedulePage } from './pages/SchedulePage';
import { ApplyPage } from './pages/ApplyPage';
import { AnnouncementPage } from './pages/AnnouncementPage';
import { ProfilePage } from './pages/ProfilePage';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: AuthLayout,
    children: [
      {
        path: 'login',
        Component: LoginPage,
      },
      {
        path: 'change-password',
        Component: ChangePasswordPage,
      },
      {
        path: '/',
        Component: Layout,
        children: [
          { index: true, Component: HomePage },
          { path: 'schedule', Component: SchedulePage },
          { path: 'apply', Component: ApplyPage },
          { path: 'announcement', Component: AnnouncementPage },
          { path: 'profile', Component: ProfilePage },
        ],
      },
    ],
  },
]);
