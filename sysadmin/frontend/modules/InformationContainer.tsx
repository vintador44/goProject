import React from "react";
import { cn } from "cn";
import { LabelList, PolarAngleAxis, RadialBar, RadialBarChart } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export type InformationContainerProps = React.ComponentProps<"section"> & {
  title: string;
  labels: string[];
  chartBase: [string, number][] | null;
  maxValue?: number;
  metadata?: string;
};

export const InformationContainer: React.FC<InformationContainerProps> = ({
  title,
  labels,
  chartBase,
  maxValue = 100,
  metadata = "",
  className,
}) => {
  return (
    <section className={cn("min-w-0 rounded border bg-accent p-3", className)}>
      <h2 className="mb-2 break-words text-base font-semibold text-slate-100">
        {title}
      </h2>
      <ul className="space-y-1 text-sm text-slate-300">
        {labels.map((item, index) => (
          <li key={index} className="break-words">
            {item}
          </li>
        ))}
      </ul>
      {chartBase?.length && maxValue > 0 ? (
        <>
          <ChartContainer
            className="mt-2 h-48 w-full"
            config={
              {
                value: { label: "Number", color: "var(--chart-1)" },
              } satisfies ChartConfig
            }
          >
            <RadialBarChart
              data={chartBase.map(([name, value], index) => ({
                name,
                value,
                fill: `var(--chart-${index + 1})`,
              }))}
              startAngle={90}
              endAngle={-270}
              innerRadius="25%"
              outerRadius="100%"
              barSize={16}
            >
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    hideLabel
                    formatter={(value, _name, item) =>
                      `${item.payload?.name ?? "Value"}: ${value} ${metadata}`
                    }
                  />
                }
              />
              <PolarAngleAxis
                type="number"
                domain={[0, maxValue]}
                tick={false}
              />
              <RadialBar
                dataKey="value"
                isAnimationActive={false}
                background={{
                  style: { fill: "rgba(148, 163, 184, 0.35)" },
                }}
                cornerRadius={8}
              >
                <LabelList
                  dataKey="name"
                  position="insideStart"
                  fill="#070606"
                  fontSize={14}
                  fontWeight={600}
                />
              </RadialBar>
            </RadialBarChart>
          </ChartContainer>
        </>
      ) : null}
    </section>
  );
};
