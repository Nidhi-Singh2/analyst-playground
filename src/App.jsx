import React, { useState, useEffect, useRef } from "react";
import {
  BarChart, Bar, LineChart, Line, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie,
} from "recharts";

// ═══════════════════════════════════════════════════════════════════════════
// SKILL DIMENSIONS — every question is tagged. Adaptive engine maintains
// an ability estimate per skill and selects next items accordingly.
// ═══════════════════════════════════════════════════════════════════════════
const SKILLS = {
  TREND: "Trend Reading",
  GROWTH: "Growth & CAGR",
  MARGIN: "Margin Analysis",
  RATIO: "Ratio Computation",
  CASHFLOW: "Cash Flow Reading",
  ANOMALY: "Anomaly Detection",
  COMPOSITION: "Mix & Composition",
  VARIANCE: "Variance Bridges",
  SENSITIVITY: "Sensitivity Tables",
  COHORT: "Cohort Retention",
  WORKING_CAP: "Working Capital",
  VALUATION: "Valuation Multiples",
};
const SKILL_LIST = Object.values(SKILLS);

// ═══════════════════════════════════════════════════════════════════════════
// ADAPTIVE ENGINE — simplified Elo / IRT hybrid.
// Each skill has an ability score (0..1). After each answer we update.
// Next-test selection biases toward weakest skills; difficulty targets
// slightly above current ability to drive growth.
// ═══════════════════════════════════════════════════════════════════════════
const DEFAULT_PROFILE = () => ({
  ability: Object.fromEntries(SKILL_LIST.map((s) => [s, 0.4])),
  attempts: Object.fromEntries(SKILL_LIST.map((s) => [s, 0])),
  correct: Object.fromEntries(SKILL_LIST.map((s) => [s, 0])),
  testsToday: 0,
  testsDate: new Date().toISOString().slice(0, 10),
  history: [],
});

function updateAbility(profile, skills, correct, difficulty) {
  const updated = {
    ...profile,
    ability: { ...profile.ability },
    attempts: { ...profile.attempts },
    correct: { ...profile.correct },
  };
  skills.forEach((s) => {
    const n = updated.attempts[s] || 0;
    const k = 0.18 / (1 + n * 0.08);
    const expected = 1 / (1 + Math.exp(-(updated.ability[s] - difficulty) * 4));
    const actual = correct ? 1 : 0;
    updated.ability[s] = Math.max(0.05, Math.min(0.98, updated.ability[s] + k * (actual - expected)));
    updated.attempts[s] = n + 1;
    updated.correct[s] = (updated.correct[s] || 0) + (correct ? 1 : 0);
  });
  return updated;
}

