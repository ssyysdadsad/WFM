import type { Json } from '@/app/types/database';

export type DictType = {
  id: string;
  typeCode: string;
  typeName: string;
  description?: string | null;
  extraConfig?: Json | null;
  sortOrder: number;
  isEnabled: boolean;
};

export type DictItem = {
  id: string;
  dictTypeId: string;
  itemCode: string;
  itemName: string;
  description?: string | null;
  extraConfig?: Json | null;
  sortOrder: number;
  isEnabled: boolean;
};

export type DictTypeFormValues = {
  typeCode: string;
  typeName: string;
  description?: string;
  sortOrder?: number;
  isEnabled?: boolean;
};

export type DictItemFormValues = {
  itemCode: string;
  itemName: string;
  description?: string;
  extraConfig?: Json | null;
  sortOrder?: number;
  isEnabled?: boolean;
};
