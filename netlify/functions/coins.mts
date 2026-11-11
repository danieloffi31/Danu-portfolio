/* /api/coins  Buying pet-room coins with real money, by UPI.
   The website never touches the money. The visitor pays Danu Sir's UPI ID in their own UPI app, then sends the payment reference here.
   Danu Sir checks it in his UPI app and approves it in the admin page. Only then can the visitor's device collect the coins, once.
   GET  /api/coins?cid=...         the purchases of one device (a random id kept in that browser)
   POST /api/coins                 { cid, pack, ref, adult }  start a purchase (waits for approval)
   POST /api/coins/claim           { cid, id }                collect approved coins, one time only */
import type { Config } from "@netlify/functions";
import { json, bad, store, clean, rid, COIN_PACKS } from "../lib/core.mts";

const CID = /^[a-f0-9]{16}$/;
const mine = (r: any) => ({ id: r.id, at: r.at, amount: r.amount, coins: r.coins, status: r.status, claimed: !!r.claimed });

export default async (req: Request) => {
  const url = new URL(req.url);
  const s = store("coinbuys");

  if (req.method === "GET") {
    const cid = clean(url.searchParams.get("cid"), 20);
    if (!CID.test(cid)) return bad("Bad device id");
    const { blobs } = await s.list({ prefix: `c-${cid}.` });
    const rows = (await Promise.all(blobs.slice(0, 50).map((b) => s.get(b.key, { type: "json" })))).filter(Boolean) as any[];
    return json({ ok: true, buys: rows.sort((a, b) => b.at - a.at).map(mine) });
  }
  if (req.method !== "POST") return bad("GET or POST only", 405);

  const text = await req.text();
  if (text.length > 1500) return bad("Too large", 413);
  let b: any;
  try { b = JSON.parse(text); } catch { return bad("Bad JSON"); }
  const cid = clean(b.cid, 20);
  if (!CID.test(cid)) return bad("Bad device id");

  if (url.pathname.endsWith("/claim")) {
    const id = clean(b.id, 60);
    if (!id.startsWith(cid + ".") || !/^[a-f0-9.\-]+$/.test(id)) return bad("Bad id");
    const rec: any = await s.get(`c-${id}`, { type: "json" });
    if (!rec) return bad("Not found", 404);
    if (rec.status !== "approved") return bad(rec.status === "rejected" ? "This payment was not accepted." : "Not confirmed yet. Danu Sir checks his UPI app and confirms it, usually within a day.");
    if (rec.claimed) return bad("These coins were already collected.");
    rec.claimed = true; rec.claimedAt = Date.now();
    await s.setJSON(`c-${id}`, rec);
    return json({ ok: true, coins: rec.coins });
  }

  // a new purchase
  if (b.adult !== true) return bad("Please confirm that you are 18 or older, or that a parent or guardian is paying.");
  const pack = COIN_PACKS.find((p) => p.amount === Number(b.pack));
  if (!pack) return bad("Choose one of the packs.");
  const ref = clean(b.ref, 40).replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-Z0-9]{8,30}$/.test(ref)) return bad("Type the payment reference (UTR) from your UPI app. It has 8 to 30 letters and numbers.");
  if (await s.get(`r-${ref}`, { type: "json" })) return bad("That payment reference was already used.");
  const { blobs } = await s.list({ prefix: `c-${cid}.` });
  if (blobs.length >= 40) return bad("Too many purchases from this device. Please write to Danu Sir.");
  const at = Date.now(), id = `${cid}.${at}-${rid(3)}`;
  const rec = { id, at, amount: pack.amount, coins: pack.coins, ref, status: "pending", claimed: false, ownerNote: "" };
  await s.setJSON(`r-${ref}`, { id });
  await s.setJSON(`c-${id}`, rec);
  return json({ ok: true, buy: mine(rec) });
};

export const config: Config = {
  path: ["/api/coins", "/api/coins/claim"],
  method: ["GET", "POST"],
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
