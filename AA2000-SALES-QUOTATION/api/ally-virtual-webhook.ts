import { Redis } from "@upstash/redis";

const redis = (() => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
})();

const WEBHOOK_SECRET = process.env.ALLY_WEBHOOK_SECRET || "";

const ORDER_KEY = "ally:opportunities:order";
const SEEN_KEY = "ally:opportunities:seen";

function getOpportunityId(body: any): string | null {
  const candidate =
    body?.opportunityId ??
    body?.opportunity?.id ??
    body?.opportunity?.opportunityId ??
    body?.id ??
    body?.data?.opportunityId ??
    body?.data?.id;

  if (typeof candidate === "string" && candidate.trim() !== "") return candidate.trim();
  if (typeof candidate === "number" && Number.isFinite(candidate)) return String(candidate);
  return null;
}

function getSecretFromHeaders(req: any): string | null {
  const headers = req?.headers ?? {};

  const direct =
    headers["x-ally-webhook-secret"] ??
    headers["x-ally-virtual-secret"] ??
    headers["x-webhook-secret"] ??
    headers["x-webhook-token"] ??
    headers["authorization"];

  if (!direct) return null;
  const s = Array.isArray(direct) ? direct[0] : String(direct);
  return s.startsWith("Bearer ") ? s.slice("Bearer ".length).trim() : s.trim();
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!redis) {
    return res.status(500).json({
      error: "Webhook storage not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
    });
  }

  if (WEBHOOK_SECRET) {
    const receivedSecret = getSecretFromHeaders(req);
    if (!receivedSecret || receivedSecret !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Unauthorized: invalid webhook secret" });
    }
  }

  let body = req.body;
  if (!body || typeof body !== "object") body = {};

  const opportunityId = getOpportunityId(body);
  if (!opportunityId) {
    return res.status(400).json({
      error:
        "Missing opportunity id. Include opportunityId or opportunity.id in the webhook JSON payload.",
    });
  }

  const createdAt =
    body?.createdAt ?? body?.timestamp ?? body?.opportunity?.createdAt ?? new Date().toISOString();

  const record = {
    id: opportunityId,
    createdAt: typeof createdAt === "string" ? createdAt : new Date().toISOString(),
    raw: body,
  };

  const recordKey = `ally:opportunities:${opportunityId}`;

  // Store the record payload
  await redis.set(recordKey, JSON.stringify(record));

  // Only add to the ordering list the first time we see this opportunity id
  const added = await redis.sadd(SEEN_KEY, opportunityId);
  if (typeof added === "number" && added > 0) {
    await redis.lpush(ORDER_KEY, opportunityId);
  }

  return res.status(200).json({ ok: true, id: opportunityId });
}

