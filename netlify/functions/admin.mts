/* /api/admin/*  Everything the owner can do. Every route needs the login cookie.
   me, logout, stats, pledges, ledger, leads, network, coinbuys, content, upload, export */
import type { Config, Context } from "@netlify/functions";
import { json, bad, store, isAdmin, clean, rid, dayKey, clearCookie, AGE_BANDS, GENDERS, MANUAL_KINDS, PLATFORMS } from "../lib/core.mts";

const LISTS = ["reels", "topPicks", "photos", "certificates", "poems", "tutor", "prices"];
const DAY = 86400000;

async function readAll(name: "pledges" | "ledger" | "leads" | "network") {
  const s = store(name);
  const { blobs } = await s.list();
  const out: any[] = [];
  for (let i = 0; i < blobs.length; i += 25) {
    const part = await Promise.all(blobs.slice(i, i + 25).map((b) => s.get(b.key, { type: "json" })));
    out.push(...part.filter(Boolean));
  }
  return out;
}

async function stats(days: number) {
  const s = store("sessions");
  const now = Date.now();
  const keys: string[] = [];
  for (let d = 0; d < days; d++) {
    const { blobs } = await s.list({ prefix: dayKey(now - d * DAY) + "/" });
    keys.push(...blobs.map((b) => b.key));
    if (keys.length > 3000) break;
  }
  const rows: any[] = [];
  for (let i = 0; i < keys.length; i += 30) {
    const part = await Promise.all(keys.slice(i, i + 30).map((k) => s.get(k, { type: "json" })));
    rows.push(...part.filter(Boolean));
  }
  const entered = rows.filter((r) => r.entered);
  const count = (get: (r: any) => string) => {
    const m: Record<string, number> = {};
    for (const r of rows) { const k = get(r); if (k) m[k] = (m[k] || 0) + 1; }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => ({ k, n }));
  };
  const perDay: Record<string, number> = {};
  for (let d = days - 1; d >= 0; d--) perDay[dayKey(now - d * DAY)] = 0;
  for (const r of rows) if (r.day in perDay) perDay[r.day]++;
  const secCount: Record<string, number> = {};
  const lastCount: Record<string, number> = {};
  const acts: Record<string, number> = {};
  const pets: Record<string, number> = {}, petActs: Record<string, number> = {}, topics: Record<string, number> = {};
  let petUsers = 0, robotUsers = 0, robotAsks = 0;
  let dur = 0, depth = 0, pay = { tip: 0, advance: 0, tipAmt: 0, advAmt: 0, paid: 0 };
  for (const r of rows) {
    for (const k of r.secs || []) secCount[k] = (secCount[k] || 0) + 1;
    if (!r.done && r.lastSec) lastCount[r.lastSec] = (lastCount[r.lastSec] || 0) + 1;
    for (const [k, n] of Object.entries(r.acts || {})) acts[k] = (acts[k] || 0) + (n as number);
    if (Object.keys(r.pets || {}).length) petUsers++;
    if ((r.acts?.chat || 0) > 0) { robotUsers++; robotAsks += r.acts.chat; }
    for (const [k, n] of Object.entries(r.pets || {})) pets[k] = (pets[k] || 0) + (n as number);
    for (const [k, n] of Object.entries(r.petActs || {})) petActs[k] = (petActs[k] || 0) + (n as number);
    for (const [k, n] of Object.entries(r.topics || {})) topics[k] = (topics[k] || 0) + (n as number);
    dur += r.dur || 0; depth += r.depth || 0;
    for (const p of r.pays || []) {
      if (p.k === "advance") { pay.advance++; pay.advAmt += p.a; } else { pay.tip++; pay.tipAmt += p.a; }
      if (p.paid) pay.paid++;
    }
  }
  const n = rows.length || 1;
  const done = rows.filter((r) => r.done).length;
  const msgs = rows.filter((r) => (r.acts?.chat || 0) > 0 || (r.acts?.wa || 0) > 0).length;
  return {
    days,
    total: rows.length,
    entered: entered.length,
    returning: rows.filter((r) => r.ret).length,
    finished: done,
    leftEarly: rows.length - done,
    avgDur: Math.round(dur / n),
    avgDepth: Math.round(depth / n),
    messagers: msgs,
    perDay: Object.entries(perDay).map(([day, n]) => ({ day, n })),
    sections: Object.entries(secCount).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n })),
    lastSeen: Object.entries(lastCount).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n })),
    acts,
    pay,
    devices: count((r) => r.dev),
    countries: count((r) => r.country),
    cities: count((r) => r.city),
    regions: count((r) => (r.region ? `${r.region}${r.country ? ", " + r.country : ""}` : "")),
    pets: Object.entries(pets).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n })),
    petActs: Object.entries(petActs).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n })),
    topics: Object.entries(topics).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n })),
    petUsers, robotUsers, robotAsks,
    langs: count((r) => r.lang),
    refs: count((r) => r.ref || "Direct"),
    browsers: count((r) => r.ua),
    profiles: count((r) => r.profile),
    recent: rows.sort((a, b) => b.last - a.last).slice(0, 40).map((r) => ({
      last: r.last, dur: r.dur, depth: r.depth, done: r.done, secs: (r.secs || []).length, lastSec: r.lastSec,
      dev: r.dev, country: r.country, region: r.region, city: r.city, ua: r.ua, acts: r.acts, ref: r.ref,
    })),
  };
}

