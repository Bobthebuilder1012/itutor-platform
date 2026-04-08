'use client';

export type MonthlyRetentionRow = {
  year: number;
  month: number;
  monthLabel: string;
  startCount: number;
  endCount: number;
  changePercent: number | null;
  retentionPercent: number | null;
};

type AnalyticsSummary = {
  total_sessions: number;
  average_attendance_rate: number;
  student_retention_rate: number;
};

type Props = {
  groupName: string;
  estimatedEarnings: number;
  analytics: AnalyticsSummary | null;
  monthlyRetention: MonthlyRetentionRow[] | null;
  loadingRetention: boolean;
};

const PAD = { t: 28, r: 20, b: 48, l: 44 };

function shortAxisMonth(label: string) {
  const parts = label.trim().split(/\s+/);
  if (parts.length >= 2 && parts[1].length === 4) {
    return `${parts[0]} '${parts[1].slice(2)}`;
  }
  return label;
}

export default function GroupAnalyticsTab({
  groupName,
  estimatedEarnings,
  analytics,
  monthlyRetention,
  loadingRetention,
}: Props) {
  const months = monthlyRetention ?? [];
  const hasData = months.length > 0;

  const maxEnrollment = Math.max(
    1,
    ...months.flatMap((m) => [m.startCount, m.endCount])
  );

  const changeValues = months
    .map((m) => m.changePercent)
    .filter((v): v is number => v != null);
  const maxAbsChange = Math.max(5, ...changeValues.map((v) => Math.abs(v)), 1);

  const chartW = 720;
  const chartH = 240;
  const innerW = chartW - PAD.l - PAD.r;
  const innerH = chartH - PAD.t - PAD.b;
  const nChart = Math.max(months.length, 1);
  const groupW = innerW / nChart;
  const barW = Math.min(22, groupW * 0.28);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Analytics</h2>
        <p className="text-[13px] text-slate-500 mt-1">
          Overview and monthly enrollment retention for <span className="font-medium text-slate-700">{groupName}</span>
          (subscription enrollments, UTC months).
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 text-center border-t-[3px] border-t-emerald-500">
          <p className="text-2xl font-extrabold text-gray-900">{analytics?.total_sessions ?? 0}</p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">Total sessions</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 text-center border-t-[3px] border-t-indigo-500">
          <p className="text-2xl font-extrabold text-gray-900">{analytics?.average_attendance_rate ?? 0}%</p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">Avg attendance</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 text-center border-t-[3px] border-t-orange-500">
          <p className="text-2xl font-extrabold text-gray-900">{analytics?.student_retention_rate ?? 0}%</p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">Session retention</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 text-center border-t-[3px] border-t-amber-400">
          <p className="text-2xl font-extrabold text-emerald-700">${estimatedEarnings.toFixed(0)}</p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">Total earnings</p>
        </div>
      </div>

      <section className="rounded-[14px] border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-[15px] font-bold text-gray-900">Monthly enrollment (start vs end)</h3>
        <p className="text-[12px] text-slate-500 mt-1 mb-4">
          Subscribed students at the first moment of each month vs the last. Taller bars mean more enrolled.
        </p>
        {loadingRetention ? (
          <div className="py-16 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
          </div>
        ) : !hasData ? (
          <p className="text-sm text-slate-500 py-8 text-center">No subscription enrollment data yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <svg
              width="100%"
              height={chartH}
              viewBox={`0 0 ${chartW} ${chartH}`}
              className="min-w-[520px]"
              role="img"
              aria-label="Bar chart of enrollment at month start versus month end"
            >
              {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                const y = PAD.t + innerH * (1 - t);
                const val = Math.round(maxEnrollment * t);
                return (
                  <g key={t}>
                    <line
                      x1={PAD.l}
                      y1={y}
                      x2={chartW - PAD.r}
                      y2={y}
                      stroke="#e2e8f0"
                      strokeWidth={1}
                    />
                    <text x={PAD.l - 8} y={y + 4} textAnchor="end" fill="#94a3b8" fontSize={10}>
                      {val}
                    </text>
                  </g>
                );
              })}
              {months.map((m, i) => {
                const cx = PAD.l + i * groupW + groupW / 2;
                const hStart = (m.startCount / maxEnrollment) * innerH;
                const hEnd = (m.endCount / maxEnrollment) * innerH;
                const xStart = cx - barW - 2;
                const xEnd = cx + 2;
                const yBase = PAD.t + innerH;
                return (
                  <g key={`${m.year}-${m.month}`}>
                    <rect
                      x={xStart}
                      y={yBase - hStart}
                      width={barW}
                      height={hStart}
                      rx={3}
                      className="fill-indigo-400"
                    />
                    <rect
                      x={xEnd}
                      y={yBase - hEnd}
                      width={barW}
                      height={hEnd}
                      rx={3}
                      className="fill-emerald-500"
                    />
                    <text
                      x={cx}
                      y={chartH - 12}
                      textAnchor="middle"
                      fill="#475569"
                      fontSize={9}
                      fontWeight={500}
                    >
                      {shortAxisMonth(m.monthLabel)}
                    </text>
                  </g>
                );
              })}
              <text x={PAD.l + 8} y={18} fill="#4f46e5" fontSize={10} fontWeight={600}>
                ● Start
              </text>
              <text x={PAD.l + 68} y={18} fill="#059669" fontSize={10} fontWeight={600}>
                ● End
              </text>
            </svg>
          </div>
        )}
      </section>

      <section className="rounded-[14px] border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-[15px] font-bold text-gray-900">Month-over-month change %</h3>
        <p className="text-[12px] text-slate-500 mt-1 mb-4">
          Percent change in enrolled students from month start to month end (relative to start count).
        </p>
        {loadingRetention ? (
          <div className="py-16 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
          </div>
        ) : !hasData ? (
          <p className="text-sm text-slate-500 py-8 text-center">No data to chart.</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <svg
              width="100%"
              height={200}
              viewBox={`0 0 ${chartW} 200`}
              className="min-w-[520px]"
              role="img"
              aria-label="Bar chart of percent change in enrollment per month"
            >
              <line
                x1={PAD.l}
                y1={100}
                x2={chartW - PAD.r}
                y2={100}
                stroke="#94a3b8"
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <text x={PAD.l - 6} y={104} textAnchor="end" fill="#94a3b8" fontSize={9}>
                0%
              </text>
              <text x={PAD.l - 6} y={36} textAnchor="end" fill="#94a3b8" fontSize={9}>
                +{Math.round(maxAbsChange)}%
              </text>
              <text x={PAD.l - 6} y={168} textAnchor="end" fill="#94a3b8" fontSize={9}>
                -{Math.round(maxAbsChange)}%
              </text>
              {months.map((m, i) => {
                const cx = PAD.l + i * groupW + groupW / 2;
                const pct = m.changePercent;
                const label = shortAxisMonth(m.monthLabel);
                if (pct == null) {
                  return (
                    <g key={`ch-${m.year}-${m.month}`}>
                      <text x={cx} y={188} textAnchor="middle" fill="#94a3b8" fontSize={9}>
                        {label}
                      </text>
                    </g>
                  );
                }
                const scale = 68 / maxAbsChange;
                const barH = Math.min(68, Math.abs(pct) * scale);
                const isPos = pct >= 0;
                const yTop = isPos ? 100 - barH : 100;
                const fill = pct > 0 ? '#059669' : pct < 0 ? '#dc2626' : '#64748b';
                return (
                  <g key={`ch-${m.year}-${m.month}`}>
                    <rect
                      x={cx - barW}
                      y={yTop}
                      width={barW * 2}
                      height={Math.max(barH, 2)}
                      rx={2}
                      fill={fill}
                    />
                    <text
                      x={cx}
                      y={isPos ? yTop - 4 : yTop + barH + 12}
                      textAnchor="middle"
                      fill="#334155"
                      fontSize={9}
                      fontWeight={600}
                    >
                      {pct > 0 ? '+' : ''}
                      {pct}%
                    </text>
                    <text x={cx} y={188} textAnchor="middle" fill="#475569" fontSize={9} fontWeight={500}>
                      {label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </section>

      <section className="rounded-[14px] border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-[15px] font-bold text-gray-900">Monthly numbers</h3>
        <p className="text-[12px] text-slate-500 mt-1 mb-3">Same data as the charts, in table form.</p>
        {loadingRetention ? (
          <div className="py-8 flex justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600" />
          </div>
        ) : !hasData ? (
          <p className="text-sm text-slate-500">No rows yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="text-slate-500 border-b border-gray-200">
                  <th className="py-2 pr-3 font-semibold">Month</th>
                  <th className="py-2 px-2 font-semibold text-right">Start</th>
                  <th className="py-2 px-2 font-semibold text-right">End</th>
                  <th className="py-2 pl-2 font-semibold text-right">Change</th>
                  <th className="py-2 pl-2 font-semibold text-right">Retention</th>
                </tr>
              </thead>
              <tbody>
                {months.map((row) => (
                  <tr key={`${row.year}-${row.month}`} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 pr-3 text-slate-800 font-medium">{row.monthLabel}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{row.startCount}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{row.endCount}</td>
                    <td className="py-2 pl-2 text-right tabular-nums font-semibold">
                      {row.changePercent == null ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <span
                          className={
                            row.changePercent > 0
                              ? 'text-emerald-600'
                              : row.changePercent < 0
                                ? 'text-red-600'
                                : 'text-slate-600'
                          }
                        >
                          {row.changePercent > 0 ? '+' : ''}
                          {row.changePercent}%
                        </span>
                      )}
                    </td>
                    <td className="py-2 pl-2 text-right tabular-nums text-slate-600">
                      {row.retentionPercent == null ? '—' : `${row.retentionPercent}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
