import { z } from "zod";

export const windowSchema = z.enum(["24h", "7d", "30d"]);
export type ConflictWindow = z.infer<typeof windowSchema>;

export const severityFilterSchema = z.enum(["all", "high", "medium", "low"]);
export type SeverityFilter = z.infer<typeof severityFilterSchema>;

export const severityLabelSchema = z.enum(["Low", "Medium", "High"]);
export type SeverityLabel = z.infer<typeof severityLabelSchema>;

export const locationPrecisionSchema = z.enum(["exact", "country"]);
export type LocationPrecision = z.infer<typeof locationPrecisionSchema>;

export const conflictDataKindSchema = z.enum(["hotspot", "article"]);
export type ConflictDataKind = z.infer<typeof conflictDataKindSchema>;

export const topArticleSchema = z.object({
  title: z.string(),
  url: z.string().url(),
});
export type TopArticle = z.infer<typeof topArticleSchema>;

export const queryParamsSchema = z.object({
  window: windowSchema.default("24h"),
  q: z.string().trim().min(1).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(250).default(180),
  severity: severityFilterSchema.default("all"),
});

export const conflictFeaturePropertiesSchema = z.object({
  dataKind: conflictDataKindSchema,
  title: z.string(),
  date: z.string().datetime(),
  country: z.string().optional(),
  locationName: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  gdeltTone: z.number().optional(),
  hotspotCount: z.number().int().min(1).optional(),
  topArticles: z.array(topArticleSchema).optional(),
  locationPrecision: locationPrecisionSchema,
  severityScore: z.number().min(0).max(100),
  severityLabel: severityLabelSchema,
  tags: z.array(z.string()),
  themes: z.array(z.string()),
});

export type ConflictFeatureProperties = z.infer<typeof conflictFeaturePropertiesSchema>;

export const conflictFeatureSchema = z.object({
  type: z.literal("Feature"),
  id: z.union([z.string(), z.number()]).transform(String),
  geometry: z.object({
    type: z.literal("Point"),
    coordinates: z.tuple([z.number(), z.number()]),
  }),
  properties: conflictFeaturePropertiesSchema,
});

export type ConflictFeature = z.infer<typeof conflictFeatureSchema>;

export const conflictFeatureCollectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(conflictFeatureSchema),
});

export type ConflictFeatureCollection = z.infer<typeof conflictFeatureCollectionSchema>;

export const gdeltGeo2PropertiesSchema = z
  .object({
    title: z.string().optional(),
    name: z.string().optional(),
    label: z.string().optional(),
    location: z.string().optional(),
    loc: z.string().optional(),
    place: z.string().optional(),
    city: z.string().optional(),
    admin1: z.string().optional(),
    admin2: z.string().optional(),
    url: z.string().url().optional(),
    sourceurl: z.string().url().optional(),
    seendate: z.string().optional(),
    date: z.string().optional(),
    lastupdate: z.string().optional(),
    tone: z.union([z.number(), z.string()]).optional(),
    avgtone: z.union([z.number(), z.string()]).optional(),
    averageTone: z.union([z.number(), z.string()]).optional(),
    gdeltTone: z.union([z.number(), z.string()]).optional(),
    themes: z.union([z.array(z.string()), z.string()]).optional(),
    country: z.string().optional(),
    mentions: z.union([z.number(), z.string()]).optional(),
    count: z.union([z.number(), z.string()]).optional(),
    numMentions: z.union([z.number(), z.string()]).optional(),
    totalMentions: z.union([z.number(), z.string()]).optional(),
    sum: z.union([z.number(), z.string()]).optional(),
    value: z.union([z.number(), z.string()]).optional(),
    size: z.union([z.number(), z.string()]).optional(),
    popup: z.string().optional(),
    popup_html: z.string().optional(),
    popupHTML: z.string().optional(),
    html: z.string().optional(),
    description: z.string().optional(),
    articles: z
      .array(z.object({ title: z.string().optional(), url: z.string().url().optional() }))
      .optional(),
    topArticles: z
      .array(z.object({ title: z.string().optional(), url: z.string().url().optional() }))
      .optional(),
  })
  .passthrough();

export const gdeltGeo2GeoJsonSchema = z
  .object({
    type: z.literal("FeatureCollection"),
    features: z.array(
      z
        .object({
          type: z.literal("Feature"),
          geometry: z.object({
            type: z.literal("Point"),
            coordinates: z.tuple([z.number(), z.number()]),
          }),
          properties: gdeltGeo2PropertiesSchema.optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export type GdeltGeo2GeoJson = z.infer<typeof gdeltGeo2GeoJsonSchema>;

export const gdeltDocArticleSchema = z.object({
  url: z.string().url(),
  url_mobile: z.string().optional().default(""),
  title: z.string(),
  seendate: z.string(),
  socialimage: z.string().optional().default(""),
  domain: z.string().optional().default(""),
  language: z.string().optional().default(""),
  sourcecountry: z.string().optional().default(""),
});

export type GdeltDocArticle = z.infer<typeof gdeltDocArticleSchema>;

export const gdeltDocResponseSchema = z.object({
  articles: z.array(gdeltDocArticleSchema).default([]),
});
