import { normalizeHttpUrl, type Product } from "./shopby.js";

type Fetch = typeof fetch;

/** 디스코드 embed 한도 — https://discord.com/developers/docs/resources/message#embed-object-embed-limits */
export const DISCORD_LIMITS = {
  embedsPerMessage: 10,
  title: 256,
  description: 4096,
  fields: 25,
  fieldName: 256,
  fieldValue: 1024,
  /** 메시지 하나의 모든 embed에 든 title·description·field name·value·footer·author 글자 합 */
  totalChars: 6000,
  content: 2000,
} as const;

export interface DiscordEmbed {
  title?: string;
  url?: string;
  description?: string;
  color?: number;
  thumbnail?: { url: string };
  fields?: { name: string; value: string; inline?: boolean }[];
}

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

/** 디스코드가 받는 URL: http(s), 공백·비ASCII 없이 퍼센트 인코딩된 것. 아니면 undefined */
export const embedUrl = (raw: string | null | undefined) => (raw ? (normalizeHttpUrl(raw) ?? undefined) : undefined);

export function productEmbed(p: Product): DiscordEmbed {
  const price =
    p.discountedPrice < p.price
      ? `~~${won(p.price)}~~ → **${won(p.discountedPrice)}** (${p.discountRate}%)`
      : `**${won(p.price)}**`;
  const thumbnail = embedUrl(p.imageUrl);
  return {
    title: clip(p.name.trim() || `상품 ${p.id}`, DISCORD_LIMITS.title),
    url: embedUrl(p.url),
    description: clip(price, DISCORD_LIMITS.description),
    color: 0x1f3a93,
    thumbnail: thumbnail ? { url: thumbnail } : undefined,
    fields: [
      { name: "재고", value: p.soldOut ? "품절" : String(p.stock), inline: true },
      ...(p.registeredAt?.trim() ? [{ name: "등록", value: clip(p.registeredAt, DISCORD_LIMITS.fieldValue), inline: true }] : []),
    ],
  };
}

const isEmbedUrl = (u: string) => /^https?:\/\/[\x21-\x7e]+$/.test(u) && embedUrl(u) === u;

/** 디스코드 한도를 어기는 곳을 사람이 읽을 문장으로 돌려준다. 빈 배열이면 통과 */
export function embedProblems(embeds: DiscordEmbed[], content?: string): string[] {
  const L = DISCORD_LIMITS;
  const out: string[] = [];
  if (embeds.length > L.embedsPerMessage) out.push(`embeds: ${embeds.length} > ${L.embedsPerMessage}`);
  if (content !== undefined && content.length > L.content) out.push(`content: ${content.length} > ${L.content}`);
  let total = 0;
  embeds.forEach((e, i) => {
    const at = `embeds[${i}]`;
    if (e.title !== undefined) {
      if (!e.title.trim()) out.push(`${at}.title is empty`);
      if (e.title.length > L.title) out.push(`${at}.title: ${e.title.length} > ${L.title}`);
      total += e.title.length;
    }
    if (e.description !== undefined) {
      if (!e.description.trim()) out.push(`${at}.description is empty`);
      if (e.description.length > L.description) out.push(`${at}.description: ${e.description.length} > ${L.description}`);
      total += e.description.length;
    }
    if (e.url !== undefined && !isEmbedUrl(e.url)) out.push(`${at}.url is not a valid encoded http(s) URL: ${e.url}`);
    if (e.thumbnail !== undefined && !isEmbedUrl(e.thumbnail.url))
      out.push(`${at}.thumbnail.url is not a valid encoded http(s) URL: ${e.thumbnail.url}`);
    if (e.color !== undefined && !(Number.isInteger(e.color) && e.color >= 0 && e.color <= 0xffffff))
      out.push(`${at}.color out of range: ${e.color}`);
    const fields = e.fields ?? [];
    if (fields.length > L.fields) out.push(`${at}.fields: ${fields.length} > ${L.fields}`);
    fields.forEach((f, j) => {
      if (!f.name.trim()) out.push(`${at}.fields[${j}].name is empty`);
      if (!f.value.trim()) out.push(`${at}.fields[${j}].value is empty`);
      if (f.name.length > L.fieldName) out.push(`${at}.fields[${j}].name: ${f.name.length} > ${L.fieldName}`);
      if (f.value.length > L.fieldValue) out.push(`${at}.fields[${j}].value: ${f.value.length} > ${L.fieldValue}`);
      total += f.name.length + f.value.length;
    });
  });
  if (total > L.totalChars) out.push(`embed text total: ${total} > ${L.totalChars}`);
  return out;
}

export async function notifyDiscord(
  webhookUrl: string,
  heading: string,
  products: Product[],
  fetchImpl: Fetch = fetch,
): Promise<void> {
  for (let i = 0; i < products.length; i += DISCORD_LIMITS.embedsPerMessage) {
    const chunk = products.slice(i, i + DISCORD_LIMITS.embedsPerMessage);
    const content = i === 0 ? heading : undefined;
    const embeds = chunk.map(productEmbed);
    // 디스코드는 400과 함께 위치만 알려준다({"embeds":["0"]}). 보내기 전에 어디가 틀렸는지 남긴다.
    const problems = embedProblems(embeds, content);
    if (problems.length > 0) throw new Error(`discord payload invalid: ${problems.join("; ").slice(0, 500)}`);
    const res = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, embeds }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`discord webhook ${res.status}: ${text.slice(0, 200)}`);
    }
  }
}
