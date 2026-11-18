export type SpinSource = 'manual' | 'voice' | 'generated' | 'imported';

export interface Spin {
  id: number;
  pocket: number;
  createdAt: string;
  source: SpinSource;
  sessionId: string;
  corrected?: boolean;
}

export type SpinDraft = Omit<Spin, 'id'>;

export interface StatRow {
  label: string;
  count: number;
  expected: number;
  probability: number;
}

export interface StatDistribution {
  name: string;
  rows: StatRow[];
  eligible: boolean;
  chiSquare: number | null;
  critical95: number | null;
  degreesOfFreedom: number;
  sampleSize: number;
}
