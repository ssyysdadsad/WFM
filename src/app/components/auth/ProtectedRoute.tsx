import React from 'react';
import { Navigate } from 'react-router';
import { Flex, Spin } from 'antd';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';

export function ProtectedRoute({ children }: React.PropsWithChildren) {
  const { loading, currentUser } = useCurrentUser();

  if (loading) {
    return (
      <Flex align="center" justify="center" style={{ minHeight: '100vh' }}>
        <Spin size="large" />
      </Flex>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
