/* GET /api/content  What the owner has changed in the editor. The site loads this on start and merges it over the built-in content.
   The drop-off address is only included when the owner chose to show it on the website. */
import type { Config } from "@netlify/functions";
import { json, store } from "../lib/core.mts";

export default async () => {
  let c: any = null;
  try { c = await store("site").get("content", { type: "json" }); } catch { /* none saved yet */ }
  if (!c) return json({ ok: true, content: null }, 200, { "cache-control": "public, max-age=20" });
  const out = JSON.parse(JSON.stringify(c));
  if (out.help) {
    if (out.help.dropMode !== "public") out.help.address = "";
  }
  return json({ ok: true, content: out }, 200, { "cache-control": "public, max-age=20" });
};

export const config: Config = { path: "/api/content", method: "GET" };
