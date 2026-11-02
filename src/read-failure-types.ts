export interface ObservedReadHttp {
  status: number;
  scope: "failed-read-operation";
  observedAt: string;
  endpoint?: string;
  limit?: number;
  remaining?: number;
  retryAfterSeconds?: number;
  resetAt?: string;
}
