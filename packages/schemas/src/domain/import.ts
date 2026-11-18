export type ImportKind = 'patients' | 'doctors' | 'appointments';

export interface ImportRowResult {
  row: number;
  status: 'IMPORTED' | 'FIXED' | 'REJECTED' | 'DUPLICATE';
  messages: string[];
  data?: Record<string, unknown>;
}

export interface ImportReport {
  id: string;
  kind: ImportKind;
  fileName: string;
  dryRun: boolean;
  total: number;
  imported: number;
  fixed: number;
  rejected: number;
  duplicates: number;
  rows: ImportRowResult[];
  createdAt: string;
}