function cleanContent(c: any) {
  const out: any = { v: 1, updated: new Date().toISOString() };
  const str = (v: unknown, m: number) => clean(v, m);
  for (const k of LISTS) {
    if (Array.isArray(c?.lists?.[k])) {
      out.lists = out.lists || {};
      out.lists[k] = c.lists[k].slice(0, 80).map((it: any) => {
        const o: any = {};
        for (const [f, v] of Object.entries(it || {})) {
          if (Array.isArray(v)) o[f] = v.slice(0, 12).map((x) => str(x, 40));
          else if (typeof v === "string") o[f] = str(v, /^body(_(ta|kn|hi|te))?$/.test(f) ? 4000 : 400);
        }
        return o;
      });
    }
  }
  out.daily = (Array.isArray(c?.daily) ? c.daily : []).slice(0, 40).map((d: any) => ({
    id: str(d.id, 20) || rid(3), date: str(d.date, 10), text: str(d.text, 280), link: str(d.link, 300),
  })).filter((d: any) => d.text);
  const h = c?.help || {};
  out.help = {
    on: h.on !== false,
    title: str(h.title, 80), intro: str(h.intro, 600), note: str(h.note, 400),
    dropMode: ["hidden", "after", "public"].includes(h.dropMode) ? h.dropMode : "hidden",
    address: str(h.address, 300), hours: str(h.hours, 80),
    needs: (Array.isArray(h.needs) ? h.needs : []).slice(0, 20).map((n: any) => ({
      id: str(n.id, 20) || rid(3),
      kind: ["books", "toys", "food", "clothes", "other"].includes(n.kind) ? n.kind : "other",
      title: str(n.title, 80), note: str(n.note, 240),
      have: Math.max(0, Math.min(99999, Number(n.have) || 0)), need: Math.max(0, Math.min(99999, Number(n.need) || 0)),
    })).filter((n: any) => n.title),
    stories: (Array.isArray(h.stories) ? h.stories : []).slice(0, 20).map((s: any) => ({
      id: str(s.id, 20) || rid(3), date: str(s.date, 10), text: str(s.text, 400),
    })).filter((s: any) => s.text),
  };
  out.availability = str(c?.availability, 120);

  // Social links. Only web links are kept.
  const url = (v: unknown) => { const u = str(v, 300); return /^https?:\/\//i.test(u) ? u : ""; };
  if (Array.isArray(c?.socials)) {
    out.socials = c.socials.slice(0, 24).map((x: any) => ({
      label: str(x?.label, 30), handle: str(x?.handle, 60), url: url(x?.url), count: str(x?.count, 20),
    })).filter((x: any) => x.label && (x.url || x.handle));
  }
  // Words: the letter-style text on the site.
  if (c?.words && typeof c.words === "object") {
    const w = c.words;
    out.words = {
      tagline: str(w.tagline, 160), summary: str(w.summary, 900), thanks: str(w.thanks, 400),
      about: (Array.isArray(w.about) ? w.about : []).slice(0, 6).map((t: unknown) => str(t, 600)).filter(Boolean),
    };
  }
  if (Array.isArray(c?.stories)) {
    out.stories = c.stories.slice(0, 12).map((x: any) => {
      const o: any = { title: str(x?.title, 120), kicker: str(x?.kicker, 80), art: str(x?.art, 300), note: str(x?.note, 400), body: str(x?.body, 60000) };
      // The owner's own Tamil, Kannada, Hindi and Telugu text for the same story.
      for (const l of ["ta", "kn", "hi", "te"]) {
        if (typeof x?.["title_" + l] === "string") o["title_" + l] = str(x["title_" + l], 160);
        if (typeof x?.["kicker_" + l] === "string") o["kicker_" + l] = str(x["kicker_" + l], 120);
        if (typeof x?.["note_" + l] === "string") o["note_" + l] = str(x["note_" + l], 600);
        if (typeof x?.["body_" + l] === "string") o["body_" + l] = str(x["body_" + l], 60000);
      }
      return o;
    }).filter((x: any) => x.title && x.body);
  }
  if (c?.collab && typeof c.collab === "object") {
    const k = c.collab;
    out.collab = {
      on: k.on !== false, title: str(k.title, 80), intro: str(k.intro, 500), note: str(k.note, 300),
      items: (Array.isArray(k.items) ? k.items : []).slice(0, 12).map((x: any) => ({ id: str(x?.id, 20) || rid(3), title: str(x?.title, 80), note: str(x?.note, 240) })).filter((x: any) => x.title),
    };
  }
  if (c?.forms && typeof c.forms === "object") {
    const f = c.forms;
    out.forms = { bioAsk: f.bioAsk !== false, hireAsk: f.hireAsk !== false, shareAsk: f.shareAsk !== false, robotAsk: f.robotAsk !== false, bioRequire: f.bioRequire !== false, hireRequire: f.hireRequire !== false };
  }
  // Look and feel, effects, voice, music and pets (v37). Everything is checked here again, so a bad save can never put odd values on the site.
  const hex = (v: unknown) => { const x = String(v || "").trim(); return /^#[0-9a-fA-F]{6}$/.test(x) ? x.toLowerCase() : ""; };
  const num = (v: unknown, lo: number, hi: number, def: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
  const media = (v: unknown, exts: string) => {
    const u = str(v, 300);
    return new RegExp("^/api/media/[a-z0-9-]{6,60}\\.(" + exts + ")$").test(u) || /^https:\/\/[^\s"'<>]{4,290}$/i.test(u) ? u : "";
  };
  if (c?.theme && typeof c.theme === "object") {
    const t = c.theme, o: any = {};
    for (const k of ["accent", "bg", "text"]) if (hex(t[k])) o[k] = hex(t[k]);
    if (["clean", "serif", "rounded", "mono"].includes(t.font)) o.font = t.font;
    if (t.radius !== undefined && t.radius !== "" && t.radius !== null) o.radius = Math.round(num(t.radius, 0, 32, 12));
    if (["flat", "glass", "outline"].includes(t.card)) o.card = t.card;
    if (str(t.title, 24)) o.title = str(t.title, 24);
    if (t.heroDim !== undefined && t.heroDim !== "" && t.heroDim !== null) o.heroDim = Math.round(num(t.heroDim, 0, 80, 0));
    out.theme = o;
  }
  if (c?.effects && typeof c.effects === "object") {
    const e = c.effects, o: any = {};
    for (const k of ["snow", "sparkles", "hearts", "grain"]) if (e[k] === true) o[k] = true;
    if (e.intensity !== undefined) o.intensity = Math.round(num(e.intensity, 1, 5, 3));
    if (e.animations === false) o.animations = false;
    out.effects = o;
  }
  if (c?.voice && typeof c.voice === "object") {
    const v = c.voice;
    out.voice = {
      pitch: num(v.pitch, 0.5, 2, 1.25), rate: num(v.rate, 0.5, 1.6, 1.04),
      lang: /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(String(v.lang || "")) ? String(v.lang) : "", hint: str(v.hint, 40),
      robot: v.robot !== false, pets: v.pets !== false, clicks: v.clicks !== false,
    };
  }
  if (c?.music && typeof c.music === "object") {
    const m = c.music;
    out.music = {
      on: m.on !== false, volume: Math.round(num(m.volume, 0, 1, 0.6) * 100) / 100,
      tracks: (Array.isArray(m.tracks) ? m.tracks : []).slice(0, 12).map((x: any) => ({ title: str(x?.title, 60) || "Track", url: media(x?.url, "mp3|m4a|aac|ogg|wav|weba") })).filter((x: any) => x.url),
    };
  }
  if (c?.pets && typeof c.pets === "object") {
    const p = c.pets, built = ["lion", "dragon", "turtle", "husky"];
    out.pets = {
      off: (Array.isArray(p.off) ? p.off : []).filter((x: unknown, i: number, a: unknown[]) => built.includes(String(x)) && a.indexOf(x) === i).slice(0, 4),
      custom: (Array.isArray(p.custom) ? p.custom : []).slice(0, 8).map((x: any) => ({
        id: str(x?.id, 20).replace(/[^a-z0-9-]/gi, "") || rid(3), name: str(x?.name, 24), img: media(x?.img, "png|jpg|webp"), hello: str(x?.hello, 80),
        voice: ["deep", "high", "slow", "fast"].includes(x?.voice) ? x.voice : "deep",
      })).filter((x: any) => x.name),
    };
  }
  // Translations the owner changed. Each language maps an English phrase to its replacement.
  if (c?.i18n && typeof c.i18n === "object") {
    out.i18n = {};
    for (const lang of ["ta", "kn", "hi", "te"]) {
      const src = c.i18n[lang];
      if (!src || typeof src !== "object") continue;
      const o: Record<string, string> = {};
      for (const [en, tx] of Object.entries(src).slice(0, 600)) {
        const k = str(en, 300), v = str(tx, 500);
        if (k && v) o[k] = v;
      }
      out.i18n[lang] = o;
    }
  }
  return out;
}

export default async (req: Request, context: Context) => {
  if (!isAdmin(req)) return bad("Please sign in.", 401);
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/admin\/?/, "").split("/").filter(Boolean);
  const [route, arg] = parts;
  const m = req.method;

  if (route === "me") return json({ ok: true });
  if (route === "logout") return json({ ok: true }, 200, { "set-cookie": clearCookie() });

  if (route === "stats" && m === "GET") {
    const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days")) || 30));
    return json({ ok: true, stats: await stats(days) });
  }

  if (route === "pledges") {
    if (m === "GET") {
      const all = await readAll("pledges");
      return json({ ok: true, pledges: all.sort((a, b) => b.at - a.at) });
    }
    if (!arg || !/^[0-9]+-[a-f0-9]+$/.test(arg)) return bad("Bad id");
    const s = store("pledges");
    if (m === "DELETE") { await s.delete(arg); return json({ ok: true }); }
    if (m === "PATCH") {
      const cur: any = await s.get(arg, { type: "json" });
      if (!cur) return bad("Not found", 404);
      const b: any = await req.json().catch(() => ({}));
      if (["new", "contacted", "received", "declined"].includes(b.status)) cur.status = b.status;
      if (typeof b.ownerNote === "string") cur.ownerNote = clean(b.ownerNote, 400);
      await s.setJSON(arg, cur);
      return json({ ok: true, pledge: cur });
    }
  }

  if (route === "ledger") {
    if (m === "GET") {
      const all = await readAll("ledger");
      return json({ ok: true, ledger: all.sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id)) });
    }
    const s = store("ledger");
    if (m === "POST") {
      const b: any = await req.json().catch(() => ({}));
      const amount = Math.round(Number(b.amount) * 100) / 100;
      if (!(amount > 0) || amount > 10000000) return bad("Enter an amount above zero.");
      const kind = ["advance", "tip", "tutor", "other", "charity"].includes(b.kind) ? b.kind : "other";
      const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : dayKey(Date.now());
      const id = `${date}-${rid(3)}`;
      const rec = { id, date, kind, amount, from: clean(b.from, 60), note: clean(b.note, 200) };
      await s.setJSON(id, rec);
      return json({ ok: true, entry: rec });
    }
    if (m === "DELETE" && arg && /^[0-9-]+-[a-f0-9]+$/.test(arg)) { await s.delete(arg); return json({ ok: true }); }
  }

  if (route === "leads") {
    const s = store("leads");
    if (m === "GET") {
      const all = await readAll("leads");
      return json({ ok: true, leads: all.sort((a, b) => b.at - a.at).slice(0, 3000) });
    }
    if (m === "POST") {
      // Someone who followed, subscribed or messaged on social media, added by hand.
      const b: any = await req.json().catch(() => ({}));
      const kind = MANUAL_KINDS.includes(b.kind) ? b.kind : "follow";
      const platform = PLATFORMS.includes(b.platform) ? b.platform : "Other";
      const age = AGE_BANDS.includes(b.age) ? b.age : "";
      const gender = GENDERS.includes(b.gender) ? b.gender : "";
      const at = Date.now(), id = `${at}-${rid(3)}`;
      const rec = {
        id, at, status: "new", via: "manual", kind, platform, interests: [],
        name: clean(b.name, 60), phone: clean(b.phone, 20).replace(/[^0-9+\- ]/g, ""), email: clean(b.email, 80), tg: clean(b.tg, 40).replace(/^@/, ""),
        age, gender, note: clean(b.note, 500), consent: true, minor: age === "u18",
        country: clean(b.country, 2).toUpperCase(), state: clean(b.state, 40), geoCity: "", city: clean(b.city, 60), district: clean(b.district, 60),
        sid: "", did: null, ownerNote: "",
      };
      if (!rec.name && !rec.country && !rec.state && !rec.city) return bad("Add a name or a place so this entry means something.");
      await s.setJSON(id, rec);
      return json({ ok: true, lead: rec });
    }
    if (!arg || !/^[0-9]+-[a-f0-9]+$/.test(arg)) return bad("Bad id");
    if (m === "DELETE") { await s.delete(arg); return json({ ok: true }); }
    if (m === "PATCH") {
      const cur: any = await s.get(arg, { type: "json" });
      if (!cur) return bad("Not found", 404);
      const b: any = await req.json().catch(() => ({}));
      if (["new", "contacted", "done"].includes(b.status)) cur.status = b.status;
      if (typeof b.ownerNote === "string") cur.ownerNote = clean(b.ownerNote, 400);
      await s.setJSON(arg, cur);
      return json({ ok: true, lead: cur });
    }
  }

  if (route === "coinbuys") {
    // Pet-room coin purchases paid by UPI. The owner confirms each one after seeing the payment in his own UPI app.
    const s = store("coinbuys");
    if (m === "GET") {
      const { blobs } = await s.list({ prefix: "c-" });
      const rows: any[] = [];
      for (let i = 0; i < blobs.length; i += 25) rows.push(...(await Promise.all(blobs.slice(i, i + 25).map((x) => s.get(x.key, { type: "json" })))).filter(Boolean));
      return json({ ok: true, buys: rows.sort((a, b) => b.at - a.at).slice(0, 500) });
    }
    if (m === "PATCH" && arg && /^[a-f0-9]{16}\.[0-9]+-[a-f0-9]+$/.test(arg)) {
      const cur: any = await s.get(`c-${arg}`, { type: "json" });
      if (!cur) return bad("Not found", 404);
      const b: any = await req.json().catch(() => ({}));
      if (b.status === "approved" && cur.status === "pending") {
        cur.status = "approved"; cur.approvedAt = Date.now();
        // it also counts as money received, so the Money tab adds up
        const date = dayKey(Date.now()), lid = `${date}-${rid(3)}`;
        await store("ledger").setJSON(lid, { id: lid, date, kind: "other", amount: cur.amount, from: "Pet coins (UPI)", note: `Ref ${cur.ref}` });
        cur.ledgerId = lid;
      } else if (b.status === "rejected" && cur.status === "pending") cur.status = "rejected";
      if (typeof b.ownerNote === "string") cur.ownerNote = clean(b.ownerNote, 300);
      await s.setJSON(`c-${arg}`, cur);
      return json({ ok: true, buy: cur });
    }
  }

  if (route === "network") {
    // Follower counts the owner reads from each app and types in. The apps do not share these automatically.
    const s = store("network");
    if (m === "GET") {
      const all = await readAll("network");
      return json({ ok: true, network: all.sort((a, b) => (b.date + String(b.at || 0).padStart(14, "0")).localeCompare(a.date + String(a.at || 0).padStart(14, "0"))) });
    }
    if (m === "POST") {
      const b: any = await req.json().catch(() => ({}));
      const platform = PLATFORMS.includes(b.platform) ? b.platform : clean(b.platform, 30) || "Other";
      const followers = Math.round(Number(b.followers));
      if (!(followers >= 0) || followers > 2000000000) return bad("Enter the number of followers.");
      const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : dayKey(Date.now());
      const id = `${date}-${rid(3)}`;
      const rec = { id, date, at: Date.now(), platform, followers, messages: Math.max(0, Math.min(1000000, Math.round(Number(b.messages)) || 0)), note: clean(b.note, 160) };
      await s.setJSON(id, rec);
      return json({ ok: true, entry: rec });
    }
    if (m === "DELETE" && arg && /^[0-9-]+-[a-f0-9]+$/.test(arg)) { await s.delete(arg); return json({ ok: true }); }
  }

  if (route === "content") {
    const s = store("site");
    if (m === "GET") return json({ ok: true, content: (await s.get("content", { type: "json" })) || null });
    if (m === "PUT") {
      const text = await req.text();
      if (text.length > 900000) return bad("That is too much content for one save.", 413);
      let b: any;
      try { b = JSON.parse(text); } catch { return bad("Bad JSON"); }
      const c = cleanContent(b);
      await s.setJSON("content", c);
      return json({ ok: true, content: c });
    }
  }

  if (route === "upload" && m === "POST") {
    const type = (req.headers.get("content-type") || "").split(";")[0];
    const img = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" } as Record<string, string>)[type];
    const aud = ({ "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/m4a": "m4a", "audio/aac": "aac", "audio/ogg": "ogg", "audio/wav": "wav", "audio/x-wav": "wav", "audio/webm": "weba" } as Record<string, string>)[type];
    const ext = img || aud;
    if (!ext) return bad("Please upload a JPG, PNG, WebP or GIF picture, or an MP3, M4A, AAC, OGG or WAV song.");
    const data = await req.arrayBuffer();
    // A song may be bigger than a picture, but a function can only receive about 6 MB in one request.
    if (aud ? data.byteLength > 5 * 1024 * 1024 : data.byteLength > 4 * 1024 * 1024) return bad(aud ? "That song is over 5 MB. Choose a shorter one, or save it as a smaller MP3." : "That picture is over 4 MB. Choose a smaller one.", 413);
    const key = `${Date.now().toString(36)}-${rid(4)}.${ext}`;
    await store("media").set(key, data, { metadata: { type } });
    return json({ ok: true, url: `/api/media/${key}` });
  }

  if (route === "export" && m === "GET") {
    return json({
      ok: true, at: new Date().toISOString(),
      content: await store("site").get("content", { type: "json" }),
      pledges: await readAll("pledges"), ledger: await readAll("ledger"),
      leads: await readAll("leads"), network: await readAll("network"),
      coinbuys: await (async () => { const cs = store("coinbuys"), { blobs } = await cs.list({ prefix: "c-" }); return (await Promise.all(blobs.map((x) => cs.get(x.key, { type: "json" })))).filter(Boolean); })(),
    });
  }
  return bad("Not found", 404);
};

export const config: Config = {
  path: ["/api/admin/*"],
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
