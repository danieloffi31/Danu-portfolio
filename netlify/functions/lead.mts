/* POST /api/lead  A visitor chooses to share details: get updates, contribute, collaborate, or tell Danu Sir who they are
   when they download the bio, ask to hire, share the portfolio or talk to the robot. Everything is typed by the visitor.
   Nothing is guessed. Someone who says they are under 18 is never asked for, and never stored with, contact details. */
import type { Config, Context } from "@netlify/functions";
import { json, bad, store, clean, rid, AGE_BANDS, GENDERS, LEAD_KINDS, ACTS, PETS, PET_ACTS, TOPICS } from "../lib/core.mts";

const NEEDS_CONTACT = ["updates", "contribute", "collaborate", "robot"];
const INTERESTS = ["updates", "contribute", "collaborate", "hire", "books", "ideas", "skills"];

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(999, Math.round(n))) : 0;
};
const tally = (src: any, allowed: string[]) => {
  const o: Record<string, number> = {};
  if (src && typeof src === "object") for (const k of allowed) if (src[k]) o[k] = num(src[k]);
  return o;
};

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return bad("POST only", 405);
  const text = await req.text();
  if (text.length > 4000) return bad("Too large", 413);
  let b: any;
  try { b = JSON.parse(text); } catch { return bad("Bad JSON"); }
  if (clean(b.website, 80)) return json({ ok: true }); // hidden field: a person leaves it empty, a bot fills it

  const kind = clean(b.kind, 14);
  if (!LEAD_KINDS.includes(kind)) return bad("Unknown form");
  const age = AGE_BANDS.includes(clean(b.age, 8)) ? clean(b.age, 8) : "";
  const gender = GENDERS.includes(clean(b.gender, 8)) ? clean(b.gender, 8) : "";
  const minor = age === "u18";

  const name = minor ? "" : clean(b.name, 60);
  const phone = minor ? "" : clean(b.phone, 20).replace(/[^0-9+\- ]/g, "");
  const email = minor ? "" : clean(b.email, 80);
  const tg = minor ? "" : clean(b.tg, 40).replace(/^@/, "");
  const company = minor ? "" : clean(b.company, 80);
  const social = minor ? "" : clean(b.social, 150);
  const note = minor ? "" : clean(b.note, 500);
  const consent = !minor && b.consent === true;

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("That email does not look right.");
  if (tg && !/^[A-Za-z0-9_]{4,32}$/.test(tg)) return bad("A Telegram name has letters, numbers and underscores, 4 to 32 characters.");
  if (phone && phone.replace(/\D/g, "").length < 7) return bad("That phone number looks too short.");
  if (social && !(/^https?:\/\/[^\s]+$/i.test(social) || /^@?[A-Za-z0-9_.\-]{2,60}$/.test(social))) return bad("That link does not look right.");
  const hasContact = !!(phone || email || tg);
  if (NEEDS_CONTACT.includes(kind) && !minor && !hasContact) return bad("Please add a phone number, an email or a Telegram name so Danu Sir can reply.");
  if (NEEDS_CONTACT.includes(kind) && minor) return bad("If you are under 18, please ask a parent or teacher to write to Danu Sir.");
  if ((hasContact || name || company || social) && !consent) return bad("Please tick the box to say Danu Sir may save these details.");

  const geo: any = context.geo || {};
  const at = Date.now();
  const id = `${at}-${rid(3)}`;
  const did = b.did && typeof b.did === "object" && consent
    ? {
        pets: tally(b.did.pets, PETS), petActs: tally(b.did.petActs, PET_ACTS),
        topics: tally(b.did.topics, TOPICS), acts: tally(b.did.acts, ACTS),
      }
    : null;
  const rec = {
    id, at, status: "new", via: "site", kind,
    interests: (Array.isArray(b.interests) ? b.interests : []).map((x: unknown) => clean(x, 14)).filter((x: string) => INTERESTS.includes(x)).slice(0, 6),
    name, company, social, phone, email, tg, age, gender, note, consent, minor,
    country: geo.country?.code || "",
    state: clean(geo.subdivision?.name || "", 40),
    geoCity: clean(geo.city || "", 40),
    city: minor ? "" : clean(b.city, 60),
    district: minor ? "" : clean(b.district, 60),
    sid: /^[a-z0-9]{10,24}$/.test(clean(b.sid, 24)) ? clean(b.sid, 24) : "",
    did, ownerNote: "",
  };
  await store("leads").setJSON(id, rec);
  return json({ ok: true, id });
};

export const config: Config = {
  path: "/api/lead",
  method: "POST",
  rateLimit: { windowLimit: 12, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
