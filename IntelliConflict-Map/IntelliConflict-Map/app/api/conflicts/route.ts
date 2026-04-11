import { handleConflictsRequest } from "@/lib/conflictsRoute";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleConflictsRequest(request);
}
