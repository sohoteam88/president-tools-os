export const PIPELINE_STAGES = [
  "new",
  "warm",
  "hot",
  "customer",
  "team_member",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const STAGE_LABELS: Record<PipelineStage, string> = {
  new: "New",
  warm: "Warm",
  hot: "Hot",
  customer: "Customer",
  team_member: "Team Member",
};

export const STAGE_COLORS: Record<PipelineStage, string> = {
  new: "bg-slate-100 text-slate-700",
  warm: "bg-amber-100 text-amber-700",
  hot: "bg-orange-100 text-orange-700",
  customer: "bg-green-100 text-green-700",
  team_member: "bg-purple-100 text-purple-700",
};

export const SOURCE_LABELS: Record<string, string> = {
  funnel: "Funnel",
  lead_magnet: "Lead Magnet",
  webinar: "Webinar",
  manual: "Manual",
};

export function emptyStageCounts(): Record<PipelineStage, number> {
  return {
    new: 0,
    warm: 0,
    hot: 0,
    customer: 0,
    team_member: 0,
  };
}
