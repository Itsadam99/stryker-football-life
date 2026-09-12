export interface CareerSave { id: string; slot: number; modifiedAt: string; installed: boolean; recoveryPending?: boolean; error?: string }
export interface CareerPreview {
  id: string; hash: string; date: string; title: string; slot: number; installed: boolean;
  teamCount: number; changedBytes: number; automaticCoaches: boolean;
  coaching: CoachingSummary;
  leagues: Array<{ competitionId: number; name?: string; supported?: boolean; complete?: boolean; matchesPerTeam?: number; matchesPlayedMin?: number; matchesPlayedMax?: number }>;
  teams: Array<{ name: string; coach: string; style: string }>;
}
export interface CoachingSummary {
  tracked: boolean; error?: string; initializedAt?: string; observedAt?: string; needsRefresh?: boolean;
  clubs?: number; leagues?: number; fictionalCoaches?: number;
  seasonPlan?: { ready: boolean; completedLeagues: number; totalLeagues: number; date?: string; error?: string; changes: Array<{ team: string; coach: string; formations: string[] }> };
  reserve?: Array<{ id: string; name: string; kind: string; age: number | null; formations: string[] }>;
  completed?: Array<{ id: string; name: string; date: string; cycle: number }>;
  teams?: Array<{ id: string; name: string; coach: string; kind: string; contractEnd: string; age: number | null; formations: string[]; expectedPointsPerGame: number }>;
}
export interface CareerList { version: string; stage: string; automaticCoaches: boolean; saves: CareerSave[] }
