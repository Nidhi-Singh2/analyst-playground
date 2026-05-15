import React, { useState, useEffect, useRef } from "react";
import {
  BarChart, Bar, LineChart, Line, ComposedChart,
  XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, ScatterChart, Scatter, ReferenceLine,
} from "recharts";

// ═══════════════════════════════════════════════════════════════════════════
// SKILL DIMENSIONS — every question is tagged. Adaptive engine maintains
// an ability estimate per skill and selects next items accordingly.
// ═══════════════════════════════════════════════════════════════════════════
// General finance skills (used in "General" mode)
const GENERAL_SKILLS = {
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

// Airline revenue management skills (used in "Airline" mode)
const AIRLINE_SKILLS = {
  BOOKING_CURVE: "Booking Curve Reading",
  PACING: "Pacing Analysis",
  LF_YIELD: "Load Factor / Yield Trade-off",
  FARE_MIX: "Fare Class Mix",
  COMP_FARE: "Competitive Fare Action",
  GAME_THEORY: "Competitive Game Theory",
  RASM: "RASM / Unit Revenue",
  FORECAST: "Demand Forecasting",
  CAPACITY: "Capacity & Schedule",
  VARIANCE_AIR: "Variance Attribution (RM)",
  SEGMENTATION: "Market Segmentation",
  OND_FLOW: "O&D vs Flow Traffic",
  ELASTICITY: "Elasticity / Willingness-to-Pay",
  OVERBOOK: "Overbooking & Spoilage",
  SEASONALITY: "Day-of-Week / Seasonality",
  TREND_AIR: "Trend Reading (Airline)",
  ANOMALY_AIR: "Anomaly Detection (Airline)",
};

// Backward-compat alias used throughout the file by existing generators
const SKILLS = GENERAL_SKILLS;
const SKILL_LIST = Object.values(GENERAL_SKILLS);
const AIRLINE_SKILL_LIST = Object.values(AIRLINE_SKILLS);

// Helpers to get the right skill set for a mode
const skillsForMode = (mode) => mode === "airline" ? AIRLINE_SKILL_LIST : SKILL_LIST;

// ═══════════════════════════════════════════════════════════════════════════
// ADAPTIVE ENGINE — simplified Elo / IRT hybrid.
// Each skill has an ability score (0..1). After each answer we update.
// Next-test selection biases toward weakest skills; difficulty targets
// slightly above current ability to drive growth.
// ═══════════════════════════════════════════════════════════════════════════
// Per-mode profile: ability/attempts/correct keyed by skill in that mode
const makeModeProfile = (skillList) => ({
  ability: Object.fromEntries(skillList.map((s) => [s, 0.4])),
  attempts: Object.fromEntries(skillList.map((s) => [s, 0])),
  correct: Object.fromEntries(skillList.map((s) => [s, 0])),
  history: [],
});

const DEFAULT_PROFILE = () => ({
  mode: "airline",
  airlineProfile: makeModeProfile(AIRLINE_SKILL_LIST),
  generalProfile: makeModeProfile(SKILL_LIST),
  testsToday: 0,  // shared across both modes — caps total tests per day
  testsDate: new Date().toISOString().slice(0, 10),
});

// Get the active per-mode profile from the top-level profile object
const activeProfile = (p) => p.mode === "airline" ? p.airlineProfile : p.generalProfile;

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

// ═══════════════════════════════════════════════════════════════════════════
// AIRLINE CHART GENERATORS — Revenue Management focused
// Each tests one or more airline RM skills with realistic data patterns.
// Explanations teach the *why* alongside the math.
// ═══════════════════════════════════════════════════════════════════════════

const ROUTES = [
  ["DFW", "LAX"], ["DFW", "ORD"], ["DFW", "MIA"], ["DFW", "JFK"],
  ["CLT", "PHX"], ["CLT", "BOS"], ["PHL", "DEN"], ["ORD", "SFO"],
  ["MIA", "LGA"], ["LAX", "SEA"], ["DFW", "DEN"], ["DCA", "DFW"],
];
const CARRIERS = ["AA", "DL", "UA", "B6", "WN"];

// 1. BOOKING CURVE — cumulative bookings vs days-to-departure, with forecast & PY
function genBookingCurve(rng, difficulty) {
  const route = ROUTES[Math.floor(rng() * ROUTES.length)];
  const capacity = 160 + Math.floor(rng() * 40);
  // Days-to-departure (DTD) checkpoints
  const dtdPoints = [60, 45, 30, 21, 14, 7, 3, 0];
  // Build a realistic S-curve booking pattern: slow start, mid-curve acceleration, late surge
  const buildCurve = (multiplier) => dtdPoints.map((dtd) => {
    const progress = (60 - dtd) / 60;
    // Sigmoid-ish curve typical of booking accumulation
    const s = 1 / (1 + Math.exp(-(progress - 0.45) * 5));
    return Math.round(capacity * 0.92 * s * multiplier);
  });

  // Pacing scenario chosen at random (ahead / behind / on-pace)
  const scenario = rng() < 0.4 ? "ahead" : rng() < 0.6 ? "behind" : "on-pace";
  const actualMult = scenario === "ahead" ? (1.12 + rng() * 0.08) :
                     scenario === "behind" ? (0.82 + rng() * 0.08) :
                     (0.97 + rng() * 0.04);

  const forecast = buildCurve(1.0);
  const priorYear = buildCurve(0.95 + rng() * 0.10);
  const actual = buildCurve(actualMult);
  // Actuals only known up to a "today" point — at DTD=14 in this scenario
  const todayIdx = 4; // DTD 14
  const data = dtdPoints.map((dtd, i) => ({
    dtd: `T-${dtd}`,
    forecast: forecast[i],
    priorYear: priorYear[i],
    actual: i <= todayIdx ? actual[i] : null,
  }));

  const todayActual = actual[todayIdx];
  const todayForecast = forecast[todayIdx];
  const pacingDelta = round(((todayActual - todayForecast) / todayForecast) * 100, 1);
  const finalActualEst = Math.round(actual[7]);
  const finalForecast = forecast[7];

  return {
    type: "bookingCurve",
    data,
    todayIdx,
    meta: {
      title: `${route[0]}–${route[1]} — Booking Curve, Flight 1247`,
      subtitle: `Capacity ${capacity}. Cumulative bookings by days-to-departure vs forecast and prior year.`,
    },
    questions: [
      {
        prompt: `At T-14, where is the flight pacing relative to forecast?`,
        opts: makeOpts(rng,
          pacingDelta > 5 ? `Ahead of forecast by ~${Math.abs(pacingDelta)}%` :
          pacingDelta < -5 ? `Behind forecast by ~${Math.abs(pacingDelta)}%` :
          `Approximately on pace`,
          [
            pacingDelta > 5 ? `Behind forecast by ~${Math.abs(pacingDelta)}%` : `Ahead of forecast by ~${Math.abs(pacingDelta + 8)}%`,
            "Exactly matching prior year",
            `${pacingDelta > 0 ? "Behind" : "Ahead"} by ~${Math.abs(pacingDelta) + 6}%`,
          ]),
        skills: [AIRLINE_SKILLS.BOOKING_CURVE, AIRLINE_SKILLS.PACING],
        difficulty,
        explain: `At T-14, actual bookings of ${todayActual} compared to forecast of ${todayForecast} = ${pacingDelta >= 0 ? "+" : ""}${pacingDelta}%. ` +
          (pacingDelta > 5
            ? "When a flight is pacing significantly ahead, demand is stronger than expected. The right action is usually to close down lower fare classes (K, L, Q, V) to push the remaining demand into higher buckets — this is exactly what bid-price optimization captures."
            : pacingDelta < -5
            ? "When a flight is pacing significantly behind, the forecast was too optimistic or demand softened. Options: open lower fare classes to stimulate bookings, run a targeted promotion, or reduce capacity if there's still time."
            : "On-pace bookings mean the forecast is well-calibrated and the current bid-price strategy is appropriate. No corrective action needed."),
      },
      {
        prompt: pacingDelta > 5
          ? "Given this pacing, which action would a revenue manager most likely take?"
          : pacingDelta < -5
          ? "Given this pacing, which action would a revenue manager most likely take?"
          : "Given this pacing pattern, what is the most appropriate action?",
        opts: makeOpts(rng,
          pacingDelta > 5 ? "Close down lower fare classes (K, L, Q) to push demand into higher buckets" :
          pacingDelta < -5 ? "Open lower fare classes and consider a targeted promotion" :
          "Maintain current inventory controls; the forecast is well-calibrated",
          [
            "Add capacity by swapping to a larger aircraft",
            "Match the lowest competitor fare immediately",
            "Wait until T-7 before any action is warranted",
          ]),
        skills: [AIRLINE_SKILLS.BOOKING_CURVE, AIRLINE_SKILLS.PACING, AIRLINE_SKILLS.FARE_MIX],
        difficulty,
        explain: pacingDelta > 5
          ? "Strong pacing = strong demand at current prices, which means there's willingness-to-pay being left on the table. Closing lower classes raises the effective price for remaining buyers. Capacity changes are too costly at T-14; matching competitors is the opposite of what the data suggests."
          : pacingDelta < -5
          ? "Weak pacing means the forecast over-estimated demand or the price is too high for what the market will bear. Opening lower classes recovers some bookings without a wholesale price drop. Targeted promos help on specific corporate or leisure segments."
          : "On-pace = current strategy is working. Avoid changes that introduce noise. Premature action is one of the most common RM mistakes.",
      },
    ],
  };
}

// 2. LF vs YIELD SCATTER — markets plotted; identify over-discounting, opportunity, etc.
function genLfYieldScatter(rng, difficulty) {
  const markets = [];
  const archetypes = [
    { name: "Over-discounted", lf: [88, 96], yield: [12, 16], code: "over" },
    { name: "Optimized", lf: [82, 90], yield: [18, 24], code: "opt" },
    { name: "Premium / under-utilized", lf: [62, 74], yield: [24, 32], code: "prem" },
    { name: "Weak demand", lf: [55, 68], yield: [11, 15], code: "weak" },
  ];
  // Generate 2-3 markets per archetype
  archetypes.forEach((arch) => {
    const count = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < count; i++) {
      const route = ROUTES[Math.floor(rng() * ROUTES.length)];
      markets.push({
        name: `${route[0]}-${route[1]}`,
        lf: round(arch.lf[0] + rng() * (arch.lf[1] - arch.lf[0]), 1),
        yield: round(arch.yield[0] + rng() * (arch.yield[1] - arch.yield[0]), 1),
        archetype: arch.code,
        unitRev: 0,
      });
    }
  });
  markets.forEach((m) => { m.unitRev = round(m.lf * m.yield / 100, 2); });

  // Pick one market that's clearly over-discounted for the question
  const overDiscounted = markets.find((m) => m.archetype === "over");
  const premium = markets.find((m) => m.archetype === "prem");
  const weak = markets.find((m) => m.archetype === "weak");

  return {
    type: "lfYieldScatter",
    data: markets,
    meta: {
      title: "Domestic Markets — Load Factor vs Yield",
      subtitle: "Each point is one O&D. Identify markets by their position in the LF × Yield space.",
    },
    questions: [
      {
        prompt: "Which market shows the clearest signs of over-discounting?",
        opts: makeOpts(rng, overDiscounted.name,
          [premium.name, weak.name, markets.find((m) => m.archetype === "opt").name]),
        skills: [AIRLINE_SKILLS.LF_YIELD, AIRLINE_SKILLS.RASM],
        difficulty,
        explain: `${overDiscounted.name} shows ${overDiscounted.lf}% load factor with only $${overDiscounted.yield} yield. High LF + low yield is the signature of over-discounting — the planes are full but you're leaving money on the table. The fix is to gradually close lower fare classes and let LF fall slightly while yield rises. Premium markets like ${premium.name} (${premium.lf}% LF, $${premium.yield} yield) are the opposite — there's room to fill more seats without crushing price.`,
      },
      {
        prompt: `Which market most clearly suggests an opportunity to grow load factor with limited yield risk?`,
        opts: makeOpts(rng, premium.name,
          [overDiscounted.name, weak.name, markets[markets.length - 1].name]),
        skills: [AIRLINE_SKILLS.LF_YIELD, AIRLINE_SKILLS.ELASTICITY],
        difficulty,
        explain: `${premium.name} has ${premium.lf}% LF and $${premium.yield} yield — high yield with empty seats. This profile suggests price-sensitive demand at the margin: a modest opening of lower fare classes can fill seats without significantly cannibalizing existing high-yield bookings. Markets like ${weak.name} (low on both axes) are riskier — weak demand at any price.`,
      },
    ],
  };
}

