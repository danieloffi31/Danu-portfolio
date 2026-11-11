/* GET /api/media/:key  Pictures and songs the owner uploaded from the editor (for example a new photo, a poster, a pet picture or music).
   Songs are served with range support, because phones (iPhone in particular) will not play audio without it. */
import type { Config, Context } from "@netlify/functions";
import { store } from "../lib/core.mts";

export default async (req: Request, context: Context) => {
  const key = String(context.params.key || "");
  if (!/^[a-z0-9-]{6,60}\.(jpg|png|webp|gif|mp3|m4a|aac|ogg|wav|weba)$/.test(key)) return new Response("Not found", { status: 404 });
  const res = await store("media").getWithMetadata(key, { type: "arrayBuffer" });
  if (!res) return new Response("Not found", { status: 404 });
  const type = (res.metadata as any)?.type || "image/jpeg";
  const data = res.data as ArrayBuffer;
  const head: Record<string, string> = { "content-type": type, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff", "accept-ranges": "bytes" };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") || "");
  if (range && (range[1] || range[2])) {
    const size = data.byteLength;
    let start = range[1] ? parseInt(range[1], 10) : size - parseInt(range[2], 10);
    let end = range[1] && range[2] ? parseInt(range[2], 10) : size - 1;
    start = Math.max(0, start); end = Math.min(size - 1, end);
    if (start > end || start >= size) return new Response("Range not satisfiable", { status: 416, headers: { "content-range": `bytes */${size}` } });
    return new Response(data.slice(start, end + 1), { status: 206, headers: { ...head, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) } });
  }
  return new Response(data, { headers: head });
};

export const config: Config = { path: "/api/media/:key", method: "GET" };

