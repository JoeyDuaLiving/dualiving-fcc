import { checkGhlConnection } from "@/integrations/ghl/status";

export async function GET() {
  const status = await checkGhlConnection();
  return Response.json(status);
}
