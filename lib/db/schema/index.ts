/**
 * Schema barrel export.
 * Drizzle Kit reads this file to discover all tables.
 * Import from here, not from individual schema files.
 */

export * from "./accounts";
export * from "./voice";
export * from "./content";
export * from "./funnels";
export * from "./magnets";
export * from "./webinars";
export * from "./crm";
export * from "./coach";
export * from "./ads";
export * from "./objections";

// Future schema modules will be added here as phases are built:
// export * from "./funnels";  // Phase 4 — Funnel Builder
// export * from "./webinars"; // Phase 5 — Webinar System
// export * from "./crm";      // Phase 7 — CRM
// export * from "./compliance"; // Phase 8 — Compliance features
