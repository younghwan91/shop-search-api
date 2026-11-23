import { UpstreamError } from "../shopby.js";

/** 비공식 연동이라 브라우저와 같은 형태의 고정 User-Agent 하나만 쓴다(위장 회전 같은 건 하지 않는다). */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export async function fetchJson<T>(url: URL, headers: Record<string, string>, fetchImpl: typeof fetch = fetch): Promise<T> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT, ...headers },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new UpstreamError(504, `upstream request failed: ${(err as Error).message}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new UpstreamError(502, `upstream ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}
