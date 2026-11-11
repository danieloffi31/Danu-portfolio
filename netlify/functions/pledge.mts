/* POST /api/pledge  A visitor offers books, toys, food or clothes for children. Saved for the owner to read in the admin page. */
import type { Config } from "@netlify/functions";
import { json, bad, store, clean, rid } from "../lib/core.mts";

const KINDS = ["books", "toys", "food", "clothes", "other", "money"];

export default async (req: Request) => {
  if (req.method !== "POST") return bad("POST only", 405);
  const text = await req.text();
  if (text.length > 4000) return bad("Too large", 413);
  let b: any;
  try { b = JSON.parse(text); } catch { return bad("Bad JSON"); }
  if (clean(b.website, 80)) return json({ ok: true }); // hidden field: a person leaves it empty, a bot fills it

  const name = clean(b.name, 60);
  const phone = clean(b.phone, 20).replace(/[^0-9+\- ]/g, "");
  const email = clean(b.email, 80);
  const kinds = (Array.isArray(b.kinds) ? b.kinds : []).map((k: unknown) => clean(k, 12)).filter((k: string) => KINDS.includes(k));
  if (!name) return bad("Please add your name.");
  if (!phone && !email) return bad("Please add a phone number or an email so Danu Sir can reply.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("That email does not look right.");
  if (!kinds.length) return bad("Please choose at least one thing you want to give.");

  const at = Date.now();
  const id = `${at}-${rid(3)}`;
  const rec = {
    id, at, status: "new",
    name, phone, email, kinds,
    what: clean(b.what, 400),
    how: ["drop", "pickup", "courier"].includes(b.how) ? b.how : "drop",
    city: clean(b.city, 60),
    note: clean(b.note, 500),
    ownerNote: "",
  };
  await store("pledges").setJSON(id, rec);

  // If the owner chose to share the drop-off address after a pledge, send it back now.
  let address = "";
  try {
    const c: any = await store("site").get("content", { type: "json" });
    if (c?.help?.dropMode === "after" && c.help.address) address = clean(c.help.address, 300);
  } catch { /* no content yet */ }
  return json({ ok: true, id, address });
};

export const config: Config = {
  path: "/api/pledge",
  method: "POST",
  rateLimit: { windowLimit: 6, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
