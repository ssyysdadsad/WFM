import { useMemo } from 'react';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';

function normalizeModuleCode(moduleCode: string) {
  return moduleCode.replace(/-/g, '_');
}

export function usePermission() {
  const { currentUser } = useCurrentUser();

  return useMemo(() => {
    const permissions = currentUser?.permissions ?? [];
    const isAdmin = currentUser?.isAdmin ?? false;

    const hasPermission = (moduleCode: string, actionCode = 'read') => {
      if (isAdmin) {
        return true;
      }

      const normalizedModuleCode = normalizeModuleCode(moduleCode);
      return permissions.some(
        (permission) =>
          normalizeModuleCode(permission.moduleCode) === normalizedModuleCode &&
          (permission.actionCode === actionCode || permission.actionCode === 'manage'),
      );
    };

    const hasModuleAccess = (moduleCode: string) => hasPermission(moduleCode, 'read');

    return {
      isAdmin,
      hasPermission,
      hasModuleAccess,
    };
  }, [currentUser, currentUser?.permissions]);
}
