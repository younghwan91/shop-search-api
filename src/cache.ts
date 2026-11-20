/** 아주 단순한 TTL 캐시. 같은 키의 동시 요청은 하나의 업스트림 호출을 공유한다. */
export class TtlCache<T> {
  private store = new Map<string, { expires: number; value: Promise<T> }>();

  constructor(
    private ttlMs: number,
    private maxEntries = 500,
    private now: () => number = Date.now,
  ) {}

  get(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.store.get(key);
    if (hit && hit.expires > this.now()) return hit.value;

    const value = load();
    // 실패한 응답은 캐시하지 않는다
    value.catch(() => this.store.delete(key));
    this.store.set(key, { expires: this.now() + this.ttlMs, value });
    this.evict();
    return value;
  }

  private evict() {
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }
}
