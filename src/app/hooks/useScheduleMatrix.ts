import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import dayjs, { type Dayjs } from 'dayjs';
import { getErrorMessage } from '@/app/lib/supabase/errors';
import {
  getScheduleMatrix,
  listScheduleVersionOptions,
  loadScheduleMatrixReferences,
} from '@/app/services/schedule.service';
import type {
  ScheduleCellRecord,
  ScheduleCodeItem,
  ScheduleDepartmentOption,
  ScheduleEmployeeOption,
  ScheduleProjectOption,
  ScheduleVersionOption,
} from '@/app/types/schedule';

export function useScheduleMatrix() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlProjectId = searchParams.get('projectId') || undefined;
  const urlVersionId = searchParams.get('versionId') || undefined;

  const [projects, setProjects] = useState<ScheduleProjectOption[]>([]);
  const [versions, setVersions] = useState<ScheduleVersionOption[]>([]);
  const [departments, setDepartments] = useState<ScheduleDepartmentOption[]>([]);
  const [allEmployees, setAllEmployees] = useState<ScheduleEmployeeOption[]>([]);
  const [codeItems, setCodeItems] = useState<ScheduleCodeItem[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | undefined>();
  const [selectedVersion, setSelectedVersion] = useState<string | undefined>();
  const [selectedMonth, setSelectedMonth] = useState<Dayjs>(dayjs());
  const [selectedDept, setSelectedDept] = useState<string | undefined>();
  const [schedules, setSchedules] = useState<ScheduleCellRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [error, setError] = useState<string>();
  // Track whether URL params have been consumed
  const [urlConsumed, setUrlConsumed] = useState(false);
  // Track explicit user version selection to prevent auto-override
  const explicitVersionRef = useRef<string | null>(null);

  const refreshReferences = useCallback(async (forProjectId?: string) => {
    try {
      const refs = await loadScheduleMatrixReferences(forProjectId);
      setProjects(refs.projects);
      setDepartments(refs.departments);
      setAllEmployees(refs.employees);
      setCodeItems(refs.codeItems);
      // Auto-select project from URL or first available
      if (refs.projects.length > 0) {
        setSelectedProject(prev => {
          if (prev) return prev;
          if (urlProjectId && refs.projects.some(p => p.id === urlProjectId)) return urlProjectId;
          return refs.projects[0].id;
        });
      }
    } catch (loadError) {
      setError(getErrorMessage(loadError, '加载排班矩阵基础数据失败'));
    }
  }, []);

  const refreshVersions = useCallback(async (projectId: string) => {
    const rows = await listScheduleVersionOptions(projectId);
    setVersions(rows);
    return rows;
  }, []);

  const refreshMatrix = useCallback(async () => {
    if (!selectedProject || !selectedVersion) {
      setSchedules([]);
      setDataLoaded(false);
      return;
    }

    setLoading(true);
    setError(undefined);

    try {
      const rows = await getScheduleMatrix({
        projectId: selectedProject,
        scheduleVersionId: selectedVersion,
        scheduleMonth: selectedMonth.startOf('month').format('YYYY-MM-DD'),
        departmentId: selectedDept,
      });
      setSchedules(rows);
      setDataLoaded(true);
    } catch (loadError) {
      setError(getErrorMessage(loadError, '加载排班矩阵失败'));
    } finally {
      setLoading(false);
    }
  }, [selectedDept, selectedMonth, selectedProject, selectedVersion]);

  useEffect(() => {
    refreshReferences();
  }, [refreshReferences]);

  // 项目切换时重新加载项目成员（员工列表）
  useEffect(() => {
    if (selectedProject) {
      loadScheduleMatrixReferences(selectedProject).then(refs => {
        setAllEmployees(refs.employees);
      }).catch(() => {});
    }
  }, [selectedProject]);

  useEffect(() => {
    if (!selectedProject) {
      setVersions([]);
      setSelectedVersion(undefined);
      return;
    }

    refreshVersions(selectedProject)
      .then((rows) => {
        // If URL has a specific versionId, use it and sync its month
        if (!urlConsumed && urlVersionId && rows.some(r => r.id === urlVersionId)) {
          setSelectedVersion(urlVersionId);
          // Lock this version via explicitRef so the upcoming month-change effect won't override it
          explicitVersionRef.current = urlVersionId;
          // Sync month from the matched version
          const matchedVersion = rows.find(r => r.id === urlVersionId);
          if (matchedVersion?.scheduleMonth) {
            const monthValue = dayjs(matchedVersion.scheduleMonth);
            if (monthValue.isValid()) {
              setSelectedMonth(monthValue);
            }
          }
          // Mark URL params as consumed and clean URL
          setUrlConsumed(true);
          setSearchParams({}, { replace: true });
        } else if (explicitVersionRef.current) {
          // User explicitly selected a version (or URL just consumed) - use it and clear the flag
          const explicitId = explicitVersionRef.current;
          explicitVersionRef.current = null;
          if (rows.some(r => r.id === explicitId)) {
            setSelectedVersion(explicitId);
          } else {
            const monthStr = selectedMonth.format('YYYY-MM');
            const matchedVersion = rows.find((item) => item.scheduleMonth?.startsWith(monthStr));
            setSelectedVersion(matchedVersion?.id ?? rows[0]?.id);
          }
        } else {
          // Normal selection: match current month or pick first
          const monthStr = selectedMonth.format('YYYY-MM');
          const matchedVersion = rows.find((item) => item.scheduleMonth?.startsWith(monthStr));
          setSelectedVersion(matchedVersion?.id ?? rows[0]?.id);
        }
      })
      .catch((loadError) => {
        setError(getErrorMessage(loadError, '加载排班版本失败'));
      });
  }, [refreshVersions, selectedMonth, selectedProject]);

  useEffect(() => {
    refreshMatrix();
  }, [refreshMatrix]);

  const handleVersionChange = useCallback(
    (versionId: string) => {
      // Set the explicit ref BEFORE changing month to prevent the effect from overriding
      explicitVersionRef.current = versionId;
      setSelectedVersion(versionId);
      const matchedVersion = versions.find((item) => item.id === versionId);
      if (matchedVersion?.scheduleMonth) {
        const monthValue = dayjs(matchedVersion.scheduleMonth);
        if (monthValue.isValid() && !monthValue.isSame(selectedMonth, 'month')) {
          setSelectedMonth(monthValue);
        }
      }
    },
    [versions, selectedMonth],
  );

  return {
    projects,
    versions,
    departments,
    allEmployees,
    codeItems,
    selectedProject,
    setSelectedProject,
    selectedVersion,
    setSelectedVersion,
    selectedMonth,
    setSelectedMonth,
    selectedDept,
    setSelectedDept,
    schedules,
    setSchedules,
    loading,
    dataLoaded,
    error,
    refreshReferences,
    refreshMatrix,
    handleVersionChange,
  };
}
