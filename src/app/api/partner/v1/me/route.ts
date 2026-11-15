import { jsonResponse, withPartner } from "@/partner-api";

export const dynamic = "force-dynamic";

/**
 * Who the API key belongs to. Lets a partner check that its configuration
 * points at the right UI deployment with the right key, without touching data.
 */
export const GET = withPartner(async ({ partner, requestId }) =>
  jsonResponse({ partner: { id: partner.id, name: partner.name } }, 200, requestId),
);
