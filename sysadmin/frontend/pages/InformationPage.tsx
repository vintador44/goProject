import { useEffect, useState } from "react";
import { MenuItem, LeftSideBar } from "../modules/SideBar";

import { sysmon } from "../wailsjs/go/models";
import {
  GetCPUInfo,
  GetGPUInfo,
  GetDiskInfoCross,
  GetNetworkInfo,
  GetRAMInfoCross,
  HostInfo,
} from "../wailsjs/go/sysmon/SystemMonitor";

import { LabelList, PolarAngleAxis, RadialBar, RadialBarChart } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

function InformationPage() {
  const [cpuInfo, setCpuInfo] = useState<sysmon.CPUInfo>(
    new sysmon.CPUInfo({
      Name: "Loading",
      Cores: 0,
      LoadPct: 0,
    }),
  );
  const [gpuInfo, setGpuInfo] = useState<sysmon.GPUInfo>(
    new sysmon.GPUInfo({
      Name: "Loading",
    }),
  );
  const [diskInfo, setDiskInfo] = useState<sysmon.DiskInfo[]>([]);
  const [networkInfo, setNetworkInfo] = useState<sysmon.NetworkInfo>(
    new sysmon.NetworkInfo({
      Adapters: [],
      TotalCount: 0,
    }),
  );
  const [ramInfo, setRAMInfo] = useState<sysmon.RAMInfo>(
    new sysmon.RAMInfo({
      TotalGB: 0,
      UsedGB: 0,
      Percent: 0,
    }),
  );

  const [host, setHost] = useState("");

  useEffect(() => {
    setInterval(() => {
      GetCPUInfo().then((info) => {
        setCpuInfo(info);
      });
      GetGPUInfo().then((info) => {
        setGpuInfo(info);
      });
      GetDiskInfoCross().then((info) => {
        setDiskInfo(info);
      });
      GetNetworkInfo().then((info) => {
        setNetworkInfo(info);
      });
      GetRAMInfoCross().then((info) => {
        setRAMInfo(info);
      });
      HostInfo().then((host) => {
        setHost(host);
      });
    }, 2000);
  }, []);

  const MenuItems: MenuItem[] = [
    {
      label: "System Information",
      path: "/",
    },
    {
      label: "Database Profiles",
      path: "/databaseProfiles",
    },
    {
      label: "System Agent",
      path: "/SysAgent",
    },
  ];

  const totalDiskGB = diskInfo.reduce((total, disk) => total + disk.TotalGB, 0);
  const freeDiskGB = diskInfo.reduce((total, disk) => total + disk.FreeGB, 0);
  const usedDiskPercent =
    totalDiskGB > 0 ? ((totalDiskGB - freeDiskGB) / totalDiskGB) * 100 : 0;

  const chartBase: [string, number][] = [
    ["CPU", cpuInfo.LoadPct],
    ["RAM", ramInfo.Percent],
    ["Disk", usedDiskPercent],
  ];
  if (gpuInfo.Load != null) {
    chartBase.push(["GPU", gpuInfo.Load]);
  }

  const resourceMetrics = [
    {
      label: "Processor",
      value: `${cpuInfo.LoadPct.toFixed(1)}%`,
      detail: `${cpuInfo.Name} · ${cpuInfo.Cores} logical CPUs · ${cpuInfo.Temperature == null ? "Temp N/A" : `${cpuInfo.Temperature.toFixed(1)}°C`}`,
      percent: cpuInfo.LoadPct,
      color: "var(--chart-1)",
    },
    {
      label: "Graphics",
      value: gpuInfo.Load == null ? "N/A" : `${gpuInfo.Load.toFixed(1)}%`,
      detail: gpuInfo.Name === "Loading"
        ? "Reading GPU data…"
        : `${gpuInfo.Name} · ${gpuInfo.Temp == null ? "Temp N/A" : `${gpuInfo.Temp.toFixed(1)}°C`}`,
      percent: gpuInfo.Load ?? null,
      color: "var(--chart-2)",
    },
    {
      label: "Memory",
      value: `${ramInfo.Percent.toFixed(1)}%`,
      detail: `${ramInfo.UsedGB.toFixed(1)} GB used of ${ramInfo.TotalGB.toFixed(1)} GB`,
      percent: ramInfo.Percent,
      color: "var(--chart-3)",
    },
    {
      label: "Storage",
      value: `${usedDiskPercent.toFixed(1)}%`,
      detail: `${freeDiskGB.toFixed(1)} GB free of ${totalDiskGB.toFixed(1)} GB`,
      percent: usedDiskPercent,
      color: "var(--chart-4)",
    },
  ];

  const chartColors: Record<string, string> = {
    CPU: "var(--chart-1)",
    GPU: "var(--chart-2)",
    RAM: "var(--chart-3)",
    Disk: "var(--chart-4)",
  };

  return (
    <div className="flex min-h-screen w-full flex-col dark text-slate-200 md:flex-row">
      <LeftSideBar menuItems={MenuItems} />
      <main className="flex min-h-screen min-w-0 flex-1 flex-col overflow-y-auto bg-background">
        <header className="border-b border-border bg-card/60  py-6 md:px-8">
          <div className="flex w-full max-w-7xl flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-1 text-sm font-medium uppercase tracking-[0.18em] text-primary">
                Live system monitor
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-100 md:text-4xl">
                System overview
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Hardware and resource usage for this machine
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background px-4 py-2 text-sm text-slate-200">
              <span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-400" />
              {host || "Connecting…"}
            </div>
          </div>
        </header>

        <div className="flex w-full min-w-0 flex-col gap-5 p-4 md:gap-6 md:p-8">
          <section className="flex w-full flex-wrap items-stretch gap-5">
            <div className="min-w-0 flex-[3_1_34rem] rounded-xl border border-border bg-card p-5 shadow-sm md:p-6">
              <div className="mb-5">
                <h2 className="text-lg font-semibold text-slate-100">
                  Resource usage
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Current load across the main components
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {resourceMetrics.map((metric) => (
                  <article
                    key={metric.label}
                    className="rounded-lg border border-border/80 bg-background/70 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-muted-foreground">
                          {metric.label}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-400" title={metric.detail}>
                          {metric.detail}
                        </p>
                      </div>
                      <span className="shrink-0 text-xl font-semibold tabular-nums text-slate-100">
                        {metric.value}
                      </span>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-[width] duration-500"
                        style={{
                          width: `${Math.min(100, Math.max(0, metric.percent ?? 0))}%`,
                          backgroundColor: metric.color,
                        }}
                      />
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="min-w-0 max-w-[34rem] flex-[1_1_22rem] rounded-xl border border-border bg-card p-5 shadow-sm md:p-6">
              <div className="mb-2">
                <h2 className="text-lg font-semibold text-slate-100">
                  Usage breakdown
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Percentage of capacity currently in use
                </p>
              </div>
              <ChartContainer
                className="h-[22rem] w-full sm:h-[26rem]"
                config={
                  {
                    value: { label: "Usage", color: "var(--chart-1)" },
                  } satisfies ChartConfig
                }
              >
                <RadialBarChart
                  data={chartBase.map(([name, value]) => ({
                    name,
                    value,
                    fill: chartColors[name],
                  }))}
                  startAngle={90}
                  endAngle={-270}
                  innerRadius="18%"
                  outerRadius="96%"
                  barSize={24}
                >
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        hideLabel
                        formatter={(value, _name, item) =>
                          `${item.payload?.name ?? "Value"}: ${Number(value).toFixed(1)}%`
                        }
                      />
                    }
                  />
                  <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                  <RadialBar
                    dataKey="value"
                    isAnimationActive={false}
                    background={{
                      style: { fill: "rgba(148, 163, 184, 0.2)" },
                    }}
                    cornerRadius={10}
                  >
                    <LabelList
                      dataKey="name"
                      position="insideStart"
                      fill="#f8fafc"
                      fontSize={13}
                      fontWeight={600}
                    />
                  </RadialBar>
                </RadialBarChart>
              </ChartContainer>
              <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
                {chartBase.map(([name, value]) => (
                  <span key={name} className="inline-flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: chartColors[name] }}
                    />
                    {name} {value.toFixed(1)}%
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">
                  Storage drives
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {diskInfo.length} {diskInfo.length === 1 ? "drive" : "drives"} detected
                </p>
              </div>
            </div>
            {diskInfo.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                Waiting for disk information…
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {diskInfo.map((disk, index) => (
                  <article
                    key={`${disk.Name}-${index}`}
                    className="rounded-xl border border-border bg-card p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold text-slate-100" title={disk.Name}>
                          {disk.Name || `Drive ${index + 1}`}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {disk.FreeGB.toFixed(1)} GB free of {disk.TotalGB.toFixed(1)} GB
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-medium tabular-nums text-slate-200">
                        {disk.UsedPercent.toFixed(1)}% used
                      </span>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${Math.min(100, Math.max(0, disk.UsedPercent))}%`,
                        }}
                      />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-slate-100">
                Network adapters
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Interfaces available on this machine
              </p>
            </div>
            {networkInfo.Adapters.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                No network adapters found.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {networkInfo.Adapters.map((adapter) => (
                  <article
                    key={`${adapter.Name}-${adapter.MAC}`}
                    className="rounded-xl border border-border bg-card p-4 shadow-sm"
                  >
                    <h3 className="truncate font-semibold text-slate-100" title={adapter.Name}>
                      {adapter.Name}
                    </h3>
                    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                      <dt className="text-muted-foreground">Status</dt>
                      <dd className="truncate text-slate-200">{adapter.Status}</dd>
                      <dt className="text-muted-foreground">IP address</dt>
                      <dd className="truncate text-slate-200">{adapter.IP}</dd>
                      <dt className="text-muted-foreground">MAC address</dt>
                      <dd className="truncate font-mono text-xs text-slate-300">{adapter.MAC}</dd>
                    </dl>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

export default InformationPage;
