/* Shared helpers for the portfolio backend: JSON replies, the login cookie, and storage. */
import { getStore } from "@netlify/blobs";
import { createHash, createHmac, timingSafeEqual, randomBytes } from "node:crypto";

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });

export const bad = (msg: string, status = 400) => json({ ok: false, error: msg }, status);

/* One store per kind of data. Strong consistency so the admin always sees the latest write. */
export const store = (name: "sessions" | "pledges" | "ledger" | "site" | "media" | "leads" | "network" | "coinbuys") =>
  getStore({ name, consistency: "strong" });

export const rid = (n = 6) => randomBytes(n).toString("hex");

/* Short, safe text. Trims, strips control characters and caps the length. */
export const clean = (v: unknown, max = 200) =>
  typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max) : "";

/* ---------- Login ---------- */
const COOKIE = "adm";
const TTL = 12 * 60 * 60; // 12 hours

const password = () => Netlify.env.get("ADMIN_PASSWORD") || "";
const secret = () => "portfolio-admin|" + (Netlify.env.get("ADMIN_SECRET") || password());

const sha = (s: string) => createHash("sha256").update(s).digest();
export const passwordOk = (given: string) => {
  const real = password();
  if (!real || !given) return false;
  return timingSafeEqual(sha(given), sha(real));
};
export const adminConfigured = () => password().length >= 8;

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");

export const makeToken = () => {
  const body = b64(JSON.stringify({ exp: Date.now() + TTL * 1000, n: rid(4) }));
  return `${body}.${sign(body)}`;
};

export const sessionCookie = (token: string) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${TTL}`;
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

export const isAdmin = (req: Request) => {
  if (!adminConfigured()) return false;
  const raw = req.headers.get("cookie") || "";
  const m = raw.split(/;\s*/).find((c) => c.startsWith(COOKIE + "="));
  if (!m) return false;
  const token = m.slice(COOKIE.length + 1);
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  const want = sign(body);
  if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!(exp > Date.now())) return false;
  } catch {
    return false;
  }
  // Anything that changes data must come from the admin pages, never from another site.
  if (req.method !== "GET" && req.headers.get("x-admin") !== "1") return false;
  return true;
};

/* ---------- Dates ---------- */
export const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/* A short browser and device label from the user agent. No identifying detail is kept. */
export const uaLabel = (ua: string) => {
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad|iOS/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac OS/i.test(ua) ? "Mac" : /Linux/i.test(ua) ? "Linux" : "Other";
  const br = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Other";
  return `${br} on ${os}`;
};

/* Section ids the tracker may report. Anything else is ignored, so nobody can fill the store with junk. */
export const SECTIONS = [
  "starring", "daily", "top-picks", "reels", "tutor", "prices", "help", "photos", "artist", "poems", "stories",
  "certificates", "skills", "resume", "follow", "collab", "genres", "contact",
];
export const ACTS = [
  "chat", "tip", "advance", "wa", "ig", "yt", "fb", "dl", "pledge", "reel", "photo", "poem", "cert", "pet", "share", "call",
  "tg", "li", "x", "soc", "hire", "lead", "collab", "bio", "robot", "copy",
];
/* The four guards and what a visitor can do with them. Only these names are accepted. */
export const PETS = ["lion", "husky", "turtle", "dragon"];
export const PET_ACTS = ["summon", "feed", "drink", "play", "doctor", "dress", "wash", "potty", "sleep", "talk", "fight", "game"];
/* What the robot was asked about, as a short topic, never the words typed. */
export const TOPICS = ["hello", "thanks", "help", "hire", "prices", "contact", "resume", "skills", "follow", "poems", "stories", "artist", "awards", "custom", "reels", "top-picks", "location", "about", "about-bot", "tutor", "other"];

/* Who the visitor says they are. Only what they choose to tell us. */
export const AGE_BANDS = ["u18", "18-24", "25-34", "35-44", "45-54", "55+"];
export const GENDERS = ["female", "male", "other", "na"];
export const LEAD_KINDS = ["updates", "contribute", "collaborate", "bio", "hire", "share", "robot"];
/* Packs of pet-room coins a visitor can pay for by UPI. The owner confirms each payment himself in the admin page, then the coins are released. */
export const COIN_PACKS = [{ amount: 10, coins: 40 }, { amount: 30, coins: 150 }, { amount: 60, coins: 350 }, { amount: 100, coins: 650 }];
export const MANUAL_KINDS = ["follow", "subscribe", "message"];
export const PLATFORMS = ["Instagram", "YouTube", "Facebook", "Snapchat", "Moj", "WhatsApp", "Telegram", "LinkedIn", "X", "Threads", "Pinterest", "Behance", "Discord", "GitHub", "Reddit", "Twitch", "Spotify", "Other"];
