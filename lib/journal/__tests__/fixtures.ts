import type { Bias, Leg, TradeStatsRecord } from "../calculations";

export type CalculationParityFixture = {
  name: string;
  bias: Bias;
  legs: Leg[];
  expected: {
    avgBuy: number;
    avgSell: number;
    pnlGross: number;
    pnlNet: number;
    fees: number;
    slippage: number;
    netPos: number;
  };
};

export const calculationParityFixtures: CalculationParityFixture[] = [
  {
    name: "weighted multi-leg long profit",
    bias: "long",
    legs: [
      { side: "buy", qty: 1, price: 100, fee: 1, slippage: 0.5 },
      { side: "buy", qty: 3, price: 110, fee: 1, slippage: 0.5 },
      { side: "sell", qty: 1, price: 120, fee: 1, slippage: 0.5 },
      { side: "sell", qty: 3, price: 130, fee: 1, slippage: 0.5 },
    ],
    expected: {
      avgBuy: 107.5,
      avgSell: 127.5,
      pnlGross: 80,
      pnlNet: 74,
      fees: 4,
      slippage: 2,
      netPos: 0,
    },
  },
  {
    name: "weighted multi-leg short profit",
    bias: "short",
    legs: [
      { side: "sell", qty: 1, price: 100, fee: 1, slippage: 0.5 },
      { side: "sell", qty: 3, price: 90, fee: 1, slippage: 0.5 },
      { side: "buy", qty: 1, price: 80, fee: 1, slippage: 0.5 },
      { side: "buy", qty: 3, price: 70, fee: 1, slippage: 0.5 },
    ],
    expected: {
      avgBuy: 72.5,
      avgSell: 92.5,
      pnlGross: 80,
      pnlNet: 74,
      fees: 4,
      slippage: 2,
      netPos: 0,
    },
  },
  {
    name: "partial long exit",
    bias: "long",
    legs: [
      { side: "buy", qty: 2, price: 100, fee: 1 },
      { side: "sell", qty: 1, price: 105, fee: 1 },
    ],
    expected: {
      avgBuy: 100,
      avgSell: 105,
      pnlGross: 5,
      pnlNet: 3,
      fees: 2,
      slippage: 0,
      netPos: 1,
    },
  },
  {
    name: "long loss",
    bias: "long",
    legs: [
      { side: "buy", qty: 1, price: 100 },
      { side: "sell", qty: 1, price: 90 },
    ],
    expected: {
      avgBuy: 100,
      avgSell: 90,
      pnlGross: -10,
      pnlNet: -10,
      fees: 0,
      slippage: 0,
      netPos: 0,
    },
  },
  {
    name: "breakeven",
    bias: "long",
    legs: [
      { side: "buy", qty: 1, price: 100 },
      { side: "sell", qty: 1, price: 100 },
    ],
    expected: {
      avgBuy: 100,
      avgSell: 100,
      pnlGross: 0,
      pnlNet: 0,
      fees: 0,
      slippage: 0,
      netPos: 0,
    },
  },
  {
    name: "open trade costs",
    bias: "long",
    legs: [
      { side: "buy", qty: 1, price: 100, fee: 2, slippage: 1 },
    ],
    expected: {
      avgBuy: 100,
      avgSell: 0,
      pnlGross: -0,
      pnlNet: -3,
      fees: 2,
      slippage: 1,
      netPos: 1,
    },
  },
];

export const dashboardStatsParityFixture: TradeStatsRecord[] = [
  {
    id: "trade-open",
    opened_at: "2026-03-01T09:00:00.000Z",
    closed_at: null,
    bias: "long",
    risk_per_trade: 100,
    trade_legs: [
      {
        side: "buy",
        qty: 1,
        price: 100,
        fee: 2,
        slippage: 1,
        executed_at: "2026-03-01T09:00:00.000Z",
      },
    ],
  },
  {
    id: "trade-partial",
    opened_at: "2026-03-02T09:00:00.000Z",
    closed_at: null,
    bias: "long",
    risk_per_trade: 2,
    trade_legs: [
      {
        side: "buy",
        qty: 2,
        price: 100,
        fee: 1,
        slippage: 0,
        executed_at: "2026-03-02T09:00:00.000Z",
      },
      {
        side: "sell",
        qty: 1,
        price: 105,
        fee: 1,
        slippage: 0,
        executed_at: "2026-03-04T10:00:00.000Z",
      },
    ],
  },
  {
    id: "trade-closed",
    opened_at: "2026-03-03T09:00:00.000Z",
    closed_at: "2026-03-05T11:00:00.000Z",
    bias: "short",
    risk_per_trade: 4,
    trade_legs: [
      {
        side: "sell",
        qty: 1,
        price: 200,
        fee: 1,
        slippage: 0,
        executed_at: "2026-03-03T09:00:00.000Z",
      },
      {
        side: "buy",
        qty: 1,
        price: 190,
        fee: 1,
        slippage: 0,
        executed_at: "2026-03-05T11:00:00.000Z",
      },
    ],
  },
];
