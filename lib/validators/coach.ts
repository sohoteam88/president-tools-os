import { z } from "zod";
import { TASK_STATUS } from "@/lib/coach/types";

export const CreateManualTaskSchema = z.object({
  title: z.string().min(1, "Title required").max(100),
  body: z.string().max(300).optional().or(z.literal("")),
  taskDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").optional(),
});

export const UpdateTaskStatusSchema = z.object({
  status: z.enum(TASK_STATUS),
  snoozedTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).refine((data) => data.status !== "snoozed" || !!data.snoozedTo, {
  message: "snoozedTo is required when status is 'snoozed'",
});
