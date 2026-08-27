import { checkBuildxactConnection } from "@/integrations/buildxact/status";

export async function GET() {
  const status = await checkBuildxactConnection();
  return Response.json(status);
}
