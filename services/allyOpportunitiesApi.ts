export interface AllyOpportunityFromWebhook {
  id: string;
  createdAt: string;
  raw: any;
}

export async function fetchAllyOpportunities(limit: number = 20): Promise<AllyOpportunityFromWebhook[]> {
  const res = await fetch(`/api/ally-virtual-opportunities?limit=${encodeURIComponent(String(limit))}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to fetch Ally opportunities (${res.status}). ${text}`);
  }
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as AllyOpportunityFromWebhook[]) : [];
}

