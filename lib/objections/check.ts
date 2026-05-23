import { runComplianceFilter } from "@/lib/compliance/filter";

export async function checkResponseCompliance(
  responseText: string,
  title: string
): Promise<{ passed: boolean; flags: string[] }> {
  const combined = `${title}. ${responseText}`;
  const result = await runComplianceFilter(combined, "admin", `objection-check-${Date.now()}`);
  return {
    passed: result.passed,
    flags: result.flags.map((flag) => flag.message ?? flag.code ?? "Compliance issue"),
  };
}