// 3. FARE CLASS MIX — stacked bar of class distribution
function genFareClassMix(rng, difficulty) {
  const route = ROUTES[Math.floor(rng() * ROUTES.length)];
  const flightType = rng() > 0.5 ? "business" : "leisure";
  // Business-heavy mix: more Y, B, M; leisure-heavy mix: more K, L, Q, V
  const generateMix = () => {
    if (flightType === "business") {
      const Y = 8 + rng() * 6, B = 14 + rng() * 6, M = 22 + rng() * 8, H = 18 + rng() * 6;
      const K = 14 + rng() * 6, L = 10 + rng() * 4, Q = 8 + rng() * 4;
      const total = Y + B + M + H + K + L + Q;
      return [
        { class: "Y", pct: round((Y / total) * 100, 1), color: "#c45a3e" },
        { class: "B", pct: round((B / total) * 100, 1), color: "#d4a857" },
        { class: "M", pct: round((M / total) * 100, 1), color: "#7a8b5c" },
        { class: "H", pct: round((H / total) * 100, 1), color: "#5a7287" },
        { class: "K", pct: round((K / total) * 100, 1), color: "#a89060" },
        { class: "L", pct: round((L / total) * 100, 1), color: "#8a8474" },
        { class: "Q", pct: round((Q / total) * 100, 1), color: "#6b6356" },
      ];
    } else {
      const Y = 3 + rng() * 3, B = 5 + rng() * 4, M = 10 + rng() * 5, H = 12 + rng() * 5;
      const K = 22 + rng() * 8, L = 24 + rng() * 8, Q = 16 + rng() * 6, V = 8 + rng() * 4;
      const total = Y + B + M + H + K + L + Q + V;
      return [
        { class: "Y", pct: round((Y / total) * 100, 1), color: "#c45a3e" },
        { class: "B", pct: round((B / total) * 100, 1), color: "#d4a857" },
        { class: "M", pct: round((M / total) * 100, 1), color: "#7a8b5c" },
        { class: "H", pct: round((H / total) * 100, 1), color: "#5a7287" },
        { class: "K", pct: round((K / total) * 100, 1), color: "#a89060" },
        { class: "L", pct: round((L / total) * 100, 1), color: "#8a8474" },
        { class: "Q", pct: round((Q / total) * 100, 1), color: "#6b6356" },
        { class: "V", pct: round((V / total) * 100, 1), color: "#4a443a" },
      ];
    }
  };
  const data = generateMix();
  const highYieldShare = round(data.filter((d) => ["Y", "B", "M"].includes(d.class)).reduce((a, b) => a + b.pct, 0), 1);
  const deepDiscShare = round(data.filter((d) => ["L", "Q", "V"].includes(d.class)).reduce((a, b) => a + b.pct, 0), 1);

  return {
    type: "fareClassMix",
    data,
    meta: {
      title: `${route[0]}–${route[1]} — Fare Class Mix (last 30 days)`,
      subtitle: "Share of bookings by fare class. Y is full-fare, V is the deepest discount.",
    },
    questions: [
      {
        prompt: "What does this fare class mix most strongly suggest about the demand profile?",
        opts: makeOpts(rng,
          flightType === "business"
            ? "Predominantly business / corporate demand with healthy yield"
            : "Predominantly leisure demand with significant deep-discount share",
          [
            flightType === "business"
              ? "Leisure-dominant route relying on deep discounts"
              : "Business-dominant route with strong yield",
            "Mix is unusual; likely a data issue with the booking system",
            "Mix is balanced and suggests no clear segment dominance",
          ]),
        skills: [AIRLINE_SKILLS.FARE_MIX, AIRLINE_SKILLS.SEGMENTATION],
        difficulty,
        explain: flightType === "business"
          ? `High-yield classes (Y/B/M) hold ${highYieldShare}% of bookings here, with limited deep-discount share. This is the classic profile of a business market — corporate travelers booking close-in, less price-sensitive. Examples: DFW-LGA, DFW-ORD weekday flights. Pricing strategy emphasizes high last-seat value rather than fill rates.`
          : `Deep-discount classes (L/Q/V) make up ${deepDiscShare}% of bookings. This is a leisure-heavy mix — long booking windows, price-sensitive customers. Typical of Florida/Caribbean/Vegas routes. Strategy emphasizes fill rate via low-priced inventory opened well in advance, with revenue from ancillaries and aircraft utilization.`,
      },
      {
        prompt: flightType === "business"
          ? "If you saw L/Q share suddenly rise on this route, what would you investigate first?"
          : "If you saw Y/B share suddenly rise on this route, what would you investigate first?",
        opts: makeOpts(rng,
          flightType === "business"
            ? "Whether competitive pressure or weak corporate demand is forcing dilution"
            : "Whether a new event, sports team travel, or business demand surge is occurring",
          [
            "Whether the aircraft type changed",
            "Whether fuel costs rose",
            "Whether the schedule was rebanked",
          ]),
        skills: [AIRLINE_SKILLS.FARE_MIX, AIRLINE_SKILLS.ANOMALY_AIR],
        difficulty,
        explain: flightType === "business"
          ? `A sudden rise in deep-discount share on a business route usually signals one of three things: (1) competitors dropped fares, forcing you to open lower buckets defensively, (2) the corporate demand base weakened — recession, RTO policy change, (3) a sales/promo was active. The right diagnostic order is to check competitive fare actions first, then look at corporate booking trends.`
          : `A surge in high-yield bookings on a leisure route usually signals an exogenous demand spike: a major event (concert, sports playoff, convention), seasonal shift, or sometimes weather disruption rerouting passengers. The action is usually to close down lower classes immediately while the spike lasts.`,
      },
    ],
  };
}

