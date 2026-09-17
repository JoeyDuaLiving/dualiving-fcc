import { PageHeader } from "@/components/shared/PageHeader";
import { QBCCCalculator } from "@/components/calculators/QBCCCalculator";
import { GSTCalculator } from "@/components/calculators/GSTCalculator";
import { ProjectPMCalculator } from "@/components/calculators/ProjectPMCalculator";

export const metadata = { title: "Calculators · Dualiving FCC" };

export default function CalculatorsPage() {
  return (
    <>
      <PageHeader
        title="Calculators"
        description="Quick reference calculators for construction costs, insurance and GST."
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        <QBCCCalculator />
        <GSTCalculator />
        <ProjectPMCalculator />
      </div>
    </>
  );
}
