export type ScheduleImportMode = 'cover_draft' | 'new_version';

export type ScheduleImportBatchRecord = {
  id: string;
  projectId: string;
  scheduleMonth: string;
  importMode: ScheduleImportMode;
  processingStatus: string;
  sourceFileName?: string | null;
  importedRows: number;
  failedRows: number;
  scheduleVersionId?: string | null;
  createdAt?: string | null;
  completedAt?: string | null;
};

export type ScheduleImportError = {
  rowIndex: number;
  employeeNo?: string;
  employeeName?: string;
  scheduleDate?: string;
  code?: string;
  message: string;
};

export type ScheduleImportResult = {
  success: boolean;
  scheduleVersionId?: string;
  batchId?: string;
  importedRows: number;
  failedRows: number;
  errors: ScheduleImportError[];
  message?: string;
  laborRuleWarnings?: {
    hardViolations: { message: string; ruleName: string }[];
    softViolations: { message: string; ruleName: string }[];
  };
};

export type ScheduleExportResult = {
  fileName: string;
  blob: Blob;
};