// 4. COMPETITIVE FARE LADDER — table of fares by class across carriers
function genCompetitiveFareLadder(rng, difficulty) {
  const route = ROUTES[Math.floor(rng() * ROUTES.length)];
  const carriers = shuffle(rng, [...CARRIERS]).slice(0, 4);
  if (!carriers.includes("AA")) carriers[0] = "AA";
  const classes = ["Y", "B", "M", "H", "K", "L"];
  const basePrice = [580, 440, 340, 260, 190, 140];

  const data = carriers.map((c, i) => ({
    carrier: c,
    fares: classes.map((cl, j) => {
      const variance = c === "AA" ? 0 : (rng() - 0.5) * 0.18;
      return Math.round(basePrice[j] * (1 + variance));
    }),
  }));

  // Find AA's biggest gap (where it's most overpriced vs lowest competitor)
  const aaRow = data.find((d) => d.carrier === "AA");
  let worstClass = "M", worstGap = 0;
  classes.forEach((cl, j) => {
    const competitors = data.filter((d) => d.carrier !== "AA").map((d) => d.fares[j]);
    const minComp = Math.min(...competitors);
    const gap = aaRow.fares[j] - minComp;
    if (gap > worstGap) { worstGap = gap; worstClass = cl; }
  });

  return {
    type: "competitiveFareLadder",
    data,
    classes,
    meta: {
      title: `${route[0]}–${route[1]} — Competitive Fare Ladder`,
      subtitle: "One-way fares by booking class across carriers. AA's position in each bucket.",
    },
    questions: [
      {
        prompt: "In which fare class is AA most uncompetitive?",
        opts: makeOpts(rng, `${worstClass} class`,
          classes.filter((c) => c !== worstClass).slice(0, 3).map((c) => `${c} class`)),
        skills: [AIRLINE_SKILLS.COMP_FARE, AIRLINE_SKILLS.GAME_THEORY],
        difficulty,
        explain: `In ${worstClass} class, AA is priced $${worstGap} above the lowest competitor. In RM, the most price-sensitive shoppers cluster in mid-to-deep discount classes — a $${worstGap} gap in ${worstClass} drives meaningful share loss because those shoppers compare prices aggressively on metasearch. Top-of-ladder classes (Y, B) see less price-comparison shopping because corporate travelers book based on schedule and account agreements, not lowest fare.`,
      },
      {
        prompt: "What's the most strategically sound response to this competitive position?",
        opts: makeOpts(rng,
          `Match in ${worstClass} class only, narrowly targeted, to avoid triggering a broader fare war`,
          [
            "Match the lowest competitor across all classes immediately",
            "Hold prices firm; AA's brand justifies the premium",
            "Raise fares across the board to signal market discipline",
          ]),
        skills: [AIRLINE_SKILLS.COMP_FARE, AIRLINE_SKILLS.GAME_THEORY],
        difficulty,
        explain: `Targeted matches in specific classes minimize revenue dilution while addressing the actual loss point. Wholesale matching invites retaliation and triggers fare wars that hurt all carriers. Holding firm assumes brand loyalty that doesn't typically survive a $${worstGap} gap on metasearch. Raising fares signals discipline only if you have market power; on a competitive route this just accelerates share loss. The textbook RM move is narrow, surgical fare adjustments — and ideally to match using fare restrictions (advance purchase, Saturday stay) that segment business from leisure.`,
      },
    ],
  };
}

