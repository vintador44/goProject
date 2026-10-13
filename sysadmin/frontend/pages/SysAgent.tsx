import { MenuItem, LeftSideBar } from "../modules/SideBar";
import * as SysAgentAPI from "../wailsjs/go/sysagent/SysAgent";
import { sysagent } from "../wailsjs/go/models";
import { useEffect, useState } from "react";
import {MenuItems} from "../constants"
import SSHTerminal from "../modules/SSHTerminal";
import {
  InformationContainerProps,
  InformationContainer,
} from "../modules/InformationContainer";

export default function SysAgent() {
  
  const [devices, setDevices] = useState<Record<string, sysagent.DeviceInfo>>(
    {},
  );
  const [activeName, setActiveName] = useState<string>();
  const activeData = activeName ? devices[activeName] : undefined;
  const [cmdQuery, setCmdQuery] = useState<string>("");
  const [sshTerminalOpen, setSshTerminalOpen] = useState(false);

  const DeviceProps: InformationContainerProps = {
    title: "Device",
    labels: ["Name: " + activeData?.metrics.hostname, "Ip: " + activeData?.ip],
    chartBase: null,
  };
  const CPUProps: InformationContainerProps = {
    title: "CPU",
    labels: [
      "CPU model: " + activeData?.metrics.cpu_model,
      "CPU percent: " + activeData?.metrics.cpu_percent,
      "CPU temp: " + activeData?.metrics.cpu_temp,
    ],
    chartBase: [["CPU", activeData?.metrics.cpu_percent ?? 0]],
    maxValue: 100,
    metadata: "%",
  };

  const RamProps: InformationContainerProps = {
    title: "Ram",
    labels: [
      "Ram total : " + activeData?.metrics.ram_total + " gb",
      "Ram percent: " + activeData?.metrics.ram_percent + " %",
    ],
    chartBase: [["RAM", activeData?.metrics.ram_percent ?? 0]],
    maxValue: 100,
    metadata: "%",
  };

  const GpuProps: InformationContainerProps = {
    title: "Gpu",
    labels: [
      "GPU model: " + activeData?.metrics.gpu_model,
      "GPU percent: " + activeData?.metrics.gpu_percent + " %",
      "GPU temp: " + activeData?.metrics.gpu_temp + " °C",
    ],
    chartBase: [["GPU", activeData?.metrics.gpu_percent ?? 0]],
    maxValue: 100,
    metadata: "%",
  };
  const NetworkAdaptersProps: InformationContainerProps[] = activeData?.metrics
    ?.network
    ? Object.entries(activeData.metrics.network).map(
        ([name, info]: [string, any]) => {
          const ipsString = info.ips?.join(", ") || "N/A";
          return {
            title: `Network adapter: ${name}`,
            labels: [`IP(s): ${ipsString}`, `MAC: ${info.mac || "N/A"}`],
            chartBase: null,
          };
        },
      )
    : [];

  const DisksProps: InformationContainerProps[] =
    activeData?.metrics?.disks?.map((part: any): InformationContainerProps => {
      return {
        title: `Disk partition: ${part.device}`,
        labels: [
          `Total: ${part.total} GB`,
          `Used: ${part.percent}%`,
          `Free: ${part.free} GB`,
        ],
        chartBase: [["Used", part.total - part.free]],
        maxValue: part.total,
        metadata: "gb",
      };
    }) || [];

  useEffect(() => {
    SysAgentAPI.Start();
    const intervalId = setInterval(async () => {
      const data = await SysAgentAPI.GetDevices();
      setDevices(data);
      console.log("Обновленные данные устройств:", data);
    }, 1000);
    return () => {
      clearInterval(intervalId);
      SysAgentAPI.Stop();
    };
  }, []);

  function DeviceControl(name: string) {
    setActiveName(name);
  }
  const [cmdOutput, setCmdOutput] = useState<string>("");

  const handleOpenSSH = () => {
    if (!activeName) {
      alert("Сначала выберите устройство.");
      return;
    }
    setSshTerminalOpen(true);
  };

  const handleCmdExecute = async () => {
    if (!activeName) {
      alert("Сначала выберите устройство");
      return;
    }
    if (!cmdQuery.trim()) {
      alert("Введите команду");
      return;
    }
    try {
      const result = await SysAgentAPI.ExecuteRemoteCommand(
        activeName,
        cmdQuery.trim(),
      );
      setCmdOutput(result);
      console.log("Результат:", result);
    } catch (err: any) {
      console.error(err);
      setCmdOutput(`Ошибка: ${err.message || err}`);
    }
  };
  const handleSendCommand = async (hostname: string, command: string) => {
    try {
      await SysAgentAPI.SendCommand(hostname, command);
      console.log(`Команда "${command}" отправлена агенту ${hostname}`);
    } catch (err) {
      console.error("Ошибка отправки команды:", err);
    }
  };
  const hasDevices = Object.keys(devices).length > 0;

  return (
    <div className="flex min-h-screen w-full flex-col bg-background dark text-slate-200 md:flex-row">
      <LeftSideBar menuItems={MenuItems} />
      <main className="flex min-h-screen min-w-0 flex-1 flex-col overflow-y-auto bg-background dark">
        <h1 className="w-full px-4 py-3 text-3xl font-semibold text-slate-100 md:text-4xl">
          System Agent
        </h1>
        <div className="flex w-full flex-wrap items-center gap-2 border-y border-slate-500 p-3">
          <button
            className="shrink-0 rounded border border-cyan-700 bg-cyan-950 px-3 py-2 text-sm font-medium text-cyan-100 transition-colors hover:bg-cyan-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            onClick={handleOpenSSH}
          >
            SSH Terminal
          </button>
          <button
            className="shrink-0 rounded border border-border bg-accent px-3 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
            onClick={handleCmdExecute}
          >
            CMD Execute
          </button>
          <input
            className="min-w-0 flex-1 rounded border border-border bg-accent px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
            value={cmdQuery}
            onChange={(e) => setCmdQuery(e.target.value)}
          ></input>
        </div>
        <div className="flex w-full min-w-0 flex-1 flex-col lg:flex-row bg-background dark">
        

          <div className="flex min-w-0 flex-1 flex-wrap content-start items-start gap-3 overflow-y-auto p-3">
            {Object.entries(devices).map(([name, data]) => (
              <InformationContainer
                key={name}
                className={`w-full max-w-sm flex-[1_1_18rem] cursor-pointer ${
                  activeName === name
                    ? "ring-2 ring-cyan-500"
                    : "hover:border-cyan-500/60"
                }`}
                title={data.metrics.hostname}
                labels={[
                  "IP: " + data.ip,
                  "CPU model: " + data.metrics.cpu_model,
                  "CPU: " + data.metrics.cpu_percent + "% · Temp: " + data.metrics.cpu_temp,
                  "RAM: " + data.metrics.ram_total + " GB · " + data.metrics.ram_percent + "%",
                  "GPU: " + data.metrics.gpu_model,
                  "GPU load: " + data.metrics.gpu_percent + "% · Temp: " + data.metrics.gpu_temp,
                  data.metrics.disks
                    .map((part: any) => `Disk ${part.device}: ${part.percent}% used · ${part.free} GB free`)
                    .join("\n"),
                  Object.entries(data.metrics.network)
                    .map(
                      ([adapterName, info]: [string, any]) =>
                        `${adapterName}: ${info.ips?.join(", ") || "N/A"} · MAC ${info.mac || "N/A"}`,
                    )
                    .join("\n"),
                ]}
                chartBase={[
                  ["CPU", data.metrics.cpu_percent],
                  ["RAM", data.metrics.ram_percent],
                  ["GPU", data.metrics.gpu_percent],
                  ["Disk", data.metrics.disks.reduce((acc: number, part: any) => acc + part.percent, 0) / data.metrics.disks.length],
                ]}
                maxValue={100}
                metadata="%"
                role="button"
                tabIndex={0}
                aria-pressed={activeName === name}
                onClick={() => DeviceControl(name)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    DeviceControl(name);
                  }
                }}
              />
            ))}
          </div>

          {cmdOutput && (
            <section className="m-3 min-w-0 flex-1 rounded-md border border-border bg-accent p-3">
              <h2 className="mb-2 text-sm font-semibold text-slate-300">
                Результат:
              </h2>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-sm text-emerald-300">
                {cmdOutput}
              </pre>
            </section>
          )}
        </div>
      </main>
      {sshTerminalOpen && activeName && (
        <SSHTerminal
          hostname={activeName}
          username="sysadmin"
          onClose={() => setSshTerminalOpen(false)}
        />
      )}
    </div>
  );
}
