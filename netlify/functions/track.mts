/* POST /api/track  Anonymous visit summary from the site. One record per visit, rewritten as the visit goes on.
   Stores: pages seen, scroll depth, actions, guards and robot topics used, device, language, country, state and city. No name, no IP address. */
import type { Config, Context } from "@netlify/functions";
import { json, bad, store, clean, dayKey, uaLabel, SECTIONS, ACTS, PETS, PET_ACTS, TOPICS } from "../lib/core.mts";

const num = (v: unknown, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(max, Math.round(n))) : 0;
};

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return bad("POST only", 405);
  const text = await req.text();
  if (text.length > 7000) return bad("Too large", 413);
  let b: any;
  try { b = JSON.parse(text); } catch { return bad("Bad JSON"); }
  const sid = clean(b.sid, 24);
  if (!/^[a-z0-9]{10,24}$/.test(sid)) return bad("Bad id");

  const now = Date.now();
  let start = num(b.start, now + 1000) || now;
  if (start > now) start = now;
  if (start < now - 3 * 86400000) start = now - 3 * 86400000;

  const secs = Array.isArray(b.secs) ? [...new Set<string>(b.secs.map((x: unknown) => clean(x, 24)))].filter((x) => SECTIONS.includes(x)) : [];
  const acts: Record<string, number> = {};
  if (b.acts && typeof b.acts === "object") for (const k of ACTS) if (b.acts[k]) acts[k] = num(b.acts[k], 999);
  const tally = (src: any, allowed: string[]) => {
    const o: Record<string, number> = {};
    if (src && typeof src === "object") for (const k of allowed) if (src[k]) o[k] = num(src[k], 999);
    return o;
  };
  const pays = Array.isArray(b.pays)
    ? b.pays.slice(0, 12).map((p: any) => ({ k: p && p.k === "advance" ? "advance" : "tip", a: num(p && p.a, 500000), paid: !!(p && p.paid) }))
    : [];

  const rec = {
    sid,
    day: dayKey(start),
    start,
    last: now,
    dur: num(b.dur, 6 * 3600),
    depth: num(b.depth, 100),
    entered: !!b.entered,
    done: secs.includes("contact"),
    secs,
    lastSec: secs.includes(clean(b.lastSec, 24)) ? clean(b.lastSec, 24) : secs[secs.length - 1] || "",
    acts,
    pets: tally(b.pets, PETS),
    petActs: tally(b.petActs, PET_ACTS),
    topics: tally(b.topics, TOPICS),
    pays,
    profile: clean(b.profile, 24),
    lang: clean(b.lang, 12),
    dev: b.dev === "desktop" ? "desktop" : b.dev === "tablet" ? "tablet" : "mobile",
    ref: clean(b.ref, 60),
    ret: !!b.ret,
    country: context.geo?.country?.code || "",
    city: clean(context.geo?.city || "", 40),
    region: clean((context.geo as any)?.subdivision?.name || "", 40),
    ua: uaLabel(req.headers.get("user-agent") || ""),
  };
  await store("sessions").setJSON(`${rec.day}/${sid}`, rec);
  return json({ ok: true });
};

export const config: Config = {
  path: "/api/track",
  method: "POST",
  rateLimit: { windowLimit: 90, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