// ═══════════════════════════════════════════════════════════════════════════
// SEEDED RNG — stable within a test session
// ═══════════════════════════════════════════════════════════════════════════
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const shuffle = (rng, arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const makeOpts = (rng, correctText, distractors) =>
  shuffle(rng, [
    { t: correctText, correct: true },
    ...distractors.map((d) => ({ t: d, correct: false })),
  ]);

// ═══════════════════════════════════════════════════════════════════════════
// CHART GENERATORS — return { type, data, meta, questions[] }
// Each question's answer is derived from the data so correctness is exact.
// Difficulty narrows distractor spread.
// ═══════════════════════════════════════════════════════════════════════════

function genRevenueMargin(rng, difficulty) {
  const startRev = 600 + Math.floor(rng() * 600);
  const growth = 0.06 + rng() * 0.16;
  const years = ["FY20", "FY21", "FY22", "FY23", "FY24"];
  let rev = startRev;
  const data = years.map((y, i) => {
    const noise = (rng() - 0.5) * 0.05;
    rev = i === 0 ? startRev : rev * (1 + growth + noise);
    const gm = 36 + (rng() - 0.5) * 3 + i * (rng() > 0.4 ? 0.7 : -0.4);
    const om = gm - 17 - (rng() - 0.5) * 1.5;
    return { period: y, revenue: round(rev, 0), grossMargin: round(gm, 1), opMargin: round(om, 1) };
  });
  const cagr = round((Math.pow(data[4].revenue / data[0].revenue, 1 / 4) - 1) * 100, 1);
  const omDelta = round(data[4].opMargin - data[0].opMargin, 1);
  const distSpread = difficulty > 0.6 ? 1.0 : difficulty > 0.3 ? 2.0 : 3.5;

  return {
    type: "revenueMargin",
    data,
    meta: {
      title: "Aurelia Industries — Revenue & Margin Profile",
      subtitle: "Annual revenue ($M) overlaid with gross and operating margin (%)",
    },
    questions: [
      {
        prompt: "What is the approximate revenue CAGR across the period shown?",
        opts: makeOpts(rng, `${cagr}%`, [
          `${round(cagr + distSpread, 1)}%`,
          `${round(cagr - distSpread, 1)}%`,
          `${round(cagr + distSpread * 2, 1)}%`,
        ]),
        skills: [SKILLS.GROWTH, SKILLS.TREND],
        difficulty,
        explain: `Revenue moved from $${data[0].revenue}M to $${data[4].revenue}M over 4 years. CAGR = (end/start)^(1/n) − 1 ≈ ${cagr}%.`,
      },
      {
        prompt: `How did operating margin change from ${data[0].period} to ${data[4].period}?`,
        opts: makeOpts(rng,
          omDelta >= 0 ? `Expanded by ~${Math.abs(omDelta)} pts` : `Contracted by ~${Math.abs(omDelta)} pts`,
          [
            omDelta >= 0 ? `Contracted by ~${Math.abs(omDelta)} pts` : `Expanded by ~${Math.abs(omDelta)} pts`,
            "Roughly flat",
            `${omDelta >= 0 ? "Expanded" : "Contracted"} by ~${Math.abs(omDelta) + 3} pts`,
          ]),
        skills: [SKILLS.MARGIN, SKILLS.TREND],
        difficulty,
        explain: `Op margin moved from ${data[0].opMargin}% to ${data[4].opMargin}% — a change of ${omDelta} pts.`,
      },
    ],
  };
}

function genCashFlowBridge(rng, difficulty) {
  const ocf = 200 + Math.floor(rng() * 400);
  const capex = -(80 + Math.floor(rng() * 180));
  const acquisitions = rng() > 0.5 ? -(40 + Math.floor(rng() * 120)) : 0;
  const debtIssued = rng() > 0.4 ? 50 + Math.floor(rng() * 150) : 0;
  const debtRepaid = -(30 + Math.floor(rng() * 100));
  const dividends = -(20 + Math.floor(rng() * 80));
  const buybacks = rng() > 0.5 ? -(40 + Math.floor(rng() * 120)) : 0;
  const fcf = ocf + capex;
  const netChange = ocf + capex + acquisitions + debtIssued + debtRepaid + dividends + buybacks;

  const items = [
    { label: "Operating CF", value: ocf, type: "in" },
    { label: "CapEx", value: capex, type: "out" },
    { label: "Acquisitions", value: acquisitions, type: "out" },
    { label: "Debt Issued", value: debtIssued, type: "in" },
    { label: "Debt Repaid", value: debtRepaid, type: "out" },
    { label: "Dividends", value: dividends, type: "out" },
    { label: "Buybacks", value: buybacks, type: "out" },
    { label: "Net Change", value: netChange, type: "total" },
  ].filter((i) => i.value !== 0 || i.type === "total");

  let running = 0;
  const data = items.map((item) => {
    if (item.type === "total")
      return { ...item, base: item.value < 0 ? item.value : 0, bar: Math.abs(item.value) };
    const start = running;
    running += item.value;
    return { ...item, base: Math.min(start, running), bar: Math.abs(item.value) };
  });

  const distSpread = difficulty > 0.6 ? 0.06 : 0.14;
  return {
    type: "cashWaterfall",
    data,
    meta: {
      title: "Helios Capital — FY24 Cash Flow Bridge",
      subtitle: "From operating cash flow to net change in cash ($M)",
    },
    questions: [
      {
        prompt: "What was free cash flow (OCF − CapEx) for the year?",
        opts: makeOpts(rng, `$${fcf}M`, [
          `$${Math.round(fcf * (1 + distSpread))}M`,
          `$${Math.round(fcf * (1 - distSpread))}M`,
          `$${ocf}M`,
        ]),
        skills: [SKILLS.CASHFLOW],
        difficulty,
        explain: `FCF = OCF + CapEx = ${ocf} + (${capex}) = $${fcf}M.`,
      },
      {
        prompt: "How much capital was returned to shareholders this year?",
        opts: makeOpts(rng, `$${Math.abs(dividends + buybacks)}M (dividends + buybacks)`, [
          `$${Math.abs(dividends)}M (dividends only)`,
          `$${Math.abs(buybacks)}M (buybacks only)`,
          `$${Math.abs(dividends + buybacks + debtRepaid)}M`,
        ]),
        skills: [SKILLS.CASHFLOW, SKILLS.COMPOSITION],
        difficulty,
        explain: `Dividends ($${Math.abs(dividends)}M) + Buybacks ($${Math.abs(buybacks)}M) = $${Math.abs(dividends + buybacks)}M. Debt repayment isn't a return to shareholders.`,
      },
    ],
  };
}

function genMarginBridge(rng, difficulty) {
  const startGM = 38 + rng() * 6;
  const priceImpact = (rng() - 0.3) * 2.5;
  const mixImpact = (rng() - 0.5) * 2;
  const costImpact = -(rng() * 3 + 0.5);
  const fxImpact = (rng() - 0.5) * 1.2;
  const endGM = startGM + priceImpact + mixImpact + costImpact + fxImpact;

  const items = [
    { label: "FY23 GM%", value: round(startGM, 1), type: "start" },
    { label: "Price", value: round(priceImpact, 1), type: priceImpact >= 0 ? "in" : "out" },
    { label: "Mix", value: round(mixImpact, 1), type: mixImpact >= 0 ? "in" : "out" },
    { label: "Input Costs", value: round(costImpact, 1), type: "out" },
    { label: "FX", value: round(fxImpact, 1), type: fxImpact >= 0 ? "in" : "out" },
    { label: "FY24 GM%", value: round(endGM, 1), type: "end" },
  ];

  let running = 0;
  const data = items.map((d) => {
    if (d.type === "start" || d.type === "end") {
      running = d.value;
      return { ...d, base: 0, bar: d.value };
    }
    const start = running;
    running += d.value;
    return { ...d, base: Math.min(start, running), bar: Math.abs(d.value) };
  });

  const movables = items.filter((d) => !["start", "end"].includes(d.type));
  const largestNeg = movables.reduce(
    (a, b) => (Math.abs(b.value) > Math.abs(a.value) && b.value < 0 ? b : a),
    { value: 0, label: "—" }
  );
  const netDelta = round(endGM - startGM, 1);
  const distractors = movables.filter((d) => d.label !== largestNeg.label).slice(0, 3).map((d) => d.label);

  return {
    type: "marginBridge",
    data,
    meta: {
      title: "Vance & Co. — Gross Margin Walk FY23 → FY24",
      subtitle: "Drivers of year-over-year gross margin change (pts)",
    },
    questions: [
      {
        prompt: "What was the largest single drag on gross margin?",
        opts: makeOpts(rng, largestNeg.label, distractors),
        skills: [SKILLS.VARIANCE, SKILLS.MARGIN],
        difficulty,
        explain: `${largestNeg.label} reduced gross margin by ${Math.abs(largestNeg.value)} pts — the largest adverse driver.`,
      },
      {
        prompt: "What was the net YoY change in gross margin?",
        opts: makeOpts(rng, `${netDelta >= 0 ? "+" : ""}${netDelta} pts`, [
          `${netDelta >= 0 ? "+" : ""}${round(netDelta + 0.8, 1)} pts`,
          `${netDelta >= 0 ? "+" : ""}${round(netDelta - 1.1, 1)} pts`,
          `${netDelta >= 0 ? "−" : "+"}${Math.abs(round(netDelta + 1.5, 1))} pts`,
        ]),
        skills: [SKILLS.VARIANCE, SKILLS.MARGIN],
        difficulty,
        explain: `GM moved from ${round(startGM, 1)}% to ${round(endGM, 1)}% — a change of ${netDelta} pts.`,
      },
    ],
  };
}

function genCohortRetention(rng, difficulty) {
  const cohorts = ["Q1'23", "Q2'23", "Q3'23", "Q4'23", "Q1'24", "Q2'24"];
  const periods = ["M0", "M3", "M6", "M9", "M12"];
  const baseRetention = [100, 78 + rng() * 8, 64 + rng() * 8, 55 + rng() * 8, 49 + rng() * 8];
  const data = cohorts.map((c, ci) => {
    const cohortQuality = 1 + (ci - 2) * 0.04 + (rng() - 0.5) * 0.04;
    return {
      cohort: c,
      values: periods.map((p, pi) =>
        pi === 0 ? 100 : pi < 5 - (ci % 2) ? Math.round(baseRetention[pi] * cohortQuality) : null
      ),
    };
  });

  const m6Idx = 2;
  let bestM6 = -1, bestCohort = "";
  data.forEach((d) => {
    if (d.values[m6Idx] !== null && d.values[m6Idx] > bestM6) {
      bestM6 = d.values[m6Idx];
      bestCohort = d.cohort;
    }
  });
  const distractors = cohorts.filter((c) => c !== bestCohort).slice(0, 3);

  return {
    type: "cohortRetention",
    data,
    periods,
    meta: {
      title: "Halcyon SaaS — Customer Retention by Cohort",
      subtitle: "% of original cohort still active at each month-mark",
    },
    questions: [
      {
        prompt: "Which cohort shows the strongest 6-month retention?",
        opts: makeOpts(rng, bestCohort, distractors),
        skills: [SKILLS.COHORT, SKILLS.TREND],
        difficulty,
        explain: `${bestCohort} retained ${bestM6}% at month 6 — the highest among complete cohorts.`,
      },
      {
        prompt: "What does the cohort trajectory most suggest?",
        opts: makeOpts(rng, "Newer cohorts retain better than older ones", [
          "Retention is deteriorating over time",
          "All cohorts converge to ~80% at M12",
          "Seasonality dominates the cohort effects",
        ]),
        skills: [SKILLS.COHORT, SKILLS.TREND],
        difficulty,
        explain: "Successive cohorts show progressively higher retention at each milestone — a sign of product or onboarding improvements.",
      },
    ],
  };
}

function genSensitivity(rng, difficulty) {
  const wacc = [8.0, 8.5, 9.0, 9.5, 10.0];
  const tg = [2.0, 2.5, 3.0, 3.5, 4.0];
  const basePrice = 80 + Math.floor(rng() * 60);
  const data = wacc.map((w) => ({
    wacc: w,
    values: tg.map((g) => Math.round(basePrice * (1 + (3.0 - (w - g)) * 0.18))),
  }));
  const centerVal = data[2].values[2];

  return {
    type: "sensitivity",
    data,
    wacc, tg,
    meta: {
      title: "Riverstone Corp — DCF Sensitivity",
      subtitle: "Implied share price ($) by WACC (rows) and terminal growth (cols)",
    },
    questions: [
      {
        prompt: "Under base assumptions (9.0% WACC, 3.0% terminal growth), what is the implied share price?",
        opts: makeOpts(rng, `$${centerVal}`, [
          `$${centerVal + 8}`,
          `$${centerVal - 11}`,
          `$${centerVal + 18}`,
        ]),
        skills: [SKILLS.SENSITIVITY, SKILLS.VALUATION],
        difficulty,
        explain: `Read the center cell of the table at WACC 9.0% and TG 3.0%: $${centerVal}.`,
      },
      {
        prompt: "Which combination yields the highest valuation?",
        opts: makeOpts(rng, "Low WACC, high terminal growth", [
          "High WACC, high terminal growth",
          "Low WACC, low terminal growth",
          "High WACC, low terminal growth",
        ]),
        skills: [SKILLS.SENSITIVITY, SKILLS.VALUATION],
        difficulty,
        explain: "Discount rate and growth move valuation in opposite directions. Lowest discount + highest growth = maximum present value.",
      },
    ],
  };
}

function genWorkingCapital(rng, difficulty) {
  const quarters = ["Q1", "Q2", "Q3", "Q4"];
  const dsoBase = 42 + rng() * 12;
  const dioBase = 60 + rng() * 20;
  const dpoBase = 38 + rng() * 14;
  const trend = rng() > 0.5 ? 1 : -1;
  const data = quarters.map((q, i) => {
    const dso = round(dsoBase + trend * i * 2.4 + (rng() - 0.5) * 1.5, 1);
    const dio = round(dioBase + trend * i * 3.0 + (rng() - 0.5) * 2, 1);
    const dpo = round(dpoBase - trend * i * 1.2 + (rng() - 0.5) * 1.5, 1);
    const ccc = round(dso + dio - dpo, 1);
    return { period: q, DSO: dso, DIO: dio, DPO: dpo, CCC: ccc };
  });
  const cccDelta = round(data[3].CCC - data[0].CCC, 1);

  return {
    type: "workingCapital",
    data,
    meta: {
      title: "Meridian Goods — Working Capital Cycle",
      subtitle: "DSO, DIO, DPO and the resulting Cash Conversion Cycle (days)",
    },
    questions: [
      {
        prompt: "What happened to the cash conversion cycle across the year?",
        opts: makeOpts(rng,
          cccDelta > 0 ? `Lengthened by ~${cccDelta} days` : `Shortened by ~${Math.abs(cccDelta)} days`,
          [
            cccDelta > 0 ? `Shortened by ~${Math.abs(cccDelta)} days` : `Lengthened by ~${Math.abs(cccDelta)} days`,
            "Remained flat",
            "Doubled",
          ]),
        skills: [SKILLS.WORKING_CAP, SKILLS.TREND],
        difficulty,
        explain: `CCC = DSO + DIO − DPO. Moved from ${data[0].CCC} days to ${data[3].CCC} days — a change of ${cccDelta} days.`,
      },
      {
        prompt: cccDelta > 0 ? "What does a lengthening CCC typically signal?" : "What does a shortening CCC typically signal?",
        opts: makeOpts(rng,
          cccDelta > 0 ? "Cash is being tied up in working capital" : "Improved cash efficiency / faster collections",
          [
            cccDelta > 0 ? "Faster cash conversion" : "More inventory build-up",
            "Lower profitability",
            "Tax efficiency improvement",
          ]),
        skills: [SKILLS.WORKING_CAP, SKILLS.CASHFLOW],
        difficulty,
        explain: cccDelta > 0
          ? "Longer CCC = more cash trapped between paying suppliers and collecting from customers."
          : "Shorter CCC = cash returns from the operating cycle faster; a positive working-capital signal.",
      },
    ],
  };
}

function genBalanceSheet(rng, difficulty) {
  const cash = 80 + rng() * 200;
  const ar = 120 + rng() * 180;
  const inv = 200 + rng() * 250;
  const ppe = 400 + rng() * 600;
  const intang = 150 + rng() * 350;
  const total = cash + ar + inv + ppe + intang;
  const data = [
    { name: "Cash & Equiv.", value: round(cash, 0) },
    { name: "Accounts Receivable", value: round(ar, 0) },
    { name: "Inventory", value: round(inv, 0) },
    { name: "PP&E", value: round(ppe, 0) },
    { name: "Intangibles & Goodwill", value: round(intang, 0) },
  ];
  const intangPct = round((intang / total) * 100, 1);

  return {
    type: "balanceSheet",
    data,
    meta: {
      title: "Brunswick Holdings — Asset Composition",
      subtitle: "Distribution of total assets ($M)",
    },
    questions: [
      {
        prompt: "What share of total assets is composed of intangibles and goodwill?",
        opts: makeOpts(rng, `~${intangPct}%`, [
          `~${round(intangPct + 8, 1)}%`,
          `~${Math.max(round(intangPct - 6, 1), 1)}%`,
          `~${round(intangPct + 15, 1)}%`,
        ]),
        skills: [SKILLS.COMPOSITION, SKILLS.RATIO],
        difficulty,
        explain: `Intangibles ($${round(intang, 0)}M) ÷ Total assets ($${round(total, 0)}M) ≈ ${intangPct}%.`,
      },
      {
        prompt: intangPct > 30 ? "What does a heavy intangibles weighting often suggest?" : "What does this asset mix most resemble?",
        opts: makeOpts(rng,
          intangPct > 30 ? "A history of acquisitions; risk of future impairment" : "A capital-intensive operating business",
          [
            "A pure-play financial holding company",
            "A cash-only investment vehicle",
            "An early-stage startup with minimal infrastructure",
          ]),
        skills: [SKILLS.COMPOSITION, SKILLS.ANOMALY],
        difficulty,
        explain: intangPct > 30
          ? "Large intangibles + goodwill typically signal acquisition-driven growth, with exposure to goodwill write-downs if performance disappoints."
          : "Heavy PP&E indicates a capital-intensive operating business — manufacturing, infrastructure, or similar.",
      },
    ],
  };
}

function genValuationComps(rng, difficulty) {
  const peers = ["Aldridge", "Brixton", "Cordova", "Doverlane", "Ennisbrook", "Faircliff"];
  const data = peers.map((p) => ({
    name: p,
    evRev: round(2 + rng() * 6, 1),
    evEbitda: round(8 + rng() * 14, 1),
    pe: round(14 + rng() * 22, 1),
    growth: round(4 + rng() * 22, 1),
  }));
  const fastestGrower = data.reduce((a, b) => (b.growth > a.growth ? b : a));
  const median = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const medianEvEbitda = round(median(data.map((d) => d.evEbitda)), 1);
  const distractors = data.filter((d) => d.name !== fastestGrower.name).slice(0, 3).map((d) => d.name);

  return {
    type: "comps",
    data,
    meta: {
      title: "Specialty Chemicals — Trading Comparables",
      subtitle: "Public peer multiples and growth (LTM)",
    },
    questions: [
      {
        prompt: "What is the median EV/EBITDA multiple in this peer set?",
        opts: makeOpts(rng, `${medianEvEbitda}x`, [
          `${round(medianEvEbitda + 2.1, 1)}x`,
          `${Math.max(round(medianEvEbitda - 1.8, 1), 0.5)}x`,
          `${round(medianEvEbitda + 4.5, 1)}x`,
        ]),
        skills: [SKILLS.VALUATION, SKILLS.RATIO],
        difficulty,
        explain: `Sort the EV/EBITDA values and take the middle. Median ≈ ${medianEvEbitda}x.`,
      },
      {
        prompt: "Which peer would you most expect to trade at a premium multiple, all else equal?",
        opts: makeOpts(rng, fastestGrower.name, distractors),
        skills: [SKILLS.VALUATION, SKILLS.TREND],
        difficulty,
        explain: `${fastestGrower.name} shows the fastest growth (${fastestGrower.growth}%). Higher growth typically commands higher multiples.`,
      },
    ],
  };
}

const CHART_GENERATORS = [
  { gen: genRevenueMargin, skills: [SKILLS.TREND, SKILLS.GROWTH, SKILLS.MARGIN] },
  { gen: genCashFlowBridge, skills: [SKILLS.CASHFLOW, SKILLS.COMPOSITION] },
  { gen: genMarginBridge, skills: [SKILLS.VARIANCE, SKILLS.MARGIN] },
  { gen: genCohortRetention, skills: [SKILLS.COHORT, SKILLS.TREND] },
  { gen: genSensitivity, skills: [SKILLS.SENSITIVITY, SKILLS.VALUATION] },
  { gen: genWorkingCapital, skills: [SKILLS.WORKING_CAP, SKILLS.CASHFLOW] },
  { gen: genBalanceSheet, skills: [SKILLS.COMPOSITION, SKILLS.RATIO] },
  { gen: genValuationComps, skills: [SKILLS.VALUATION, SKILLS.RATIO] },
];

// ═══════════════════════════════════════════════════════════════════════════
// TEST BUILDER — pick 3 charts biased toward weak skills; set difficulty
// per current ability for the skills covered.
// ═══════════════════════════════════════════════════════════════════════════
function buildTest(profile, rng) {
  const skillsRanked = SKILL_LIST
    .map((s) => ({ skill: s, ability: profile.ability[s] }))
    .sort((a, b) => a.ability - b.ability);
  const weakSkills = new Set(skillsRanked.slice(0, 5).map((s) => s.skill));

  const scored = CHART_GENERATORS.map((g, idx) => {
    const overlap = g.skills.filter((s) => weakSkills.has(s)).length;
    return { idx, score: overlap + rng() * 0.4 };
  }).sort((a, b) => b.score - a.score);

  const chosenIdxs = scored.slice(0, 3).map((s) => s.idx);
  return chosenIdxs.map((idx) => {
    const skillAbilities = CHART_GENERATORS[idx].skills.map((s) => profile.ability[s]);
    const avgAbility = skillAbilities.reduce((a, b) => a + b, 0) / skillAbilities.length;
    const diff = Math.min(0.95, Math.max(0.15, avgAbility + 0.1));
    return CHART_GENERATORS[idx].gen(rng, diff);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════════════════
const C = {
  bg: "#f4ede0",
  ink: "#2d2a1f",
  ink2: "#5a5547",
  ink3: "#8a8474",
  accent: "#c45a3e",
  accent2: "#7a8b5c",
  accent3: "#d4a857",
  accent4: "#5a7287",
  line: "#d4cab5",
  card: "#faf6ec",
  cardDim: "#ede4d0",
  good: "#6b8a4f",
  bad: "#b04a3a",
};

const F = {
  display: "'Cormorant Garamond', Georgia, serif",
  body: "'Inter', sans-serif",
  mono: "'JetBrains Mono', monospace",
};

// ═══════════════════════════════════════════════════════════════════════════
// CHART RENDERERS
// ═══════════════════════════════════════════════════════════════════════════
function ChartShell({ meta, children }) {
  return (
    <div style={{ background: C.card, padding: "28px 32px", border: `1px solid ${C.line}`, borderRadius: 4 }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontFamily: F.display, fontSize: 22, color: C.ink, fontWeight: 500, letterSpacing: -0.2 }}>
          {meta.title}
        </div>
        <div style={{ fontFamily: F.body, fontSize: 12, color: C.ink3, marginTop: 2, letterSpacing: 0.3 }}>
          {meta.subtitle}
        </div>
      </div>
      {children}
    </div>
  );
}

function RevenueMarginChart({ data, meta }) {
  return (
    <ChartShell meta={meta}>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 10, right: 30, bottom: 5, left: 0 }}>
          <CartesianGrid stroke={C.line} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="period" stroke={C.ink3} tick={{ fontSize: 11, fontFamily: F.body }} axisLine={{ stroke: C.line }} />
          <YAxis yAxisId="left" stroke={C.ink3} tick={{ fontSize: 11, fontFamily: F.body }} axisLine={{ stroke: C.line }} />
          <YAxis yAxisId="right" orientation="right" stroke={C.ink3} tick={{ fontSize: 11, fontFamily: F.body }} axisLine={{ stroke: C.line }} unit="%" />
          <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.line}`, fontFamily: F.body, fontSize: 12 }} />
          <Bar yAxisId="left" dataKey="revenue" fill={C.accent3} name="Revenue ($M)" radius={[2, 2, 0, 0]} />
          <Line yAxisId="right" type="monotone" dataKey="grossMargin" stroke={C.accent} strokeWidth={2} name="Gross Margin %" dot={{ r: 3, fill: C.accent }} />
          <Line yAxisId="right" type="monotone" dataKey="opMargin" stroke={C.accent4} strokeWidth={2} name="Op Margin %" dot={{ r: 3, fill: C.accent4 }} />
        </ComposedChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", gap: 18, justifyContent: "center", marginTop: 8, fontFamily: F.body, fontSize: 11, color: C.ink2 }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: C.accent3, marginRight: 6 }} />Revenue</span>
        <span><span style={{ display: "inline-block", width: 10, height: 2, background: C.accent, marginRight: 6, verticalAlign: "middle" }} />Gross Margin</span>
        <span><span style={{ display: "inline-block", width: 10, height: 2, background: C.accent4, marginRight: 6, verticalAlign: "middle" }} />Op Margin</span>
      </div>
    </ChartShell>
  );
}

function WaterfallChart({ data, meta }) {
  return (
    <ChartShell meta={meta}>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 10, right: 20, bottom: 30, left: 0 }}>
          <CartesianGrid stroke={C.line} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="label" stroke={C.ink3} tick={{ fontSize: 10, fontFamily: F.body }} axisLine={{ stroke: C.line }} interval={0} angle={-18} textAnchor="end" height={60} />
          <YAxis stroke={C.ink3} tick={{ fontSize: 11, fontFamily: F.body }} axisLine={{ stroke: C.line }} />
          <Tooltip
            contentStyle={{ background: C.card, border: `1px solid ${C.line}`, fontFamily: F.body, fontSize: 12 }}
            formatter={(v, n, p) => [`${p.payload.value > 0 ? "+" : ""}${p.payload.value}`, p.payload.label]}
          />
          <Bar dataKey="base" stackId="a" fill="transparent" />
          <Bar dataKey="bar" stackId="a" radius={[2, 2, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={
                d.type === "in" ? C.good :
                d.type === "out" ? C.bad :
                d.type === "total" ? C.accent4 :
                d.type === "start" || d.type === "end" ? C.ink : C.ink3
              } />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

function CohortHeatmap({ data, periods, meta }) {
  const all = data.flatMap((d) => d.values.filter((v) => v !== null));
  const min = Math.min(...all), max = Math.max(...all);
  const color = (v) => {
    if (v === null) return C.cardDim;
    const t = (v - min) / (max - min || 1);
    const r = Math.round(122 + (212 - 122) * (1 - t));
    const g = Math.round(139 + (168 - 139) * (1 - t));
    const b = Math.round(92 + (87 - 92) * (1 - t));
    return `rgb(${r},${g},${b})`;
  };
  return (
    <ChartShell meta={meta}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontFamily: F.mono, fontSize: 12, width: "100%" }}>
          <thead>
            <tr>
              <th style={{ padding: 8, textAlign: "left", color: C.ink3, fontWeight: 500, fontSize: 11 }}>Cohort</th>
              {periods.map((p) => <th key={p} style={{ padding: 8, color: C.ink3, fontWeight: 500, fontSize: 11 }}>{p}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.cohort}>
                <td style={{ padding: 8, fontWeight: 500, color: C.ink }}>{row.cohort}</td>
                {row.values.map((v, i) => (
                  <td key={i} style={{
                    padding: 12, textAlign: "center",
                    background: v === null ? "transparent" : color(v),
                    color: v === null ? C.ink3 : "#fff",
                    fontWeight: 500, border: `1px solid ${C.bg}`,
                  }}>
                    {v === null ? "—" : `${v}%`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartShell>
  );
}

function SensitivityTable({ data, tg, meta }) {
  const all = data.flatMap((d) => d.values);
  const min = Math.min(...all), max = Math.max(...all);
  const color = (v) => {
    const t = (v - min) / (max - min || 1);
    const r = Math.round(237 - (237 - 122) * t);
    const g = Math.round(228 - (228 - 139) * t);
    const b = Math.round(208 - (208 - 92) * t);
    return `rgb(${r},${g},${b})`;
  };
  return (
    <ChartShell meta={meta}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontFamily: F.mono, fontSize: 13, width: "100%" }}>
          <thead>
            <tr>
              <th style={{ padding: 8, color: C.ink3, fontSize: 11, fontWeight: 500 }}>WACC ↓ / TG →</th>
              {tg.map((g) => <th key={g} style={{ padding: 8, color: C.ink3, fontSize: 11, fontWeight: 500 }}>{g}%</th>)}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.wacc}>
                <td style={{ padding: 8, color: C.ink, fontWeight: 500 }}>{row.wacc}%</td>
                {row.values.map((v, i) => (
                  <td key={i} style={{
                    padding: 14, textAlign: "center",
                    background: color(v),
                    color: C.ink, fontWeight: 500, border: `1px solid ${C.bg}`,
                  }}>
                    ${v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartShell>
  );
}

function WorkingCapitalChart({ data, meta }) {
  return (
    <ChartShell meta={meta}>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 10, right: 30, bottom: 5, left: 0 }}>
          <CartesianGrid stroke={C.line} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="period" stroke={C.ink3} tick={{ fontSize: 11, fontFamily: F.body }} axisLine={{ stroke: C.line }} />
          <YAxis stroke={C.ink3} tick={{ fontSize: 11, fontFamily: F.body }} axisLine={{ stroke: C.line }} unit="d" />
          <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.line}`, fontFamily: F.body, fontSize: 12 }} />
          <Line type="monotone" dataKey="DSO" stroke={C.accent} strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="DIO" stroke={C.accent3} strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="DPO" stroke={C.accent2} strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="CCC" stroke={C.ink} strokeWidth={2.5} dot={{ r: 4 }} strokeDasharray="4 2" />
        </LineChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", gap: 18, justifyContent: "center", marginTop: 8, fontFamily: F.body, fontSize: 11, color: C.ink2, flexWrap: "wrap" }}>
        {[["DSO", C.accent], ["DIO", C.accent3], ["DPO", C.accent2], ["CCC", C.ink]].map(([n, c]) => (
          <span key={n}><span style={{ display: "inline-block", width: 12, height: 2, background: c, marginRight: 6, verticalAlign: "middle" }} />{n}</span>
        ))}
      </div>
    </ChartShell>
  );
}

