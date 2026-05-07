export interface NookStats {
  activeNooks: number;
  inANookNow: number;
  allTimeNooksCreated: number;
  allTimeNookInteractions: number;
  messagesToday: number;
  hotNooks: number;
  totalMessageParticipants: number;
}

export interface NookStatsResponse {
  success: boolean;
  data: NookStats;
}
