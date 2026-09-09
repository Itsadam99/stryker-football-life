export interface CareerSave { id: string; slot: number; modifiedAt: string; installed: boolean; recoveryPending?: boolean; error?: string }
export interface CareerPreview {
  id: string; hash: string; date: string; title: string; slot: number; installed: boolean;
  teamCount: number; changedBytes: number; automaticCoaches: boolean;
  leagues: Array<{ competitionId: number; name?: string; supported?: boolean; complete?: boolean; matchesPerTeam?: number; matchesPlayedMin?: number; matchesPlayedMax?: number }>;
  teams: Array<{ name: string; coach: string; style: string }>;
}
export interface CareerList { version: string; stage: string; automaticCoaches: boolean; saves: CareerSave[] }
