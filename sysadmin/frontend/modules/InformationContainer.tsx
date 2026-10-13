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
  ...sectionProps
}) => {
  return (
    <section
      {...sectionProps}
      className={cn(
        "relative min-w-0 overflow-hidden rounded-xl border border-border/70 bg-card p-4 shadow-sm transition-shadow hover:shadow-md before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-gradient-to-r before:from-cyan-500 before:via-sky-400 before:to-transparent",
        className,
      )}
    >
      <h2 className="mb-3 break-words text-base font-semibold tracking-tight text-card-foreground">
        {title}
      </h2>
      <ul className="space-y-1.5 text-xs leading-5 text-muted-foreground sm:text-sm">
        {labels.map((item, index) => (
          <li
            key={index}
            className="break-words whitespace-pre-line rounded-md bg-background/50 px-2.5 py-1.5"
          >
            {item}
          </li>
        ))}
      </ul>
      {chartBase?.length && maxValue > 0 ? (
        <>
          <ChartContainer
            className="mt-3 h-36 w-full"
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
              barSize={12}
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
                  fontSize={12}
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
