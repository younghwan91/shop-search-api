import type { Product } from "./shopby.js";

type Fetch = typeof fetch;

/** 디스코드는 메시지 하나에 embed를 10개까지 받는다 */
const MAX_EMBEDS = 10;

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export function productEmbed(p: Product) {
  const price =
    p.discountedPrice < p.price
      ? `~~${won(p.price)}~~ → **${won(p.discountedPrice)}** (${p.discountRate}%)`
      : `**${won(p.price)}**`;
  return {
    title: p.name.slice(0, 256),
    url: p.url,
    description: price,
    color: 0x1f3a93,
    thumbnail: p.imageUrl ? { url: p.imageUrl } : undefined,
    fields: [
      { name: "재고", value: p.soldOut ? "품절" : String(p.stock), inline: true },
      ...(p.registeredAt ? [{ name: "등록", value: p.registeredAt, inline: true }] : []),
    ],
  };
}

export async function notifyDiscord(
  webhookUrl: string,
  heading: string,
  products: Product[],
  fetchImpl: Fetch = fetch,
): Promise<void> {
  for (let i = 0; i < products.length; i += MAX_EMBEDS) {
    const chunk = products.slice(i, i + MAX_EMBEDS);
    const res = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: i === 0 ? heading : undefined,
        embeds: chunk.map(productEmbed),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`discord webhook ${res.status}: ${text.slice(0, 200)}`);
    }
  }
}