// 5. RASM BRIDGE — variance bridge: PY RASM → CY RASM with airline-specific drivers
function genRasmBridge(rng, difficulty) {
  const startRasm = round(11 + rng() * 4, 2);
  const yieldImpact = round((rng() - 0.4) * 1.2, 2);
  const lfImpact = round((rng() - 0.5) * 0.9, 2);
  const mixImpact = round((rng() - 0.5) * 0.6, 2);
  const stageLength = round((rng() - 0.5) * 0.4, 2);
  const fuelSurcharge = round((rng() - 0.5) * 0.3, 2);
  const endRasm = round(startRasm + yieldImpact + lfImpact + mixImpact + stageLength + fuelSurcharge, 2);

  const items = [
    { label: "PY RASM", value: startRasm, type: "start" },
    { label: "Yield", value: yieldImpact, type: yieldImpact >= 0 ? "in" : "out" },
    { label: "Load Factor", value: lfImpact, type: lfImpact >= 0 ? "in" : "out" },
    { label: "Fare Mix", value: mixImpact, type: mixImpact >= 0 ? "in" : "out" },
    { label: "Stage Length", value: stageLength, type: stageLength >= 0 ? "in" : "out" },
    { label: "Fuel Surcharge", value: fuelSurcharge, type: fuelSurcharge >= 0 ? "in" : "out" },
    { label: "CY RASM", value: endRasm, type: "end" },
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
  const largestDriver = movables.reduce((a, b) => Math.abs(b.value) > Math.abs(a.value) ? b : a);
  const netDelta = round(endRasm - startRasm, 2);

  return {
    type: "rasmBridge",
    data,
    meta: {
      title: "Domestic Mainline — RASM Walk YoY",
      subtitle: "Drivers of unit revenue change ($ per ASM). RASM = Revenue ÷ Available Seat Miles.",
    },
    questions: [
      {
        prompt: "Which factor contributed most to the YoY RASM change?",
        opts: makeOpts(rng, largestDriver.label,
          movables.filter((m) => m.label !== largestDriver.label).slice(0, 3).map((m) => m.label)),
        skills: [AIRLINE_SKILLS.RASM, AIRLINE_SKILLS.VARIANCE_AIR],
        difficulty,
        explain: `${largestDriver.label} moved RASM by ${largestDriver.value >= 0 ? "+" : ""}$${largestDriver.value}. ` +
          (largestDriver.label === "Yield" ? "Yield is revenue per passenger-mile — changes typically reflect pricing actions, fare class mix, or competitive moves." :
           largestDriver.label === "Load Factor" ? "Load factor moves RASM by spreading the same flight costs across more (or fewer) passengers. A 1-pt LF gain is roughly a 1-pt RASM gain at constant yield." :
           largestDriver.label === "Stage Length" ? "Stage length is a denominator effect — longer flights have more ASMs per passenger, mechanically lowering RASM even at constant revenue. Always normalize for stage length when comparing carriers or periods." :
           largestDriver.label === "Fare Mix" ? "Mix shift between fare classes (or domestic vs international, or main cabin vs premium) changes the effective price even when posted fares are unchanged." :
           "Fuel surcharges historically passed through to fares; less common now in domestic but still relevant internationally."),
      },
      {
        prompt: `Net RASM change was ${netDelta >= 0 ? "+" : ""}$${netDelta}. What does this tell you about commercial performance?`,
        opts: makeOpts(rng,
          netDelta > 0.3 ? "Strong commercial performance: pricing and demand both contributing positively" :
          netDelta < -0.3 ? "Commercial pressure: investigate whether pricing power eroded or demand softened" :
          "RASM is essentially flat YoY — neutral commercial trajectory",
          [
            "RASM movement doesn't reveal commercial performance; need CASM data",
            netDelta > 0 ? "Performance is weak; need fuel data to interpret" : "Performance is strong; capacity expansion is working",
            "Movement is driven entirely by stage length",
          ]),
        skills: [AIRLINE_SKILLS.RASM, AIRLINE_SKILLS.VARIANCE_AIR],
        difficulty,
        explain: `RASM is the cleanest single measure of commercial performance because it normalizes for capacity. PRASM (Passenger RASM) excludes cargo. ${netDelta > 0.3 ? "A meaningful RASM increase signals real revenue strength — though always check CASM separately to confirm margin improved too." : netDelta < -0.3 ? "A meaningful RASM decline is a red flag. The bridge tells you which driver to chase: was it pricing (yield) or volume (LF)? Different fixes." : "Flat RASM means the company is roughly running in place commercially. Often masks offsetting moves worth understanding."}`,
      },
    ],
  };
}

// 6. DEMAND FORECAST vs ACTUALS — line chart over flight dates
function genForecastActuals(rng, difficulty) {
  const route = ROUTES[Math.floor(rng() * ROUTES.length)];
  const days = 14;
  // Forecast bias direction: forecast systematically over or under
  const bias = rng() > 0.5 ? "over" : "under";
  const biasMag = 0.06 + rng() * 0.08;
  const data = Array.from({ length: days }, (_, i) => {
    const dow = i % 7;
    // Weekend lift typical of leisure routes
    const dowMult = (dow === 5 || dow === 6) ? 1.12 : (dow === 1 || dow === 2) ? 0.92 : 1.0;
    const base = 130 + rng() * 30;
    const forecast = Math.round(base * dowMult);
    const actualMult = bias === "over" ? (1 - biasMag) : (1 + biasMag);
    const noise = (rng() - 0.5) * 0.06;
    const actual = Math.round(forecast * (actualMult + noise));
    return {
      day: `D${i + 1}`,
      forecast,
      actual,
      delta: actual - forecast,
    };
  });
  const avgBias = round(data.reduce((s, d) => s + d.delta, 0) / data.length, 1);
  const totalForecast = data.reduce((s, d) => s + d.forecast, 0);
  const biasPct = round((avgBias * data.length / totalForecast) * 100, 1);

  return {
    type: "forecastActuals",
    data,
    meta: {
      title: `${route[0]}–${route[1]} — Demand Forecast vs Actuals (last 14 flights)`,
      subtitle: "Forecasted passenger demand and actual bookings by flight date.",
    },
    questions: [
      {
        prompt: "What pattern does this forecast exhibit?",
        opts: makeOpts(rng,
          bias === "over" ? `Systematically over-forecasting by ~${Math.abs(biasPct)}%`
                          : `Systematically under-forecasting by ~${Math.abs(biasPct)}%`,
          [
            bias === "over" ? `Systematically under-forecasting by ~${Math.abs(biasPct)}%`
                            : `Systematically over-forecasting by ~${Math.abs(biasPct)}%`,
            "Random noise around an unbiased forecast",
            "Forecast is accurate; deviations are purely seasonal",
          ]),
        skills: [AIRLINE_SKILLS.FORECAST, AIRLINE_SKILLS.ANOMALY_AIR],
        difficulty,
        explain: `Average actual minus forecast is ${avgBias > 0 ? "+" : ""}${avgBias} passengers per flight (${biasPct >= 0 ? "+" : ""}${biasPct}%). ` +
          (bias === "over"
            ? "Over-forecasting demand means the system is holding too tight on inventory — closing fare classes too early, leaving seats unsold (spoilage). Fix: re-train the forecast on recent data, or apply a downward bias correction in the bid-price engine."
            : "Under-forecasting means inventory is being released too freely — selling too many low-fare seats early when higher-paying customers would arrive later (revenue dilution). Fix: raise the demand parameters in the forecast or apply an upward bias adjustment."),
      },
      {
        prompt: bias === "over"
          ? "What is the operational consequence of persistent over-forecasting?"
          : "What is the operational consequence of persistent under-forecasting?",
        opts: makeOpts(rng,
          bias === "over"
            ? "Excessive spoilage — seats unsold that could have been sold"
            : "Revenue dilution — too many low-fare bookings before high-yield demand arrives",
          [
            bias === "over"
              ? "Revenue dilution from selling too many cheap seats"
              : "Excessive spoilage from holding inventory too tight",
            "Higher fuel costs",
            "No operational impact",
          ]),
        skills: [AIRLINE_SKILLS.FORECAST, AIRLINE_SKILLS.OVERBOOK],
        difficulty,
        explain: bias === "over"
          ? "When the forecast says 'lots of high-paying demand is coming', the optimizer reserves more seats for higher fare classes — but that demand never materializes, so those seats fly empty. This is spoilage, the single biggest forecast-related revenue leak in RM."
          : "When the forecast underestimates demand, the optimizer thinks 'we won't sell many high-fare tickets, better fill seats now with discounts.' Then high-yield bookings show up but inventory is gone. This is dilution — the second-biggest forecast-related leak.",
      },
    ],
  };
}

// 7. CAPACITY & SCHEDULE — bar chart of ASMs deployed by route with YoY change
function genCapacitySchedule(rng, difficulty) {
  const routes = shuffle(rng, ROUTES).slice(0, 6).map((r) => `${r[0]}-${r[1]}`);
  const data = routes.map((r) => {
    const py = 60 + rng() * 100;
    const change = (rng() - 0.4) * 0.3; // skewed to growth
    const cy = py * (1 + change);
    return {
      route: r,
      py: round(py, 0),
      cy: round(cy, 0),
      change: round(change * 100, 1),
    };
  });
  const biggestAdd = data.reduce((a, b) => b.change > a.change ? b : a);
  const biggestCut = data.reduce((a, b) => b.change < a.change ? b : a);

  return {
    type: "capacitySchedule",
    data,
    meta: {
      title: "Capacity Deployed by Route — YoY (ASMs in millions)",
      subtitle: "Available Seat Miles by route: current year vs prior year.",
    },
    questions: [
      {
        prompt: "On which route did AA add the most capacity YoY?",
        opts: makeOpts(rng, biggestAdd.route,
          data.filter((d) => d.route !== biggestAdd.route).slice(0, 3).map((d) => d.route)),
        skills: [AIRLINE_SKILLS.CAPACITY, AIRLINE_SKILLS.RASM],
        difficulty,
        explain: `${biggestAdd.route} grew ${biggestAdd.change > 0 ? "+" : ""}${biggestAdd.change}% YoY in ASMs. Capacity adds are usually one of: (1) responding to demand strength, (2) defending share against a competitor entering, (3) hub densification. The RM question that follows is always: is the demand growth keeping up? If unit revenue (RASM) falls more than the capacity grew, dilution is happening.`,
      },
      {
        prompt: `${biggestAdd.route} added ${biggestAdd.change}% capacity. What is the most important follow-up metric?`,
        opts: makeOpts(rng, "RASM YoY — did unit revenue hold up?",
          [
            "Fuel cost per ASM",
            "Number of pilots assigned",
            "Schedule reliability (D0)",
          ]),
        skills: [AIRLINE_SKILLS.CAPACITY, AIRLINE_SKILLS.RASM],
        difficulty,
        explain: `Capacity adds are only economically sound if RASM holds (or declines less than the capacity grew). If RASM falls 10% while capacity grew 15%, total revenue is up ~3.5% — possibly fine, possibly not, depending on costs. If RASM falls 20% on a 15% capacity add, the add was destructive. RM teams obsessively track RASM on newly-grown markets for this reason.`,
      },
    ],
  };
}

// 8. ROUTE PROFITABILITY QUADRANT — 2×2 with revenue growth × LF, bubble size = ASMs
function genRouteQuadrant(rng, difficulty) {
  const routes = shuffle(rng, ROUTES).slice(0, 8);
  // Distribute into quadrants: star (high growth, high LF), question (high growth, low LF),
  //                            cash cow (low growth, high LF), dog (low growth, low LF)
  const archetypes = ["star", "question", "cow", "dog"];
  const data = routes.map((r, i) => {
    const arch = archetypes[i % 4];
    const revGrowth = arch === "star" || arch === "question" ? 8 + rng() * 12 : -4 + rng() * 8;
    const lf = arch === "star" || arch === "cow" ? 82 + rng() * 12 : 60 + rng() * 18;
    const asms = 40 + rng() * 120;
    return {
      route: `${r[0]}-${r[1]}`,
      revGrowth: round(revGrowth, 1),
      lf: round(lf, 1),
      asms: round(asms, 0),
      archetype: arch,
    };
  });
  const star = data.find((d) => d.archetype === "star");
  const dog = data.find((d) => d.archetype === "dog");

  return {
    type: "routeQuadrant",
    data,
    meta: {
      title: "Route Portfolio — Revenue Growth × Load Factor",
      subtitle: "Each bubble is one O&D. Bubble size = ASMs deployed.",
    },
    questions: [
      {
        prompt: "Which route would you de-emphasize first based on this portfolio view?",
        opts: makeOpts(rng, dog.route,
          data.filter((d) => d.route !== dog.route).slice(0, 3).map((d) => d.route)),
        skills: [AIRLINE_SKILLS.CAPACITY, AIRLINE_SKILLS.LF_YIELD],
        difficulty,
        explain: `${dog.route} shows ${dog.revGrowth}% revenue growth and only ${dog.lf}% LF — weak on both dimensions. This is the textbook "dog" quadrant: capital tied up earning poor returns. Before cutting, check (1) network value (does it feed a hub?), (2) competitive considerations (does pulling out invite entry?), (3) seasonality (is the trough temporary?). But absent those, this is the candidate for capacity reduction.`,
      },
      {
        prompt: `${star.route} shows high growth and high LF. What's the most likely RM action?`,
        opts: makeOpts(rng,
          "Hold capacity steady but close lower fare classes to harvest higher yield",
          [
            "Cut capacity to push yield even higher",
            "Add capacity aggressively to capture share",
            "Match competitor fares to defend share",
          ]),
        skills: [AIRLINE_SKILLS.CAPACITY, AIRLINE_SKILLS.LF_YIELD, AIRLINE_SKILLS.ELASTICITY],
        difficulty,
        explain: `Star routes (high growth, high LF) have demand exceeding supply at current prices. The yield-maximizing move is to close lower fare buckets, push customers into higher classes, and let total revenue rise more than total bookings. Adding capacity is tempting but risks dilution if the demand surge is temporary; cutting capacity gives up revenue. The RM answer is almost always: optimize the existing inventory before changing capacity.`,
      },
    ],
  };
}

const AIRLINE_GENERATORS = [
  { gen: genBookingCurve, skills: [AIRLINE_SKILLS.BOOKING_CURVE, AIRLINE_SKILLS.PACING] },
  { gen: genLfYieldScatter, skills: [AIRLINE_SKILLS.LF_YIELD, AIRLINE_SKILLS.RASM, AIRLINE_SKILLS.ELASTICITY] },
  { gen: genFareClassMix, skills: [AIRLINE_SKILLS.FARE_MIX, AIRLINE_SKILLS.SEGMENTATION] },
  { gen: genCompetitiveFareLadder, skills: [AIRLINE_SKILLS.COMP_FARE, AIRLINE_SKILLS.GAME_THEORY] },
  { gen: genRasmBridge, skills: [AIRLINE_SKILLS.RASM, AIRLINE_SKILLS.VARIANCE_AIR] },
  { gen: genForecastActuals, skills: [AIRLINE_SKILLS.FORECAST, AIRLINE_SKILLS.ANOMALY_AIR, AIRLINE_SKILLS.OVERBOOK] },
  { gen: genCapacitySchedule, skills: [AIRLINE_SKILLS.CAPACITY, AIRLINE_SKILLS.RASM] },
  { gen: genRouteQuadrant, skills: [AIRLINE_SKILLS.CAPACITY, AIRLINE_SKILLS.LF_YIELD] },
];

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
// ═══════════════════════════════════════════════════════════════════════════
// MENTAL MATH — Option C: inject 1-2 quick numerical questions into each test
// These appear as a "mental math" mini-card between charts, no visualization.
// Tagged with a synthetic skill so they don't affect skill-specific abilities.
// ═══════════════════════════════════════════════════════════════════════════
function genMentalMath(rng, mode) {
  // Airline-flavored or general financial mental math
  const airline = mode === "airline";
  const variants = airline ? [
    () => {
      const seats = 150 + Math.floor(rng() * 70);
      const lf = round(70 + rng() * 25, 0);
      const fare = 180 + Math.floor(rng() * 200);
      const paxes = Math.round(seats * lf / 100);
      const rev = paxes * fare;
      const distractors = [rev + 5000, rev - 4500, Math.round(rev * 1.15)];
      return {
        prompt: `A flight has ${seats} seats, ${lf}% load factor, and an average fare of $${fare}. What is approximate flight revenue?`,
        correctText: `$${rev.toLocaleString()}`,
        distractors: distractors.map((d) => `$${d.toLocaleString()}`),
        explain: `Passengers = ${seats} × ${lf}% = ${paxes}. Revenue = ${paxes} × $${fare} = $${rev.toLocaleString()}. This is the fundamental RM calculation done dozens of times daily.`,
        skill: AIRLINE_SKILLS.RASM,
      };
    },
    () => {
      const rev = 800 + Math.floor(rng() * 1200);
      const asm = 90 + Math.floor(rng() * 60);
      const rasm = round(rev / asm * 100, 2);  // cents
      const distractors = [round(rasm + 0.8, 2), round(rasm - 0.6, 2), round(rasm * 1.4, 2)];
      return {
        prompt: `Revenue is $${rev}M and ASMs are ${asm}B. What is RASM (in cents per ASM)?`,
        correctText: `${rasm}¢`,
        distractors: distractors.map((d) => `${d}¢`),
        explain: `RASM = Revenue ÷ ASMs. $${rev}M ÷ ${asm}B = $${rev/asm} per ASM = ${rasm}¢. RASM is the industry-standard unit revenue metric — keep the unit conversion (millions ÷ billions = 1/1000) at your fingertips.`,
        skill: AIRLINE_SKILLS.RASM,
      };
    },
    () => {
      const seats = 160 + Math.floor(rng() * 60);
      const overbook = 6 + Math.floor(rng() * 8);
      const noShowRate = round(6 + rng() * 6, 0);
      const expectedShow = Math.round((seats + overbook) * (1 - noShowRate / 100));
      const denied = expectedShow - seats;
      return {
        prompt: `Capacity ${seats}, overbooked to ${seats + overbook} (${overbook} extras), no-show rate ${noShowRate}%. Expected denied boardings?`,
        correctText: denied > 0 ? `~${denied}` : "0 (no denied boardings expected)",
        distractors: [`~${denied + 3}`, `~${overbook}`, `~${Math.abs(denied - 2)}`],
        explain: `Expected shows = (${seats} + ${overbook}) × (1 - ${noShowRate}%) = ${expectedShow}. Denied = ${expectedShow} - ${seats} = ${denied}. Overbooking is calibrated so denied boardings × DB compensation cost < spoilage saved by selling the extra seats.`,
        skill: AIRLINE_SKILLS.OVERBOOK,
      };
    },
    () => {
      const yieldVal = round(15 + rng() * 8, 1);
      const lf = round(78 + rng() * 14, 0);
      const rasm = round(yieldVal * lf / 100, 2);
      return {
        prompt: `Yield is ${yieldVal}¢ and Load Factor is ${lf}%. What is RASM?`,
        correctText: `${rasm}¢`,
        distractors: [`${round(rasm + 1.2, 2)}¢`, `${round(rasm - 0.9, 2)}¢`, `${round(yieldVal, 2)}¢`],
        explain: `RASM = Yield × LF. ${yieldVal}¢ × ${lf}% = ${rasm}¢. This is one of the most common identities in airline analytics — internalize it.`,
        skill: AIRLINE_SKILLS.RASM,
      };
    },
  ] : [
    () => {
      const rev = 200 + Math.floor(rng() * 800);
      const margin = round(8 + rng() * 22, 0);
      const ebitda = Math.round(rev * margin / 100);
      return {
        prompt: `Revenue is $${rev}M at ${margin}% EBITDA margin. What is EBITDA?`,
        correctText: `$${ebitda}M`,
        distractors: [`$${ebitda + 12}M`, `$${ebitda - 9}M`, `$${Math.round(ebitda * 1.2)}M`],
        explain: `EBITDA = Revenue × Margin = $${rev}M × ${margin}% = $${ebitda}M.`,
        skill: GENERAL_SKILLS.RATIO,
      };
    },
    () => {
      const ebitda = 50 + Math.floor(rng() * 200);
      const mult = round(7 + rng() * 8, 1);
      const ev = Math.round(ebitda * mult);
      return {
        prompt: `EBITDA of $${ebitda}M trading at ${mult}x. What is Enterprise Value?`,
        correctText: `$${ev}M`,
        distractors: [`$${ev + 80}M`, `$${ev - 50}M`, `$${Math.round(ev * 1.15)}M`],
        explain: `EV = EBITDA × Multiple = $${ebitda}M × ${mult}x = $${ev}M.`,
        skill: GENERAL_SKILLS.VALUATION,
      };
    },
  ];
  const variant = variants[Math.floor(rng() * variants.length)]();
  return {
    type: "mentalMath",
    meta: {
      title: "Rapid Calculation",
      subtitle: "Quick mental math — the kind asked live in RM interviews.",
    },
    data: null,
    questions: [{
      prompt: variant.prompt,
      opts: makeOpts(rng, variant.correctText, variant.distractors),
      skills: [variant.skill],
      difficulty: 0.5,
      explain: variant.explain,
    }],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST BUILDER — pick 3 charts biased toward weak skills; set difficulty
// per current ability for the skills covered. Adds 1-2 mental math questions.
// ═══════════════════════════════════════════════════════════════════════════
function buildTest(profile, rng, mode = "airline") {
  const generators = mode === "airline" ? AIRLINE_GENERATORS : CHART_GENERATORS;
  const skills = mode === "airline" ? AIRLINE_SKILL_LIST : SKILL_LIST;
  const skillsRanked = skills
    .map((s) => ({ skill: s, ability: profile.ability[s] || 0.4 }))
    .sort((a, b) => a.ability - b.ability);
  const weakSkills = new Set(skillsRanked.slice(0, 5).map((s) => s.skill));

  const scored = generators.map((g, idx) => {
    const overlap = g.skills.filter((s) => weakSkills.has(s)).length;
    return { idx, score: overlap + rng() * 0.4 };
  }).sort((a, b) => b.score - a.score);

  const chosenIdxs = scored.slice(0, 3).map((s) => s.idx);
  const charts = chosenIdxs.map((idx) => {
    const skillAbilities = generators[idx].skills.map((s) => profile.ability[s] || 0.4);
    const avgAbility = skillAbilities.reduce((a, b) => a + b, 0) / skillAbilities.length;
    const diff = Math.min(0.95, Math.max(0.15, avgAbility + 0.1));
    return generators[idx].gen(rng, diff);
  });

  // Inject one mental math card in the middle of the test
  charts.splice(2, 0, genMentalMath(rng, mode));
  return charts;
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

// ═══════════════════════════════════════════════════════════════════════════
// AIRLINE CHART RENDERERS
// ═══════════════════════════════════════════════════════════════════════════

function BookingCurveChart({ data, todayIdx, meta }) {
  // Find the dtd label at the todayIdx for the reference line
  const todayLabel = data[todayIdx]?.dtd;
  return (
    <ChartShell meta={meta}>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 10, right: 30, bottom: 5, left: 0 }}>
          <CartesianGrid stroke={C.line} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="dtd" stroke={C.ink3} tick={{ fontSize: 11, fontFamily: F.body }} axisLine={{ stroke: C.line }} />
          <YAxis stroke={C.ink3} tick={{ fontSize: 11, fontFamily: F.body }} axisLine={{ stroke: C.line }} />
          <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.line}`, fontFamily: F.body, fontSize: 12 }} />
          <ReferenceLine x={todayLabel} stroke={C.ink2} strokeDasharray="3 3" label={{ value: "Today", position: "top", fill: C.ink2, fontSize: 10, fontFamily: F.mono }} />
          <Line type="monotone" dataKey="forecast" stroke={C.accent4} strokeWidth={2} dot={{ r: 3 }} strokeDasharray="6 3" name="Forecast" />
          <Line type="monotone" dataKey="priorYear" stroke={C.ink3} strokeWidth={1.5} dot={{ r: 2 }} name="Prior Year" />
          <Line type="monotone" dataKey="actual" stroke={C.accent} strokeWidth={2.5} dot={{ r: 3, fill: C.accent }} connectNulls={false} name="Actual" />
        </LineChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", gap: 18, justifyContent: "center", marginTop: 8, fontFamily: F.body, fontSize: 11, color: C.ink2 }}>
        <span><span style={{ display: "inline-block", width: 12, height: 2, background: C.accent, marginRight: 6, verticalAlign: "middle" }} />Actual</span>
        <span><span style={{ display: "inline-block", width: 12, height: 2, background: C.accent4, marginRight: 6, verticalAlign: "middle" }} />Forecast</span>
        <span><span style={{ display: "inline-block", width: 12, height: 2, background: C.ink3, marginRight: 6, verticalAlign: "middle" }} />Prior Year</span>
      </div>
    </ChartShell>
  );
}

function LfYieldScatterChart({ data, meta }) {
  const colorMap = { over: C.bad, opt: C.good, prem: C.accent3, weak: C.ink3 };
  return (
    <ChartShell meta={meta}>
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart margin={{ top: 10, right: 30, bottom: 30, left: 10 }}>
          <CartesianGrid stroke={C.line} strokeDasharray="2 4" />
          <XAxis type="number" dataKey="lf" name="Load Factor" stroke={C.ink3} tick={{ fontSize: 11, fontFamily: F.body }} axisLine={{ stroke: C.line }} unit="%" domain={[50, 100]} label={{ value: "Load Factor (%)", position: "bottom", offset: 0, fill: C.ink2, fontSize: 11, fontFamily: F.body }} />
          <YAxis type="number" dataKey="yield" name="Yield" stroke={C.ink3} tick={{ fontSize: 11, fontFamily: F.body }} axisLine={{ stroke: C.line }} unit="¢" domain={[8, 36]} label={{ value: "Yield (¢)", angle: -90, position: "insideLeft", fill: C.ink2, fontSize: 11, fontFamily: F.body }} />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            contentStyle={{ background: C.card, border: `1px solid ${C.line}`, fontFamily: F.body, fontSize: 12 }}
            formatter={(value, name, props) => {
              if (name === "Load Factor") return [`${value}%`, name];
              if (name === "Yield") return [`${value}¢`, name];
              return [value, name];
            }}
            labelFormatter={() => ""}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload;
              return (
                <div style={{ background: C.card, border: `1px solid ${C.line}`, padding: 8, fontFamily: F.body, fontSize: 12 }}>
                  <div style={{ fontFamily: F.mono, color: C.ink, fontWeight: 500 }}>{p.name}</div>
                  <div style={{ color: C.ink2 }}>LF: {p.lf}% · Yield: {p.yield}¢</div>
                </div>
              );
            }}
          />
          <Scatter data={data}>
            {data.map((d, i) => <Cell key={i} fill={colorMap[d.archetype] || C.ink2} />)}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <div style={{ fontFamily: F.mono, fontSize: 10, color: C.ink3, textAlign: "center", marginTop: 4 }}>
        Hover any point to see the market name.
      </div>
    </ChartShell>
  );
}

function FareClassMixChart({ data, meta }) {
  // Render as a single horizontal stacked bar for clean readability of share
  const total = data.reduce((a, b) => a + b.pct, 0);
  return (
    <ChartShell meta={meta}>
      <div style={{ display: "flex", height: 56, borderRadius: 4, overflow: "hidden", border: `1px solid ${C.line}` }}>
        {data.map((d, i) => (
          <div key={d.class} style={{
            flex: d.pct, background: d.color, display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontFamily: F.mono, fontSize: 12, fontWeight: 500,
          }} title={`${d.class}: ${d.pct}%`}>
            {d.pct > 6 ? d.class : ""}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
        {data.map((d) => (
          <div key={d.class} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: F.mono, fontSize: 12 }}>
            <span style={{ display: "inline-block", width: 12, height: 12, background: d.color }} />
            <span style={{ color: C.ink, fontWeight: 500 }}>{d.class}</span>
            <span style={{ color: C.ink2 }}>{d.pct}%</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, fontFamily: F.body, fontSize: 11, color: C.ink3, lineHeight: 1.5 }}>
        Y = full fare · B/M/H = mid-tier discounts · K/L/Q/V = deep discounts (advance-purchase, restricted)
      </div>
    </ChartShell>
  );
}

function CompetitiveFareLadderChart({ data, classes, meta }) {
  // Find min for each class column for heat coloring
  const colMins = classes.map((_, j) => Math.min(...data.map((d) => d.fares[j])));
  return (
    <ChartShell meta={meta}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: F.mono, fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.line}` }}>
              <th style={{ padding: "10px 12px", color: C.ink3, fontSize: 11, fontWeight: 500, textAlign: "left" }}>Carrier</th>
              {classes.map((c) => (
                <th key={c} style={{ padding: "10px 12px", color: C.ink3, fontSize: 11, fontWeight: 500, textAlign: "right" }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.carrier} style={{ borderBottom: `1px dashed ${C.line}`, background: row.carrier === "AA" ? C.cardDim : "transparent" }}>
                <td style={{ padding: "10px 12px", color: C.ink, fontWeight: 500 }}>
                  {row.carrier}{row.carrier === "AA" && <span style={{ color: C.accent, fontSize: 10, marginLeft: 6 }}>← us</span>}
                </td>
                {row.fares.map((f, j) => {
                  const isLowest = f === colMins[j];
                  return (
                    <td key={j} style={{
                      padding: "10px 12px", textAlign: "right",
                      color: isLowest ? C.good : C.ink2,
                      fontWeight: isLowest ? 600 : 400,
                    }}>
                      ${f}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 12, fontFamily: F.body, fontSize: 11, color: C.ink3 }}>
        Green/bold = lowest fare in that class. AA row highlighted.
      </div>
    </ChartShell>
  );
}

function ForecastActualsChart({ data, meta }) {
  return (
    <ChartShell meta={meta}>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 10, right: 30, bottom: 5, left: 0 }}>
          <CartesianGrid stroke={C.line} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="day" stroke={C.ink3} tick={{ fontSize: 11, fontFamily: F.body }} axisLine={{ stroke: C.line }} />
          <YAxis stroke={C.ink3} tick={{ fontSize: 11, fontFamily: F.body }} axisLine={{ stroke: C.line }} />
          <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.line}`, fontFamily: F.body, fontSize: 12 }} />
          <Line type="monotone" dataKey="forecast" stroke={C.accent4} strokeWidth={2} dot={{ r: 3 }} strokeDasharray="6 3" name="Forecast" />
          <Line type="monotone" dataKey="actual" stroke={C.accent} strokeWidth={2.5} dot={{ r: 3 }} name="Actual" />
        </LineChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", gap: 18, justifyContent: "center", marginTop: 8, fontFamily: F.body, fontSize: 11, color: C.ink2 }}>
        <span><span style={{ display: "inline-block", width: 12, height: 2, background: C.accent, marginRight: 6, verticalAlign: "middle" }} />Actual Bookings</span>
        <span><span style={{ display: "inline-block", width: 12, height: 2, background: C.accent4, marginRight: 6, verticalAlign: "middle" }} />Forecast</span>
      </div>
    </ChartShell>
  );
}

function CapacityScheduleChart({ data, meta }) {
  return (
    <ChartShell meta={meta}>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 10, right: 30, bottom: 5, left: 0 }}>
          <CartesianGrid stroke={C.line} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="route" stroke={C.ink3} tick={{ fontSize: 10, fontFamily: F.body }} axisLine={{ stroke: C.line }} />
          <YAxis yAxisId="left" stroke={C.ink3} tick={{ fontSize: 11, fontFamily: F.body }} axisLine={{ stroke: C.line }} />
          <YAxis yAxisId="right" orientation="right" stroke={C.ink3} tick={{ fontSize: 11, fontFamily: F.body }} axisLine={{ stroke: C.line }} unit="%" />
          <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.line}`, fontFamily: F.body, fontSize: 12 }} />
          <Bar yAxisId="left" dataKey="py" fill={C.ink3} name="Prior Year ASMs" radius={[2, 2, 0, 0]} />
          <Bar yAxisId="left" dataKey="cy" fill={C.accent3} name="Current Year ASMs" radius={[2, 2, 0, 0]} />
          <Line yAxisId="right" type="monotone" dataKey="change" stroke={C.accent} strokeWidth={2} dot={{ r: 4 }} name="YoY Change %" />
        </ComposedChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", gap: 18, justifyContent: "center", marginTop: 8, fontFamily: F.body, fontSize: 11, color: C.ink2 }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: C.ink3, marginRight: 6 }} />Prior Year</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: C.accent3, marginRight: 6 }} />Current Year</span>
        <span><span style={{ display: "inline-block", width: 12, height: 2, background: C.accent, marginRight: 6, verticalAlign: "middle" }} />YoY %</span>
      </div>
    </ChartShell>
  );
}

