import { periodRange } from "./workdays-v2.mjs";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
export default function WorkdayInsights({
  rows,
  period,
  onDate,
}: {
  rows: any[];
  period: string;
  onDate: (date: string) => void;
}) {
  const buckets = new Map<string, any>();
  for (const r of rows) {
    const date =
      period === "quarter"
        ? r.date.slice(0, 7) + "-01"
        : period === "month"
          ? periodRange(r.date, "week").start
          : r.date;
    if (!buckets.has(date))
      buckets.set(date, {
        date,
        home: 0,
        office: 0,
        leave: 0,
        plannedHome: 0,
        plannedOffice: 0,
        plannedLeave: 0,
      });
    for (const k of [
      "home",
      "office",
      "leave",
      "plannedHome",
      "plannedOffice",
      "plannedLeave",
    ])
      buckets.get(date)[k] += r[k];
  }
  const data = [...buckets.values()],
    series = [
      ["home", "Home", "#739fd4"],
      ["office", "Office", "#69b5a2"],
      ["leave", "Leave", "#c9a160"],
      ["plannedHome", "Home planned", "#739fd4"],
      ["plannedOffice", "Office planned", "#69b5a2"],
      ["plannedLeave", "Leave planned", "#c9a160"],
    ];
  return (
    <section aria-label="Work schedule chart" className="wd2-chart">
      <div style={{ width: "100%", height: 230 }}>
        <ResponsiveContainer>
          <BarChart
            data={data}
            accessibilityLayer
            margin={{ top: 12, right: 4, left: -20, bottom: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis
              dataKey="date"
              tickFormatter={(d) =>
                period === "quarter" ? d.slice(0, 7) : d.slice(5)
              }
              tick={{ fill: "var(--muted)", fontSize: 11 }}
            />
            <YAxis
              allowDecimals
              tick={{ fill: "var(--muted)", fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{
                background: "var(--panel)",
                border: "1px solid var(--line)",
                borderRadius: 8,
                color: "var(--text)",
              }}
            />
            {series.map(([key, name, fill]) => (
              <Bar
                key={key}
                dataKey={key}
                name={name}
                fill={fill}
                fillOpacity={key.startsWith("planned") ? 0.35 : 1}
                stackId="work"
                isAnimationActive={false}
                onClick={(entry: any) => {
                  const date = entry.payload?.date || entry.date;
                  if (date) onDate(date);
                }}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="wd2-legend">
        {series.slice(0, 3).map(([key, name, fill]) => (
          <span key={key}>
            <i style={{ background: fill }} />
            {name}
          </span>
        ))}
        <span>Faded = planned</span>
      </div>
      <details>
        <summary>View data table</summary>
        <div className="wd2-table-scroll">
          <table>
            <caption>Recorded and planned workdays</caption>
            <thead>
              <tr>
                <th>Date</th>
                {series.map(([key, name]) => (
                  <th key={key}>{name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.date}>
                  <th>
                    <button className="wd2-link" onClick={() => onDate(r.date)}>
                      {r.date}
                    </button>
                  </th>
                  {series.map(([key]) => (
                    <td key={key}>{r[key]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
