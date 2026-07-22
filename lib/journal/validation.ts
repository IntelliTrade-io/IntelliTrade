import { z } from "zod";

export const TradeLegSchema = z.object({
  side: z.enum(['buy','sell']),
  qty: z.number().positive(),
  price: z.number().positive(),
  fee: z.number().min(0).default(0),
  slippage: z.number().min(0).default(0),
  executed_at: z.string().datetime({ offset: true })
});

export const CreateTradeSchema = z.object({
  account_id: z.string().uuid(),
  instrument_id: z.string().uuid(),
  strategy_id: z.string().uuid().nullable().optional(),
  setup: z.string().nullable().optional(),
  bias: z.enum(['long','short']),
  thesis: z.string().nullable().optional(),
  risk_per_trade: z.number().nullable().optional(),
  target_r: z.number().nullable().optional(),
  tags: z.array(z.string()).default([]),
  opened_at: z.string().datetime({ offset: true }),
  screenshot_urls: z.array(z.string()).default([]),
  legs: z.array(TradeLegSchema).min(1)
});

export const UpdateTradeSchema = z
  .object({
    account_id: z.string().uuid().optional(),
    instrument_id: z.string().uuid().optional(),
    strategy_id: z.string().uuid().nullable().optional(),
    setup: z.string().nullable().optional(),
    bias: z.enum(['long', 'short']).optional(),
    thesis: z.string().nullable().optional(),
    risk_per_trade: z.number().nullable().optional(),
    target_r: z.number().nullable().optional(),
    tags: z.array(z.string()).optional(),
    opened_at: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export const ReplaceTradeLegsSchema = z
  .object({
    legs: z.array(TradeLegSchema).min(1),
  })
  .strict();

export const ReviewSaveSchema = z
  .object({
    period: z.enum(['weekly', 'monthly']),
    period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    notes: z.string().max(5000).nullable().optional(),
  })
  .refine((value) => value.period_end >= value.period_start, {
    path: ['period_end'],
    message: 'Period end must be on or after period start.',
  });

export const JournalExportQuerySchema = z
  .object({
    resource: z.enum(['trades', 'reviews']),
    format: z.enum(['csv', 'json']),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    period: z.preprocess(
      (value) => (value === '' || value == null ? null : value),
      z.enum(['weekly', 'monthly']).nullable(),
    ),
  })
  .refine((value) => value.to >= value.from, {
    path: ['to'],
    message: 'Export end date must be on or after the start date.',
  });

export const TradeQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  from: z.string().nullable().optional(),
  to: z.string().nullable().optional(),
  instrument: z.string().nullable().optional(),
  strategy: z.string().nullable().optional(),
  asset_class: z.enum(['fx','crypto','equity','index','commodity']).nullable().optional(),
  result: z.enum(['win','loss']).nullable().optional(),
  search: z.string().nullable().optional(),
  tags: z.string().transform(v => v?.split(',') ?? []).optional()
});

export type TradeQuery = z.infer<typeof TradeQuerySchema>;
export type CreateTrade = z.infer<typeof CreateTradeSchema>;
export type UpdateTrade = z.infer<typeof UpdateTradeSchema>;
export type TradeLeg = z.infer<typeof TradeLegSchema>;
export type ReplaceTradeLegs = z.infer<typeof ReplaceTradeLegsSchema>;
export type ReviewSave = z.infer<typeof ReviewSaveSchema>;
export type JournalExportQuery = z.infer<typeof JournalExportQuerySchema>;