function RouteQuadrantChart({ data, meta }) {
  const archColors = { star: C.good, question: C.accent3, cow: C.accent4, dog: C.bad };
  return (
    <ChartShell meta={meta}>
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 10, right: 30, bottom: 30, left: 10 }}>
          <CartesianGrid stroke={C.line} strokeDasharray="2 4" />
          <ReferenceLine x={0} stroke={C.ink3} strokeWidth={1} />
          <ReferenceLine y={75} stroke={C.ink3} strokeWidth={1} />
          <XAxis type="number" dataKey="revGrowth" name="Rev Growth" stroke={C.ink3} tick={{ fontSize: 11, fontFamily: F.body }} axisLine={{ stroke: C.line }} unit="%" domain={[-10, 25]} label={{ value: "Revenue Growth YoY (%)", position: "bottom", offset: 0, fill: C.ink2, fontSize: 11, fontFamily: F.body }} />
          <YAxis type="number" dataKey="lf" name="LF" stroke={C.ink3} tick={{ fontSize: 11, fontFamily: F.body }} axisLine={{ stroke: C.line }} unit="%" domain={[55, 100]} label={{ value: "Load Factor (%)", angle: -90, position: "insideLeft", fill: C.ink2, fontSize: 11, fontFamily: F.body }} />
          <ZAxis type="number" dataKey="asms" range={[100, 600]} />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload;
              return (
                <div style={{ background: C.card, border: `1px solid ${C.line}`, padding: 8, fontFamily: F.body, fontSize: 12 }}>
                  <div style={{ fontFamily: F.mono, color: C.ink, fontWeight: 500 }}>{p.route}</div>
                  <div style={{ color: C.ink2 }}>Rev Growth: {p.revGrowth}% · LF: {p.lf}%</div>
                  <div style={{ color: C.ink2 }}>ASMs: {p.asms}M</div>
                </div>
              );
            }}
          />
          <Scatter data={data}>
            {data.map((d, i) => <Cell key={i} fill={archColors[d.archetype] || C.ink2} fillOpacity={0.7} />)}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

