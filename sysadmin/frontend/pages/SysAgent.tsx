import { MenuItem, LeftSideBar } from "../modules/SideBar";
import * as SysAgentAPI from "../wailsjs/go/sysagent/SysAgent";
import { sysagent } from "../wailsjs/go/models";
import { useEffect, useState } from "react";
import {
  InformationContainerProps,
  InformationContainer,
} from "../modules/InformationContainer";

export default function SysAgent() {
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
  const [devices, setDevices] = useState<Record<string, sysagent.DeviceInfo>>(
    {},
  );
  const [activeDeviceKey, setActiveDeviceKey] = useState<Number>(0);

  const [activeName, setActiveName] = useState<string>();
  const activeData = activeName ? devices[activeName] : undefined;
  const [cmdQuery, setCmdQuery] = useState<string>("");

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
    chartBase: [
      ["CPU", activeData?.metrics.cpu_percent ?? 0],
    ],
    maxValue: 100,
    metadata: "%",
  };

  const RamProps: InformationContainerProps = {
    title: "Ram",
    labels: [
      "Ram total : " + activeData?.metrics.ram_total + " gb",
      "Ram percent: " + activeData?.metrics.ram_percent + " %",
    ],
    chartBase: [
      ["RAM", activeData?.metrics.ram_percent ?? 0],
    ],
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
    chartBase: [
      ["GPU",  activeData?.metrics.gpu_percent ?? 0],
    ],
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
  (activeData?.metrics?.disks)?.map((part: any): InformationContainerProps => {
return {
        title: `Disk partition: ${part.device}`,
        labels: [
          `Total: ${part.total} GB`, 
          `Used: ${part.percent}%`,
          `Free: ${part.free} GB`,
        ],
        chartBase: [
          ["Used", part.total - part.free],
         
      ],
      maxValue: part.total,
      metadata: "gb"
      };
    }) || [];


 

  useEffect(() => {
    SysAgentAPI.Start();
    const intervalId = setInterval(async () => {
      const data = await SysAgentAPI.GetDevices();
      setDevices(data);
    }, 1000);
    return () => {
      clearInterval(intervalId);
      SysAgentAPI.Stop();
    };
  }, []);

  function DeviceControl(key: number, item: string) {
    setActiveDeviceKey(key);
    setActiveName(item); // больше ничего не надо
  }
  const [cmdOutput, setCmdOutput] = useState<string>("");

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

        const result = await SysAgentAPI.ExecuteRemoteCommand(activeName, cmdQuery.trim());
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
        <h1 className="w-full px-4 py-3 text-3xl font-semibold text-slate-100 md:text-4xl">System Agent</h1>
        <div className="flex w-full flex-wrap items-center gap-2 border-y border-slate-500 p-3">
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
          <aside className="max-h-64 w-full shrink-0 overflow-y-auto border border-border p-3 lg:max-h-none lg:min-h-0 lg:w-56 lg:border-b-0 lg:border-r">
            {hasDevices ? (
              Object.keys(devices).map((item, index) => {
                return (
                  <button
                    key={index}
                    className={`mb-2 w-full rounded-md border border-border px-3 py-2 text-left text-sm transition-colors ${activeDeviceKey === index ? "border-cyan-400 bg-[#002f39] text-white" : "border-slate-600 bg-[#024452] text-slate-200 hover:bg-[#03586a]"}`}
                    onClick={() => DeviceControl(index, item)}
                  >
                    {item} <br></br> ip: {devices[item].ip}
                  </button>
                );
              })
            ) : (
              <div className="rounded-md border border-dashed border-border bg-accent p-4 text-sm text-slate-300">
                Удалённые устройства ещё не подключены.
              </div>
            )}
          </aside>

          {activeData ? (
            <div className="flex min-w-0 flex-1 flex-wrap content-start items-start gap-2 overflow-y-auto p-2">
             
              
              <InformationContainer className=""{...CPUProps} />
              <InformationContainer {...RamProps} />
              <InformationContainer {...GpuProps} />
              {NetworkAdaptersProps.map((item, index) => {
                return <InformationContainer key={index} {...item} />;
              })}
              {DisksProps.map((item, index) => (
                <InformationContainer key={index} {...item} />
              ))}
              
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-start p-3 ">
              <div className="w-full rounded-md border border-dashed border-border bg-accent p-6 text-slate-300">
                <p className="text-lg font-medium text-slate-100 ">Данные агента ещё не получены.</p>
                <p className="mt-2 text-sm">Подождите загрузку устройств или выполните команду вручную.</p>
              </div>
            </div>
          )}
          {cmdOutput && (
            <section className="m-3 min-w-0 flex-1 rounded-md border border-border bg-accent p-3">
              <h2 className="mb-2 text-sm font-semibold text-slate-300">Результат:</h2>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-sm text-emerald-300">
                {cmdOutput}
              </pre>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
