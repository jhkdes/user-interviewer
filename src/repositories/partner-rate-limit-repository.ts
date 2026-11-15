export interface PartnerRateLimitRepository {
  /**
   * Counts one request for a partner in the minute starting at `windowStart`
   * and returns how many requests that minute has now had, itself included.
   * One atomic step, so concurrent requests are all counted.
   */
  hit(partnerId: string, windowStart: Date): Promise<number>;
}