function MentalMathCard({ meta }) {
  // Visual treatment is intentionally minimal — this isn't a chart, it's a calculation card
  return (
    <ChartShell meta={meta}>
      <div style={{
        padding: "40px 20px", textAlign: "center",
        background: `linear-gradient(135deg, ${C.cardDim} 0%, ${C.card} 100%)`,
        border: `1px dashed ${C.line}`, borderRadius: 4,
      }}>
        <div style={{ fontFamily: F.mono, fontSize: 11, color: C.ink3, letterSpacing: 3, textTransform: "uppercase", marginBottom: 12 }}>
          Pencil-and-paper banned · 30 seconds
        </div>
        <div style={{ fontFamily: F.display, fontSize: 28, color: C.ink, fontWeight: 500, letterSpacing: -0.3 }}>
          Quick calculation
        </div>
        <div style={{ fontFamily: F.body, fontSize: 13, color: C.ink2, maxWidth: 460, margin: "12px auto 0", lineHeight: 1.5 }}>
          The next question is mental math — exactly the kind interviewers ask live. Round freely; the closest option wins.
        </div>
      </div>
    </ChartShell>
  );
}

function renderChart(chart) {
  switch (chart.type) {
    // General finance charts
    case "revenueMargin": return <RevenueMarginChart {...chart} />;
    case "cashWaterfall": return <WaterfallChart {...chart} />;
    case "marginBridge": return <WaterfallChart {...chart} />;
    case "cohortRetention": return <CohortHeatmap {...chart} />;
    case "sensitivity": return <SensitivityTable {...chart} />;
    case "workingCapital": return <WorkingCapitalChart {...chart} />;
    case "balanceSheet": return <BalanceSheetChart {...chart} />;
    case "comps": return <CompsTable {...chart} />;
    // Airline charts
    case "bookingCurve": return <BookingCurveChart {...chart} />;
    case "lfYieldScatter": return <LfYieldScatterChart {...chart} />;
    case "fareClassMix": return <FareClassMixChart {...chart} />;
    case "competitiveFareLadder": return <CompetitiveFareLadderChart {...chart} />;
    case "rasmBridge": return <WaterfallChart {...chart} />;
    case "forecastActuals": return <ForecastActualsChart {...chart} />;
    case "capacitySchedule": return <CapacityScheduleChart {...chart} />;
    case "routeQuadrant": return <RouteQuadrantChart {...chart} />;
    // Mental math
    case "mentalMath": return <MentalMathCard {...chart} />;
    default: return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SCREENS
// ═══════════════════════════════════════════════════════════════════════════
const DAILY_LIMIT = 5;

function Home({ profile, onStart, onReset, onModeChange, loading }) {
  const today = new Date().toISOString().slice(0, 10);
  const isNewDay = profile.testsDate !== today;
  const testsLeft = isNewDay ? DAILY_LIMIT : Math.max(0, DAILY_LIMIT - profile.testsToday);

  const mode = profile.mode || "airline";
  const active = activeProfile(profile);
  const skillList = skillsForMode(mode);

  const sorted = skillList.map((s) => ({
    skill: s,
    ability: active.ability[s] ?? 0.4,
    attempts: active.attempts[s] || 0,
  })).sort((a, b) => a.ability - b.ability);

  const overall = round(
    skillList.reduce((sum, s) => sum + (active.ability[s] ?? 0.4), 0) / skillList.length * 100, 0
  );

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "60px 32px 80px" }}>
      <div style={{ marginBottom: 48 }}>
        <div style={{ fontFamily: F.mono, fontSize: 10, color: C.ink3, letterSpacing: 2, textTransform: "uppercase" }}>
          {mode === "airline" ? "Airline Revenue Management · Interview Prep" : "Daily Practice · Financial Chart Reading"}
        </div>
        <h1 style={{
          fontFamily: F.display, fontSize: 56, lineHeight: 1.05, color: C.ink,
          margin: "12px 0 16px", fontWeight: 500, letterSpacing: -1.2,
        }}>
          {mode === "airline" ? <>Read the booking curve.<br /><em style={{ color: C.accent }}>Run the route.</em></>
                              : <>Train your eye.<br /><em style={{ color: C.accent }}>Read the numbers.</em></>}
        </h1>
        <p style={{ fontFamily: F.body, fontSize: 16, color: C.ink2, maxWidth: 560, lineHeight: 1.6 }}>
          A timed assessment {mode === "airline" ? "for airline revenue management interviews" : "for finance and accounting interviews"}. Each session presents three charts or tables
          modeled on the questions analysts actually face{mode === "airline" ? ", plus a mental-math card mid-session" : ""}. Your responses reshape what comes next.
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
          Practice Mode
        </div>
        <div style={{
          background: C.card, border: `1px solid ${C.line}`, padding: 20, borderRadius: 4,
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap",
          marginBottom: 24,
        }}>
          <div style={{ flex: "1 1 280px" }}>
            <div style={{ fontFamily: F.display, fontSize: 18, color: C.ink, fontWeight: 500, marginBottom: 4 }}>
              {mode === "airline" ? "Airline Revenue Management" : "General Finance & Accounting"}
            </div>
            <div style={{ fontFamily: F.body, fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>
              {mode === "airline"
                ? "Booking curves, LF/yield, fare class mix, RASM, demand forecasting, and 12 other RM skills."
                : "Revenue trends, margin bridges, cohort retention, DCF sensitivity, and 8 other finance skills."}
              <br />
              <span style={{ color: C.ink3, fontSize: 12 }}>
                Switching modes preserves your record in both. Daily test limit ({DAILY_LIMIT}) is shared.
              </span>
            </div>
          </div>
          <div style={{ display: "flex", background: C.cardDim, padding: 4, borderRadius: 4, border: `1px solid ${C.line}` }}>
            <button
              onClick={() => mode !== "airline" && onModeChange("airline")}
              style={{
                padding: "10px 20px", border: "none", borderRadius: 3, cursor: "pointer",
                background: mode === "airline" ? C.ink : "transparent",
                color: mode === "airline" ? C.bg : C.ink2,
                fontFamily: F.body, fontSize: 13, fontWeight: 500, letterSpacing: 0.3,
                transition: "background 0.15s, color 0.15s",
              }}
            >
              Airlines
            </button>
            <button
              onClick={() => mode !== "general" && onModeChange("general")}
              style={{
                padding: "10px 20px", border: "none", borderRadius: 3, cursor: "pointer",
                background: mode === "general" ? C.ink : "transparent",
                color: mode === "general" ? C.bg : C.ink2,
                fontFamily: F.body, fontSize: 13, fontWeight: 500, letterSpacing: 0.3,
                transition: "background 0.15s, color 0.15s",
              }}
            >
              General
            </button>
          </div>
        </div>

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

  const mode = profile.mode || "airline";
  const active = activeProfile(profile);
  const prevActive = activeProfile(prevProfile);
  const skillList = skillsForMode(mode);

  const deltas = skillList.map((s) => ({
    skill: s,
    before: prevActive.ability[s] ?? 0.4,
    after: active.ability[s] ?? 0.4,
    delta: (active.ability[s] ?? 0.4) - (prevActive.ability[s] ?? 0.4),
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
const STORAGE_KEY = "finchart_profile_v2";  // bumped from v1 to trigger migration

// Migrate v1 (flat profile) data into v2's generalProfile slot
function migrateV1IfNeeded(parsed) {
  if (parsed.airlineProfile && parsed.generalProfile) return parsed;  // already v2
  // v1 had: { ability, attempts, correct, testsToday, testsDate, history }
  if (parsed.ability) {
    return {
      mode: "airline",
      airlineProfile: makeModeProfile(AIRLINE_SKILL_LIST),
      generalProfile: {
        ability: { ...makeModeProfile(SKILL_LIST).ability, ...parsed.ability },
        attempts: { ...makeModeProfile(SKILL_LIST).attempts, ...parsed.attempts },
        correct: { ...makeModeProfile(SKILL_LIST).correct, ...parsed.correct },
        history: parsed.history || [],
      },
      testsToday: parsed.testsToday || 0,
      testsDate: parsed.testsDate || new Date().toISOString().slice(0, 10),
    };
  }
  return parsed;
}

// Ensure all skills for both modes are present (heals schema drift)
function healProfile(p) {
  const healed = { ...p };
  if (!healed.airlineProfile) healed.airlineProfile = makeModeProfile(AIRLINE_SKILL_LIST);
  if (!healed.generalProfile) healed.generalProfile = makeModeProfile(SKILL_LIST);
  AIRLINE_SKILL_LIST.forEach((s) => {
    if (healed.airlineProfile.ability[s] === undefined) healed.airlineProfile.ability[s] = 0.4;
    if (healed.airlineProfile.attempts[s] === undefined) healed.airlineProfile.attempts[s] = 0;
    if (healed.airlineProfile.correct[s] === undefined) healed.airlineProfile.correct[s] = 0;
  });
  SKILL_LIST.forEach((s) => {
    if (healed.generalProfile.ability[s] === undefined) healed.generalProfile.ability[s] = 0.4;
    if (healed.generalProfile.attempts[s] === undefined) healed.generalProfile.attempts[s] = 0;
    if (healed.generalProfile.correct[s] === undefined) healed.generalProfile.correct[s] = 0;
  });
  if (!healed.mode) healed.mode = "airline";
  return healed;
}

export default function App() {
  const [screen, setScreen] = useState("loading");
  const [profile, setProfile] = useState(DEFAULT_PROFILE());
  const [prevProfile, setPrevProfile] = useState(DEFAULT_PROFILE());
  const [charts, setCharts] = useState(null);
  const [answers, setAnswers] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      // Try v2 first, then fall back to v1 for migration
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) raw = localStorage.getItem("finchart_profile_v1");
      if (raw) {
        let parsed = JSON.parse(raw);
        parsed = migrateV1IfNeeded(parsed);
        parsed = healProfile(parsed);
        const today = new Date().toISOString().slice(0, 10);
        if (parsed.testsDate !== today) {
          parsed = { ...parsed, testsToday: 0, testsDate: today };
        }
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
    const mode = profile.mode || "airline";
    const newCharts = buildTest(activeProfile(profile), rng, mode);
    setCharts(newCharts);
    setPrevProfile(JSON.parse(JSON.stringify(profile)));
    setTimeout(() => {
      setLoading(false);
      setScreen("test");
    }, 400);
  };

  const completeTest = async (sessionAnswers) => {
    const mode = profile.mode || "airline";
    const modeKey = mode === "airline" ? "airlineProfile" : "generalProfile";
    let activeUpdated = profile[modeKey];
    sessionAnswers.forEach((a) => {
      activeUpdated = updateAbility(activeUpdated, a.skills, a.correct, a.difficulty);
    });
    activeUpdated = {
      ...activeUpdated,
      history: [
        ...(activeUpdated.history || []),
        {
          date: new Date().toISOString(),
          correct: sessionAnswers.filter((a) => a.correct).length,
          total: sessionAnswers.length,
        },
      ].slice(-30),
    };
    const updated = {
      ...profile,
      [modeKey]: activeUpdated,
      testsToday: (profile.testsToday || 0) + 1,
      testsDate: new Date().toISOString().slice(0, 10),
    };
    setProfile(updated);
    setAnswers(sessionAnswers);
    save(updated);
    setScreen("results");
  };

  const exitTest = async () => {
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

  const changeMode = async (newMode) => {
    const updated = { ...profile, mode: newMode };
    setProfile(updated);
    save(updated);
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
              {(profile.mode || "airline") === "airline" ? "RM Interview Prep" : "Chart Reading"} · Beta
            </div>
          </div>
          <div style={{ fontFamily: F.mono, fontSize: 10, color: C.ink3, letterSpacing: 1.5 }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </div>
        </div>

        {screen === "home" && <Home profile={profile} onStart={startTest} onReset={resetProfile} onModeChange={changeMode} loading={loading} />}
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
