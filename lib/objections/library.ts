import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { objectionResponses } from "@/lib/db/schema/objections";
import type { ObjectionCategory } from "@/lib/objections/types";
import type { Locale } from "@/lib/translations";

export async function getPublishedResponses(locale: Locale = "en", category?: ObjectionCategory) {
  return db
    .select()
    .from(objectionResponses)
    .where(
      category
        ? and(
            eq(objectionResponses.isPublished, true),
            eq(objectionResponses.locale, locale),
            eq(objectionResponses.category, category)
          )
        : and(
            eq(objectionResponses.isPublished, true),
            eq(objectionResponses.locale, locale)
          )
    )
    .orderBy(asc(objectionResponses.category), asc(objectionResponses.sortOrder));
}
