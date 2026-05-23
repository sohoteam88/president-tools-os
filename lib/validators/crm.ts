import { z } from "zod";
import { PIPELINE_STAGES } from "@/lib/crm/types";

export const CreateContactSchema = z.object({
  name: z.string().min(1, "Name required").max(100),
  whatsappNumber: z.string().min(8, "WhatsApp number too short").max(20),
  email: z.string().email().optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
  stage: z.enum(PIPELINE_STAGES).default("new"),
});

export const UpdateContactSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  whatsappNumber: z.string().min(8).max(20).optional(),
  email: z.string().email().optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
  lastContactedAt: z.string().datetime().optional().nullable(),
});

export const MoveStageSchema = z.object({
  stage: z.enum(PIPELINE_STAGES),
});
