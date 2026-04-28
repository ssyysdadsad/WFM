export type ScheduleVersionRecord = {
  id: string;
  projectId: string;
  scheduleMonth: string;
  versionNo: number;
  publishStatusDictItemId?: string | null;
  generationType: 'manual' | 'template' | 'excel' | 'shift_change';
  createdByUserAccountId?: string | null;
  publishedAt?: string | null;
  publishedByUserAccountId?: string | null;
  remark?: string | null;
  isActive?: boolean;
  status?: 'draft' | 'active' | 'archived';
  parentVersionId?: string | null;
};

export type ScheduleVersionFormValues = {
  projectId: string;
  scheduleMonth: string;
  versionNo: number;
  generationType: 'manual' | 'template' | 'excel' | 'shift_change';
  publishStatusDictItemId?: string | null;
  remark?: string | null;
};

export type SchedulePublishPayload = {
  scheduleVersionId: string;
  operatorUserAccountId: string;
  createAnnouncement?: boolean;
  announcementTitle?: string;
};
