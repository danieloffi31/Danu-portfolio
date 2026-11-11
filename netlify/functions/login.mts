/* POST /api/login  Owner sign-in. The password lives only in the ADMIN_PASSWORD setting in Netlify. */
import type { Config } from "@netlify/functions";
import { json, bad, adminConfigured, passwordOk, makeToken, sessionCookie, clearCookie, isAdmin } from "../lib/core.mts";

export default async (req: Request) => {
  if (req.method === "GET") {
    // Lets the admin pages ask: is the password set up, and am I signed in?
    return json({ ok: true, configured: adminConfigured(), signedIn: isAdmin(req) });
  }
  if (req.method === "DELETE") return json({ ok: true }, 200, { "set-cookie": clearCookie() });
  if (req.method !== "POST") return bad("Not allowed", 405);
  if (!adminConfigured()) {
    return bad("The admin password is not set yet. In Netlify, add ADMIN_PASSWORD (at least 8 characters) under Environment variables, then deploy again.", 503);
  }
  let b: any = {};
  try { b = await req.json(); } catch { /* empty */ }
  const ok = passwordOk(typeof b.password === "string" ? b.password.slice(0, 200) : "");
  if (!ok) {
    await new Promise((r) => setTimeout(r, 700)); // slows down guessing
    return bad("That password is not right.", 401);
  }
  return json({ ok: true }, 200, { "set-cookie": sessionCookie(makeToken()) });
};

export const config: Config = {
  path: "/api/login",
  rateLimit: { windowLimit: 8, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
