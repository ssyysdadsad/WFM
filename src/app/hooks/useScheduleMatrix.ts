import { useCallback, useEffect, useState } from 'react';
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

  const refreshReferences = useCallback(async () => {
    try {
      const refs = await loadScheduleMatrixReferences();
      setProjects(refs.projects);
      setDepartments(refs.departments);
      setAllEmployees(refs.employees);
      setCodeItems(refs.codeItems);
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

  useEffect(() => {
    if (!selectedProject) {
      setVersions([]);
      setSelectedVersion(undefined);
      return;
    }

    refreshVersions(selectedProject)
      .then((rows) => {
        const monthStr = selectedMonth.format('YYYY-MM');
        const matchedVersion = rows.find((item) => item.scheduleMonth?.startsWith(monthStr));
        setSelectedVersion(matchedVersion?.id ?? rows[0]?.id);
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
      setSelectedVersion(versionId);
      const matchedVersion = versions.find((item) => item.id === versionId);
      if (matchedVersion?.scheduleMonth) {
        const monthValue = dayjs(matchedVersion.scheduleMonth);
        if (monthValue.isValid()) {
          setSelectedMonth(monthValue);
        }
      }
    },
    [versions],
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
