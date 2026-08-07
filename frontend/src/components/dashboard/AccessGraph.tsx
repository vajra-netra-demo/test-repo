import { useMemo } from "react";
import type { RiskLevel, SaaSTool } from "../../types";
import { chartInk, riskColors, RISK_GLOW, riskLevel } from "../../lib/risk";
import { useTheme } from "../../theme/ThemeProvider";

// Broad data-category buckets, matched by keyword against each tool's
// data_categories_accessed strings — covers both plain-English sample data
// ("Customer PII") and GitHub-style scope names ("contents:write").
const CATEGORY_RULES: Array<{ label: string; keywords: string[] }> = [
  { label: "Customer/Personal Data", keywords: ["pii", "customer", "contact"] },
  { label: "Financial Data", keywords: ["bank", "invoice", "financial", "salary", "payroll"] },
  { label: "Email & Communications", keywords: ["email", "mail", "message"] },
  { label: "Source Code", keywords: ["source code", "repositor", "contents", "pull_request", "checks", "statuses"] },
  { label: "Admin/Org Data", keywords: ["admin", "organization", "director", "member", "hook"] },
  { label: "Calendar/Meetings", keywords: ["calendar", "meeting"] },
  { label: "Files & Documents", keywords: ["file", "drive", "document"] },
];

function categorize(rawStrings: string[] | null | undefined): string[] {
  const buckets = new Set<string>();
  (rawStrings || []).forEach((s) => {
    const lower = s.toLowerCase();
    const match = CATEGORY_RULES.find((rule) => rule.keywords.some((k) => lower.includes(k)));
    buckets.add(match ? match.label : "Other");
  });
  return buckets.size ? Array.from(buckets) : ["Other"];
}

const LEVELS: RiskLevel[] = ["High", "Medium", "Low"];

export function AccessGraph({ tools }: { tools: SaaSTool[] }) {
  const { theme } = useTheme();
  const colors = riskColors(theme);
  const ink = chartInk(theme);
  const graph = useMemo(() => {
    const assessed = tools.filter((t) => t.risk_score !== null && t.risk_score !== undefined);

    const edges: Record<string, Record<RiskLevel, number>> = {};
    assessed.forEach((t) => {
      const level = riskLevel(t.risk_score);
      if (!level) return;
      categorize(t.data_categories_accessed).forEach((cat) => {
        if (!edges[cat]) edges[cat] = { High: 0, Medium: 0, Low: 0 };
        edges[cat][level]++;
      });
    });

    const categories = Object.entries(edges)
      .map(([cat, counts]) => ({ cat, counts, total: counts.High + counts.Medium + counts.Low }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    // Distinct tool count per level (matches the KPI cards) — NOT a sum
    // across categories, which would double-count any tool spanning
    // multiple data-category buckets.
    const distinctByLevel: Record<RiskLevel, number> = { High: 0, Medium: 0, Low: 0 };
    LEVELS.forEach((lv) => {
      distinctByLevel[lv] = assessed.filter((t) => riskLevel(t.risk_score) === lv).length;
    });

    return { categories, distinctByLevel };
  }, [tools]);

  const { categories, distinctByLevel } = graph;

  if (categories.length === 0) {
    return (
      <div className="glass glass-hover rounded-xl p-5">
        <h3 className="mb-4 text-[13px] uppercase tracking-wide text-muted">
          Which kinds of data flow into which risk level (line thickness = number of tools)
        </h3>
        <svg width="100%" height={380} viewBox="0 0 640 380">
          <text x={320} y={190} textAnchor="middle" fontSize={13} fill={ink.muted}>
            No assessed tools yet.
          </text>
        </svg>
      </div>
    );
  }

  const leftX = 150,
    rightX = 500,
    topY = 30,
    bottomY = 350;
  const leftStep = categories.length > 1 ? (bottomY - topY) / (categories.length - 1) : 0;
  const rightStep = (bottomY - topY) / (LEVELS.length - 1);
  const maxTotal = Math.max(...categories.map((c) => c.total));
  const maxLevelTotal = Math.max(1, ...LEVELS.map((lv) => distinctByLevel[lv]));

  const leftPos: Record<string, number> = {};
  categories.forEach((c, i) => {
    leftPos[c.cat] = topY + (categories.length > 1 ? i * leftStep : (bottomY - topY) / 2);
  });
  const rightPos: Record<RiskLevel, number> = { High: 0, Medium: 0, Low: 0 };
  LEVELS.forEach((lv, i) => {
    rightPos[lv] = topY + i * rightStep;
  });
  const midX = (leftX + rightX) / 2;

  return (
    <div className="glass glass-hover rounded-xl p-5">
      <h3 className="mb-4 text-[13px] uppercase tracking-wide text-muted">
        Which kinds of data flow into which risk level (line thickness = number of tools)
      </h3>
      <svg width="100%" height={380} viewBox="0 0 640 380" preserveAspectRatio="xMidYMid meet">
        {categories.flatMap((c) =>
          LEVELS.map((lv) => {
            const count = c.counts[lv];
            if (count === 0) return null;
            const y1 = leftPos[c.cat],
              y2 = rightPos[lv];
            const strokeWidth = 1.5 + (count / maxTotal) * 10;
            return (
              <path
                key={`${c.cat}-${lv}`}
                d={`M${leftX + 14},${y1} C${midX},${y1} ${midX},${y2} ${rightX - 14},${y2}`}
                fill="none"
                stroke={colors[lv]}
                strokeWidth={strokeWidth}
                opacity={0.45}
              />
            );
          }),
        )}

        {categories.map((c) => {
          const r = 8 + (c.total / maxTotal) * 10;
          const y = leftPos[c.cat];
          return (
            <g key={c.cat}>
              <circle cx={leftX} cy={y} r={r} fill={ink.accent} className="glow-accent" />
              <text x={leftX - 20} y={y} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={ink.ink} fontWeight={600}>
                {c.cat}
              </text>
              <text x={leftX - 20} y={y + 13} textAnchor="end" fontSize={9.5} fill={ink.muted}>
                {c.total} tool{c.total !== 1 ? "s" : ""}
              </text>
            </g>
          );
        })}

        {LEVELS.map((lv) => {
          const total = distinctByLevel[lv];
          const r = 8 + (total / maxLevelTotal) * 10;
          const y = rightPos[lv];
          return (
            <g key={lv}>
              <circle cx={rightX} cy={y} r={r} fill={colors[lv]} className={RISK_GLOW[lv]} />
              <text x={rightX + 20} y={y} textAnchor="start" dominantBaseline="middle" fontSize={12} fill={ink.ink} fontWeight={700}>
                {lv} Risk
              </text>
              <text x={rightX + 20} y={y + 14} textAnchor="start" fontSize={9.5} fill={ink.muted}>
                {total} tool{total !== 1 ? "s" : ""}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
