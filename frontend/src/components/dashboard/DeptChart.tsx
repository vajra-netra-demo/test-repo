import { useMemo } from "react";
import type { RiskLevel, SaaSTool } from "../../types";
import { riskColors, riskLevel } from "../../lib/risk";
import { useTheme } from "../../theme/ThemeProvider";

interface DeptCounts {
  High: number;
  Medium: number;
  Low: number;
}

export function DeptChart({ tools }: { tools: SaaSTool[] }) {
  const { theme } = useTheme();
  const colors = riskColors(theme);
  const rows = useMemo(() => {
    const byDept: Record<string, DeptCounts> = {};
    tools.forEach((t) => {
      if (!byDept[t.department]) byDept[t.department] = { High: 0, Medium: 0, Low: 0 };
      const level = riskLevel(t.risk_score);
      if (level) byDept[t.department][level]++;
    });
    const maxTotal = Math.max(1, ...Object.values(byDept).map((d) => d.High + d.Medium + d.Low));
    const entries = Object.entries(byDept)
      .map(([dept, counts]) => ({ dept, counts, total: counts.High + counts.Medium + counts.Low }))
      .sort((a, b) => b.total - a.total);
    return { entries, maxTotal };
  }, [tools]);

  return (
    <div className="glass glass-hover rounded-xl p-5">
      <h3 className="mb-4 text-[13px] uppercase tracking-wide text-muted">By Department</h3>
      {rows.entries.length === 0 ? (
        <div className="py-10 text-center text-muted">No data yet.</div>
      ) : (
        rows.entries.map(({ dept, counts, total }) => {
          const widthPct = (v: number) => (total ? (v / rows.maxTotal) * 100 : 0);
          return (
            <div key={dept} className="mb-2.5 flex items-center gap-2.5 text-[12px]">
              <div className="w-[130px] shrink-0 overflow-hidden text-ellipsis whitespace-nowrap text-muted" title={dept}>
                {dept}
              </div>
              <div className="flex h-3.5 flex-1 gap-[2px] rounded bg-tint/[0.06]">
                {(["High", "Medium", "Low"] as RiskLevel[]).map((level) =>
                  counts[level] === 0 ? null : (
                    <div
                      key={level}
                      className="h-full rounded-[3px] transition-opacity hover:opacity-80"
                      style={{ width: `${widthPct(counts[level])}%`, background: colors[level] }}
                      title={`${level}: ${counts[level]} tool${counts[level] !== 1 ? "s" : ""}`}
                    />
                  ),
                )}
              </div>
              <div className="w-6 text-right font-semibold text-muted">{total}</div>
            </div>
          );
        })
      )}
    </div>
  );
}