function BalanceSheetChart({ data, meta }) {
  const palette = [C.accent2, C.accent3, C.accent, C.accent4, C.ink2];
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <ChartShell meta={meta}>
      <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 240px", minWidth: 240 }}>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={95} paddingAngle={1}>
                {data.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.line}`, fontFamily: F.body, fontSize: 12 }} formatter={(v) => `$${v}M`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={{ flex: "1 1 280px", fontFamily: F.mono, fontSize: 12 }}>
          {data.map((d, i) => (
            <div key={d.name} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px dashed ${C.line}` }}>
              <span style={{ color: C.ink2 }}>
                <span style={{ display: "inline-block", width: 10, height: 10, background: palette[i], marginRight: 8, verticalAlign: "middle" }} />
                {d.name}
              </span>
              <span style={{ color: C.ink, fontWeight: 500 }}>
                ${d.value}M
                <span style={{ color: C.ink3, marginLeft: 8, fontSize: 11 }}>{round((d.value / total) * 100, 1)}%</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </ChartShell>
  );
}

function CompsTable({ data, meta }) {
  return (
    <ChartShell meta={meta}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: F.mono, fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.line}` }}>
              {["Company", "EV / Revenue", "EV / EBITDA", "P / E", "Growth %"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "10px 12px", color: C.ink3, fontWeight: 500, fontSize: 11, letterSpacing: 0.3 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.name} style={{ borderBottom: `1px dashed ${C.line}` }}>
                <td style={{ padding: "10px 12px", color: C.ink, fontWeight: 500 }}>{d.name}</td>
                <td style={{ padding: "10px 12px", color: C.ink2 }}>{d.evRev}x</td>
                <td style={{ padding: "10px 12px", color: C.ink2 }}>{d.evEbitda}x</td>
                <td style={{ padding: "10px 12px", color: C.ink2 }}>{d.pe}x</td>
                <td style={{ padding: "10px 12px", color: d.growth > 15 ? C.good : C.ink2 }}>{d.growth}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartShell>
  );
}

function renderChart(chart) {
  switch (chart.type) {
    case "revenueMargin": return <RevenueMarginChart {...chart} />;
    case "cashWaterfall": return <WaterfallChart {...chart} />;
    case "marginBridge": return <WaterfallChart {...chart} />;
    case "cohortRetention": return <CohortHeatmap {...chart} />;
    case "sensitivity": return <SensitivityTable {...chart} />;
    case "workingCapital": return <WorkingCapitalChart {...chart} />;
    case "balanceSheet": return <BalanceSheetChart {...chart} />;
    case "comps": return <CompsTable {...chart} />;
    default: return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SCREENS
// ═══════════════════════════════════════════════════════════════════════════
const DAILY_LIMIT = 5;

function Home({ profile, onStart, onReset, loading }) {
  const today = new Date().toISOString().slice(0, 10);
  const isNewDay = profile.testsDate !== today;
  const testsLeft = isNewDay ? DAILY_LIMIT : Math.max(0, DAILY_LIMIT - profile.testsToday);

  const sorted = SKILL_LIST.map((s) => ({
    skill: s,
    ability: profile.ability[s],
    attempts: profile.attempts[s] || 0,
  })).sort((a, b) => a.ability - b.ability);

  const overall = round(
    SKILL_LIST.reduce((sum, s) => sum + profile.ability[s], 0) / SKILL_LIST.length * 100, 0
  );

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "60px 32px 80px" }}>
      <div style={{ marginBottom: 48 }}>
        <div style={{ fontFamily: F.mono, fontSize: 10, color: C.ink3, letterSpacing: 2, textTransform: "uppercase" }}>
          Daily Practice · Financial Chart Reading
        </div>
        <h1 style={{
          fontFamily: F.display, fontSize: 56, lineHeight: 1.05, color: C.ink,
          margin: "12px 0 16px", fontWeight: 500, letterSpacing: -1.2,
        }}>
          Train your eye.<br />
          <em style={{ color: C.accent }}>Read the numbers.</em>
        </h1>
        <p style={{ fontFamily: F.body, fontSize: 16, color: C.ink2, maxWidth: 560, lineHeight: 1.6 }}>
          A timed assessment for finance and accounting interviews. Each session presents three charts or tables
          modeled on the questions analysts actually face. Your responses reshape what comes next.
        </p>
      </div>

      <div style={{
        background: C.card, border: `1px solid ${C.line}`, padding: 32, borderRadius: 4,
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginBottom: 24,
      }}>
        <div>
          <div style={{ fontFamily: F.mono, fontSize: 10, color: C.ink3, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
            Today
          </div>
          <div style={{ fontFamily: F.display, fontSize: 42, color: C.ink, fontWeight: 500 }}>
            {testsLeft}<span style={{ color: C.ink3, fontSize: 24 }}> / {DAILY_LIMIT}</span>
          </div>
          <div style={{ fontFamily: F.body, fontSize: 13, color: C.ink2 }}>tests remaining</div>
        </div>
        <div>
          <div style={{ fontFamily: F.mono, fontSize: 10, color: C.ink3, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
            Overall Calibration
          </div>
          <div style={{ fontFamily: F.display, fontSize: 42, color: C.ink, fontWeight: 500 }}>
            {overall}<span style={{ color: C.ink3, fontSize: 24 }}>%</span>
          </div>
          <div style={{ fontFamily: F.body, fontSize: 13, color: C.ink2 }}>across {SKILL_LIST.length} skill dimensions</div>
        </div>
      </div>

      <button
        onClick={onStart}
        disabled={testsLeft === 0 || loading}
        style={{
          width: "100%", padding: "20px 24px",
          background: testsLeft === 0 ? C.cardDim : C.ink,
          color: testsLeft === 0 ? C.ink3 : C.bg,
          border: "none", borderRadius: 4, cursor: testsLeft === 0 ? "not-allowed" : "pointer",
          fontFamily: F.body, fontSize: 15, fontWeight: 500, letterSpacing: 0.3,
          marginBottom: 48, transition: "background 0.2s",
        }}
        onMouseEnter={(e) => { if (testsLeft > 0 && !loading) e.currentTarget.style.background = C.accent; }}
        onMouseLeave={(e) => { if (testsLeft > 0 && !loading) e.currentTarget.style.background = C.ink; }}
      >
        {loading ? "Preparing test…" : testsLeft === 0 ? "Daily limit reached — return tomorrow" : "Begin today's session →"}
      </button>

      <div>
        <div style={{ fontFamily: F.mono, fontSize: 10, color: C.ink3, letterSpacing: 2, textTransform: "uppercase", marginBottom: 20 }}>
          Skill Profile
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.line}`, padding: 24, borderRadius: 4 }}>
          {sorted.map((s, i) => (
            <div key={s.skill} style={{
              display: "flex", alignItems: "center", padding: "10px 0",
              borderBottom: i < sorted.length - 1 ? `1px dashed ${C.line}` : "none",
            }}>
              <div style={{ fontFamily: F.mono, fontSize: 10, color: C.ink3, width: 28 }}>
                {String(i + 1).padStart(2, "0")}
              </div>
              <div style={{ flex: 1, fontFamily: F.body, fontSize: 13, color: C.ink }}>
                {s.skill}
              </div>
              <div style={{ flex: 2, marginRight: 16 }}>
                <div style={{ height: 4, background: C.cardDim, borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${s.ability * 100}%`,
                    background: s.ability < 0.4 ? C.accent : s.ability < 0.7 ? C.accent3 : C.accent2,
                    transition: "width 0.6s",
                  }} />
                </div>
              </div>
              <div style={{ fontFamily: F.mono, fontSize: 11, color: C.ink2, width: 60, textAlign: "right" }}>
                {round(s.ability * 100, 0)}%
              </div>
              <div style={{ fontFamily: F.mono, fontSize: 10, color: C.ink3, width: 50, textAlign: "right" }}>
                n={s.attempts}
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontFamily: F.body, fontSize: 12, color: C.ink3, marginTop: 12, lineHeight: 1.6 }}>
          The adaptive engine targets your weakest skills first and calibrates difficulty just above your current ability. The more you practice, the sharper the estimate becomes.
        </div>
      </div>

      <div style={{ marginTop: 48, paddingTop: 32, borderTop: `1px solid ${C.line}` }}>
        <div style={{ fontFamily: F.mono, fontSize: 10, color: C.ink3, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
          Profile Management
        </div>
        <div style={{
          background: C.card, border: `1px solid ${C.line}`, padding: 20, borderRadius: 4,
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap",
        }}>
          <div style={{ flex: "1 1 280px" }}>
            <div style={{ fontFamily: F.display, fontSize: 18, color: C.ink, fontWeight: 500, marginBottom: 4 }}>
              Reset profile
            </div>
            <div style={{ fontFamily: F.body, fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>
              Erases all skill scores, attempt counts, and history. Useful when handing this off to another person, or starting over from scratch.
            </div>
          </div>
          <button
            onClick={() => {
              if (confirm("Reset all profile data? This cannot be undone.")) {
                onReset();
              }
            }}
            style={{
              padding: "12px 24px",
              background: "transparent",
              color: C.bad,
              border: `1px solid ${C.bad}`,
              borderRadius: 4, cursor: "pointer",
              fontFamily: F.body, fontSize: 13, fontWeight: 500, letterSpacing: 0.3,
              transition: "background 0.15s, color 0.15s",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = C.bad; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.bad; }}
          >
            Reset profile
          </button>
        </div>
      </div>
    </div>
  );
}

function TestRunner({ charts, onComplete, onExit }) {
  const TIME_LIMIT = 9 * 60;
  const BELL_AT = 60; // bell sounds when this many seconds remain
  const [secondsLeft, setSecondsLeft] = useState(TIME_LIMIT);
  const [chartIdx, setChartIdx] = useState(0);
  const [qIdx, setQIdx] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [muted, setMuted] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const audioCtxRef = useRef(null);
  const bellPlayedRef = useRef(false);

  // Lazily initialize AudioContext on first use. Browsers require this to
  // happen after a user gesture; clicking "Begin Session" satisfied that.
  const getCtx = () => {
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtxRef.current = new AC();
    }
    return audioCtxRef.current;
  };

  // Clock tick — short noise burst through a bandpass filter, like a wall clock
  // We alternate two slightly different tones (tick/tock) for that classic two-beat feel
  const tickToggleRef = useRef(false);
  const playTick = () => {
    if (muted) return;
    const ctx = getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    tickToggleRef.current = !tickToggleRef.current;
    const isTick = tickToggleRef.current;

    // Short noise buffer (~25ms)
    const bufferSize = Math.floor(ctx.sampleRate * 0.025);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const out = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      // White noise with a sharp envelope: rises in 1ms, decays exponentially
      const envelope = Math.exp(-i / (ctx.sampleRate * 0.004));
      out[i] = (Math.random() * 2 - 1) * envelope;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Bandpass filter: tick is brighter (higher), tock is duller (lower)
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = isTick ? 2800 : 2100;
    filter.Q.value = 4;

    const gain = ctx.createGain();
    gain.gain.value = 0.18;

    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(now);
    source.stop(now + 0.03);
  };

  // Bell — two-tone chime, longer decay, more attention-grabbing
  const playBell = () => {
    if (muted) return;
    const ctx = getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [1318.5, 1760].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + i * 0.08);
      gain.gain.setValueAtTime(0, now + i * 0.08);
      gain.gain.linearRampToValueAtTime(0.18, now + i * 0.08 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 1.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 1.3);
    });
  };

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          onComplete(answers);
          return 0;
        }
        const next = s - 1;
        // Fire bell once when crossing the 60-second mark
        if (next === BELL_AT && !bellPlayedRef.current) {
          bellPlayedRef.current = true;
          playBell();
        } else {
          playTick();
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line
  }, [answers, muted]);

  const chart = charts[chartIdx];
  const question = chart.questions[qIdx];
  const totalQuestions = charts.reduce((sum, c) => sum + c.questions.length, 0);
  const answeredCount = answers.length;

  const submit = () => {
    if (selected === null) return;
    const correctIdx = question.opts.findIndex((o) => o.correct);
    const isCorrect = selected === correctIdx;
    const newAnswers = [...answers, {
      chartType: chart.type,
      skills: question.skills,
      difficulty: question.difficulty,
      correct: isCorrect,
      prompt: question.prompt,
      selected,
      correctIdx,
      explain: question.explain,
      opts: question.opts,
    }];
    setAnswers(newAnswers);
    setSelected(null);

    if (qIdx + 1 < chart.questions.length) {
      setQIdx(qIdx + 1);
    } else if (chartIdx + 1 < charts.length) {
      setChartIdx(chartIdx + 1);
      setQIdx(0);
    } else {
      onComplete(newAnswers);
    }
  };

  const min = Math.floor(secondsLeft / 60);
  const sec = secondsLeft % 60;
  const timeStr = `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  const timeRunningOut = secondsLeft < 60;

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "32px 32px 60px" }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 32, paddingBottom: 16, borderBottom: `1px solid ${C.line}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <button
            onClick={() => setShowExitConfirm(true)}
            title="Back to dashboard"
            style={{
              background: "transparent", border: `1px solid ${C.line}`, borderRadius: 4,
              padding: "8px 12px", cursor: "pointer",
              fontFamily: F.mono, fontSize: 12, color: C.ink2, letterSpacing: 1,
              transition: "border-color 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.ink; e.currentTarget.style.color = C.ink; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.color = C.ink2; }}
          >
            ← Back
          </button>
          <div>
            <div style={{ fontFamily: F.mono, fontSize: 10, color: C.ink3, letterSpacing: 2, textTransform: "uppercase" }}>
              Chart {chartIdx + 1} of {charts.length} · Question {answeredCount + 1} of {totalQuestions}
            </div>
            <div style={{ marginTop: 8, height: 3, background: C.cardDim, borderRadius: 2, width: 240 }}>
              <div style={{
                height: "100%", width: `${(answeredCount / totalQuestions) * 100}%`,
                background: C.accent, borderRadius: 2, transition: "width 0.3s",
              }} />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button
            onClick={() => setMuted((m) => !m)}
            title={muted ? "Unmute" : "Mute"}
            style={{
              background: "transparent", border: `1px solid ${C.line}`, borderRadius: 4,
              padding: "8px 10px", cursor: "pointer",
              fontFamily: F.mono, fontSize: 11, color: C.ink2, letterSpacing: 1,
              transition: "border-color 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.ink2; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.line; }}
          >
            {muted ? "🔇" : "🔔"}
          </button>
          <div style={{
            fontFamily: F.mono, fontSize: 28,
            color: timeRunningOut ? C.bad : C.ink, fontWeight: 500, letterSpacing: 1, textAlign: "right",
          }}>
            {timeStr}
            <div style={{ fontSize: 9, color: C.ink3, letterSpacing: 2, marginTop: -4 }}>
              REMAINING
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 28 }}>{renderChart(chart)}</div>

      <div style={{ background: C.card, border: `1px solid ${C.line}`, padding: 28, borderRadius: 4 }}>
        <div style={{ fontFamily: F.mono, fontSize: 10, color: C.ink3, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>
          Question {qIdx + 1} of {chart.questions.length} · {question.skills.join(" · ")}
        </div>
        <div style={{
          fontFamily: F.display, fontSize: 22,
          color: C.ink, lineHeight: 1.4, marginBottom: 24, fontWeight: 500,
        }}>
          {question.prompt}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {question.opts.map((opt, i) => {
            const isSelected = selected === i;
            return (
              <button
                key={i}
                onClick={() => setSelected(i)}
                style={{
                  padding: "16px 20px", textAlign: "left",
                  background: isSelected ? C.ink : "transparent",
                  color: isSelected ? C.bg : C.ink,
                  border: `1px solid ${isSelected ? C.ink : C.line}`,
                  borderRadius: 4, cursor: "pointer",
                  fontFamily: F.mono, fontSize: 13,
                  transition: "border-color 0.15s, background 0.15s",
                  display: "flex", alignItems: "center", gap: 12,
                }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.borderColor = C.ink2; }}
                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.borderColor = C.line; }}
              >
                <span style={{ color: isSelected ? C.accent3 : C.ink3, fontWeight: 500 }}>
                  {String.fromCharCode(65 + i)}
                </span>
                <span>{opt.t}</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
          <button
            onClick={submit}
            disabled={selected === null}
            style={{
              padding: "14px 32px",
              background: selected === null ? C.cardDim : C.accent,
              color: selected === null ? C.ink3 : "#fff",
              border: "none", borderRadius: 4, cursor: selected === null ? "not-allowed" : "pointer",
              fontFamily: F.body, fontSize: 14, fontWeight: 500, letterSpacing: 0.5,
            }}
          >
            Submit & Continue →
          </button>
        </div>
      </div>

      {showExitConfirm && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(45, 42, 31, 0.55)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
          padding: 20,
        }}>
          <div style={{
            background: C.card, border: `1px solid ${C.line}`, borderRadius: 4,
            padding: 32, maxWidth: 460, width: "100%",
            boxShadow: "0 20px 60px rgba(45, 42, 31, 0.25)",
          }}>
            <div style={{ fontFamily: F.display, fontSize: 24, color: C.ink, fontWeight: 500, marginBottom: 12, letterSpacing: -0.3 }}>
              Exit this test?
            </div>
            <div style={{ fontFamily: F.body, fontSize: 14, color: C.ink2, lineHeight: 1.6, marginBottom: 24 }}>
              Your progress on this session will be lost, and the test will count toward your daily limit of 5.
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowExitConfirm(false)}
                style={{
                  padding: "12px 20px", background: "transparent", color: C.ink,
                  border: `1px solid ${C.line}`, borderRadius: 4, cursor: "pointer",
                  fontFamily: F.body, fontSize: 13, fontWeight: 500,
                }}
              >
                Stay in test
              </button>
              <button
                onClick={() => { setShowExitConfirm(false); onExit(); }}
                style={{
                  padding: "12px 20px", background: C.bad, color: "#fff",
                  border: "none", borderRadius: 4, cursor: "pointer",
                  fontFamily: F.body, fontSize: 13, fontWeight: 500,
                }}
              >
                Exit test
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Results({ answers, profile, prevProfile, onHome }) {
  const correct = answers.filter((a) => a.correct).length;
  const total = answers.length;
  const score = round((correct / Math.max(total, 1)) * 100, 0);

  const deltas = SKILL_LIST.map((s) => ({
    skill: s,
    before: prevProfile.ability[s],
    after: profile.ability[s],
    delta: profile.ability[s] - prevProfile.ability[s],
    attempts: answers.filter((a) => a.skills.includes(s)).length,
  })).filter((d) => d.attempts > 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "32px 32px 80px" }}>
      <div style={{ marginBottom: 32 }}>
        <button
          onClick={onHome}
          style={{
            background: "transparent", border: `1px solid ${C.line}`, borderRadius: 4,
            padding: "8px 12px", cursor: "pointer",
            fontFamily: F.mono, fontSize: 12, color: C.ink2, letterSpacing: 1,
            transition: "border-color 0.15s, color 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.ink; e.currentTarget.style.color = C.ink; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.color = C.ink2; }}
        >
          ← Back to dashboard
        </button>
      </div>
      <div style={{ marginBottom: 40 }}>
        <div style={{ fontFamily: F.mono, fontSize: 10, color: C.ink3, letterSpacing: 2, textTransform: "uppercase" }}>
          Session Complete
        </div>
        <h1 style={{
          fontFamily: F.display, fontSize: 52, lineHeight: 1.05,
          color: C.ink, margin: "12px 0", fontWeight: 500, letterSpacing: -1,
        }}>
          You answered <em style={{ color: C.accent }}>{correct} of {total}</em>
        </h1>
        <div style={{ fontFamily: F.mono, fontSize: 14, color: C.ink2 }}>
          {score}% accuracy this session
        </div>
      </div>

      <div style={{ marginBottom: 40 }}>
        <div style={{ fontFamily: F.mono, fontSize: 10, color: C.ink3, letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>
          How your profile shifted
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.line}`, padding: 24, borderRadius: 4 }}>
          {deltas.map((d, i) => (
            <div key={d.skill} style={{
              display: "flex", alignItems: "center", padding: "10px 0",
              borderBottom: i < deltas.length - 1 ? `1px dashed ${C.line}` : "none",
            }}>
              <div style={{ flex: 1, fontFamily: F.body, fontSize: 13, color: C.ink }}>{d.skill}</div>
              <div style={{ fontFamily: F.mono, fontSize: 12, color: C.ink3, width: 80, textAlign: "right" }}>
                {round(d.before * 100, 0)}% →
              </div>
              <div style={{ fontFamily: F.mono, fontSize: 12, width: 70, textAlign: "right", color: C.ink, fontWeight: 500 }}>
                {round(d.after * 100, 0)}%
              </div>
              <div style={{
                fontFamily: F.mono, fontSize: 11, width: 70, textAlign: "right",
                color: d.delta > 0 ? C.good : d.delta < 0 ? C.bad : C.ink3,
              }}>
                {d.delta > 0 ? "▲" : d.delta < 0 ? "▼" : "—"} {round(Math.abs(d.delta) * 100, 1)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 40 }}>
        <div style={{ fontFamily: F.mono, fontSize: 10, color: C.ink3, letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>
          Review
        </div>
        {answers.map((a, i) => (
          <div key={i} style={{
            background: C.card, border: `1px solid ${C.line}`, padding: 24, borderRadius: 4, marginBottom: 12,
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: a.correct ? C.good : C.bad, color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: F.mono, fontSize: 14, fontWeight: 500, flexShrink: 0,
              }}>
                {a.correct ? "✓" : "×"}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: F.display, fontSize: 17, color: C.ink, marginBottom: 8 }}>
                  {a.prompt}
                </div>
                <div style={{ fontFamily: F.mono, fontSize: 12, color: C.ink3, marginBottom: 8 }}>
                  Your answer: <span style={{ color: a.correct ? C.good : C.bad }}>{a.opts[a.selected].t}</span>
                  {!a.correct && <> · Correct: <span style={{ color: C.good }}>{a.opts[a.correctIdx].t}</span></>}
                </div>
                <div style={{
                  fontFamily: F.body, fontSize: 13, color: C.ink2, lineHeight: 1.6,
                  paddingTop: 8, borderTop: `1px dashed ${C.line}`,
                }}>
                  {a.explain}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onHome}
        style={{
          width: "100%", padding: "18px 24px",
          background: C.ink, color: C.bg,
          border: "none", borderRadius: 4, cursor: "pointer",
          fontFamily: F.body, fontSize: 14, fontWeight: 500, letterSpacing: 0.5,
        }}
      >
        Return to dashboard
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// APP ROOT — persistence, routing, daily reset
// ═══════════════════════════════════════════════════════════════════════════
const STORAGE_KEY = "finchart_profile_v1";

export default function App() {
  const [screen, setScreen] = useState("loading");
  const [profile, setProfile] = useState(DEFAULT_PROFILE());
  const [prevProfile, setPrevProfile] = useState(DEFAULT_PROFILE());
  const [charts, setCharts] = useState(null);
  const [answers, setAnswers] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        let parsed = JSON.parse(stored);
        const today = new Date().toISOString().slice(0, 10);
        if (parsed.testsDate !== today) {
          parsed = { ...parsed, testsToday: 0, testsDate: today };
        }
        const def = DEFAULT_PROFILE();
        SKILL_LIST.forEach((s) => {
          if (parsed.ability[s] === undefined) parsed.ability[s] = def.ability[s];
          if (parsed.attempts[s] === undefined) parsed.attempts[s] = 0;
          if (parsed.correct[s] === undefined) parsed.correct[s] = 0;
        });
        setProfile(parsed);
      }
    } catch (e) {
      // No stored profile — first run
    }
    setScreen("home");
  }, []);

  const save = (p) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch (e) {
      console.error("Save failed:", e);
    }
  };

  const startTest = () => {
    setLoading(true);
    const seed = Date.now() & 0xffffffff;
    const rng = mulberry32(seed);
    const newCharts = buildTest(profile, rng);
    setCharts(newCharts);
    setPrevProfile(JSON.parse(JSON.stringify(profile)));
    setTimeout(() => {
      setLoading(false);
      setScreen("test");
    }, 400);
  };

  const completeTest = async (sessionAnswers) => {
    let updated = { ...profile };
    sessionAnswers.forEach((a) => {
      updated = updateAbility(updated, a.skills, a.correct, a.difficulty);
    });
    updated = {
      ...updated,
      testsToday: (updated.testsToday || 0) + 1,
      testsDate: new Date().toISOString().slice(0, 10),
      history: [
        ...(updated.history || []),
        {
          date: new Date().toISOString(),
          correct: sessionAnswers.filter((a) => a.correct).length,
          total: sessionAnswers.length,
        },
      ].slice(-30),
    };
    setProfile(updated);
    setAnswers(sessionAnswers);
    save(updated);
    setScreen("results");
  };

  const exitTest = async () => {
    // Abandoning still consumes a daily test so this can't be used to reroll charts
    const updated = {
      ...profile,
      testsToday: (profile.testsToday || 0) + 1,
      testsDate: new Date().toISOString().slice(0, 10),
    };
    setProfile(updated);
    setCharts(null);
    setAnswers(null);
    save(updated);
    setScreen("home");
  };

  const resetProfile = async () => {
    const fresh = DEFAULT_PROFILE();
    try {
      save(fresh);
    } catch (e) {
      console.error("Reset save failed:", e);
    }
    setProfile(fresh);
    setPrevProfile(fresh);
    setCharts(null);
    setAnswers(null);
    setScreen("home");
  };

  if (screen === "loading") {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: F.mono, fontSize: 12, color: C.ink3, letterSpacing: 2 }}>
          LOADING PROFILE…
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        body { margin: 0; background: ${C.bg}; }
        * { box-sizing: border-box; }
      `}</style>
      <div style={{ minHeight: "100vh", background: C.bg, color: C.ink }}>
        <div style={{
          padding: "20px 32px", borderBottom: `1px solid ${C.line}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 24, height: 24, background: C.ink,
              clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
            }} />
            <div style={{ fontFamily: F.display, fontSize: 18, color: C.ink, fontWeight: 500, letterSpacing: 0.5 }}>
              Analyst Playground
            </div>
            <div style={{
              fontFamily: F.mono, fontSize: 9, color: C.ink3,
              letterSpacing: 2, textTransform: "uppercase",
              borderLeft: `1px solid ${C.line}`, paddingLeft: 12, marginLeft: 4,
            }}>
              Chart Reading · Beta
            </div>
          </div>
          <div style={{ fontFamily: F.mono, fontSize: 10, color: C.ink3, letterSpacing: 1.5 }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </div>
        </div>

        {screen === "home" && <Home profile={profile} onStart={startTest} onReset={resetProfile} loading={loading} />}
        {screen === "test" && charts && <TestRunner charts={charts} onComplete={completeTest} onExit={exitTest} />}
        {screen === "results" && answers && (
          <Results
            answers={answers}
            profile={profile}
            prevProfile={prevProfile}
            onHome={() => { setScreen("home"); setCharts(null); setAnswers(null); }}
          />
        )}
      </div>
    </>
  );
}
