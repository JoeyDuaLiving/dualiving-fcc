import { checkXeroConnection } from "@/integrations/xero/status";

export async function GET() {
  const status = await checkXeroConnection();
  return Response.json(status);
}
