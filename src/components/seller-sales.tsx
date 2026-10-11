import { useNavigate } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SellerBot } from "@/lib/data";
import { useIsMobile } from "@/hooks/use-mobile";

type TickProps = { x?: number; y?: number; payload?: { value: string } };

export function SellerSales({ bots }: { bots: SellerBot[] }) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const data = bots
    .filter((bot) => bot.status === "published")
    .map((bot) => ({ id: bot.id, name: bot.title, sales: bot.sales }));
  const salesByName = Object.fromEntries(data.map((d) => [d.name, d.sales]));
  // Bot nomi ustun ostida, sotilgan soni uning yonida (tor ekranda — ostma-ost).
  const Tick = ({ x = 0, y = 0, payload }: TickProps) => {
    const name = payload?.value ?? "";
    const count = `${salesByName[name] ?? 0} ta`;
    return (
      <text x={x} y={y + 16} textAnchor="middle" fontSize={isMobile ? 10 : 12}>
        <tspan fill="var(--foreground)" fontWeight={500}>
          {name}
        </tspan>
        {isMobile ? (
          <tspan x={x} dy={14} fill="var(--primary)" fontWeight={700}>
            {count}
          </tspan>
        ) : (
          <tspan dx={6} fill="var(--primary)" fontWeight={700}>
            {count}
          </tspan>
        )}
      </text>
    );
  };
  return (
    <section className="mt-7 border-t pt-6" aria-label="Botlar sotuv diagrammasi">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-semibold">Botlar bo‘yicha sotuvlar</h2>
        {data.length > 0 && (
          <span className="text-xs text-muted-foreground">
            Bot tafsilotlari uchun ustunni bosing
          </span>
        )}
      </div>
      {data.length === 0 ? (
        <p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          Hozircha sotuv statistikasi yo‘q.
        </p>
      ) : (
        <div className="h-72 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 24, right: 12, bottom: 8, left: -20 }}
              barSize={isMobile ? 28 : 48}
            >
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="name"
                interval={0}
                tick={Tick}
                axisLine={false}
                tickLine={false}
                height={isMobile ? 48 : 36}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)" }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <div className="rounded-md border bg-popover p-3 text-sm shadow-sm">
                      <p className="font-medium">{String(payload[0]?.payload.name)}</p>
                      <p className="mt-1 text-primary">{String(payload[0]?.value)} ta sotilgan</p>
                    </div>
                  ) : null
                }
              />
              <Bar
                dataKey="sales"
                name="Sotilgan"
                fill="var(--primary)"
                radius={[5, 5, 0, 0]}
                cursor="pointer"
                onClick={(entry) => {
                  const botId =
                    entry && typeof entry === "object" && "id" in entry ? entry.id : undefined;
                  if (typeof botId === "string") {
                    void navigate({ to: "/seller-bots/$id", params: { id: botId } });
                  }
                }}
              >
                <LabelList dataKey="sales" position="top" fill="var(--foreground)" fontSize={12} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
