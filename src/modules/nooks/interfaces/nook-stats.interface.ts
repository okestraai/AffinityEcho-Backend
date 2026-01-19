export interface NookStats {
  activeNooks: number;
  anonymousUsers: number;
  messagesToday: number;
  totalNooks: number;
  hotNooks: number;
}

export interface NookStatsResponse {
  success: boolean;
  data: NookStats;
}
