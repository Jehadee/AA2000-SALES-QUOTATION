import { Redis } from "@upstash/redis";

const redis = (() => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
})();

const ORDER_KEY = "ally:opportunities:order";
const recordKeyFor = (id: string) => `ally:opportunities:${id}`;

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!redis) {
    return res.status(500).json({
      error: "Opportunities listing not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REST_TOKEN.",
    });
  }

  const limitRaw = req.query?.limit;
  const limit = Math.max(1, Math.min(Number(limitRaw || 20), 50));

  // Newest first because webhook uses LPUSH
  const ids = await redis.lrange(ORDER_KEY, 0, limit - 1);
  if (!Array.isArray(ids) || ids.length === 0) return res.status(200).json([]);

  const rawRecords = await Promise.all(ids.map((id) => redis.get(recordKeyFor(String(id)))));
  const records = rawRecords
    .map((v) => {
      if (!v) return null;
      try {
        return JSON.parse(String(v));
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  return res.status(200).json(records);
}

