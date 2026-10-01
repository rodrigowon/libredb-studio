import { NextRequest } from "next/server";
import { handleSchemaRequest } from "@/lib/api/schema-route";
import type { ViewMetadataResult } from "@/lib/view-metadata";

export const dynamic = "force-dynamic";

/** Ordinary view identity/columns only; support is declared by the provider method. */
export async function POST(req: NextRequest) {
  return handleSchemaRequest(
    req,
    "api/db/schema/views",
    async (provider): Promise<ViewMetadataResult> =>
      provider.getViews ? { status: "ready", data: await provider.getViews() } : { status: "unsupported" },
  );
}
