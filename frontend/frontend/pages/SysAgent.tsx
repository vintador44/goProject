import "../styles/main.css";
import "../styles/sidebar.css";
import "../styles/sysagent.css";

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
    targetNumberLabel: null,
  };
  const CPUProps: InformationContainerProps = {
    title: "CPU",
    labels: [
      "CPU model: " + activeData?.metrics.cpu_model,
      "CPU percent: " + activeData?.metrics.cpu_percent,
    ],
    targetNumberLabel: null,
  };

  const RamProps: InformationContainerProps = {
    title: "Ram",
    labels: [
      "Ram total : " + activeData?.metrics.ram_total + " gb",
      "Ram percent: " + activeData?.metrics.ram_percent + " %",
    ],
    targetNumberLabel: null,
  };

  const GpuProps: InformationContainerProps = {
    title: "Gpu",
    labels: [
      "GPU model: " + activeData?.metrics.gpu_model,
      "GPU percent: " + activeData?.metrics.gpu_percent + " %",
      "GPU temp: " + activeData?.metrics.gpu_temp,
    ],
    targetNumberLabel: null,
  };
  const NetworkAdaptersProps: InformationContainerProps[] = activeData?.metrics
    ?.net_interfaces
    ? Object.entries(activeData.metrics.net_interfaces).map(
        ([name, info]: [string, any]) => {
          const ipsString = info.ips?.join(", ") || "N/A";
          return {
            title: `Network adapter: ${name}`,
            labels: [`IP(s): ${ipsString}`, `MAC: ${info.mac || "N/A"}`],
            targetNumberLabel: null,
          };
        },
      )
    : [];

  const DisksProps: InformationContainerProps[] = activeData?.metrics?.disks
    ?.partitions
    ? activeData.metrics.disks.partitions.map((part: any) => ({
        title: `Disk partition: ${part.drive}`,
        labels: [
          `Total: ${part.total} GB`, // скорее всего, в гигабайтах
          `Used: ${part.percent}%`,
        ],
        targetNumberLabel: null,
      }))
    : [];

  const PhysicalDisksProps: InformationContainerProps[] = activeData?.metrics
    ?.disks?.physical
    ? activeData.metrics.disks.physical.map((disk: any) => ({
        title: `Physical disk: ${disk.name}`,
        labels: [`Load: ${disk.load}%`, `Temp: ${disk.temp}`],
        targetNumberLabel: null,
      }))
    : [];

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
  return (
    <div className="main">
      <LeftSideBar menuItems={MenuItems} />
      <div className="main_content">
        <h1 className="page_title">System Agent</h1>
        <div className="upper_tools">
          <button
            className="menu_button"
            style={{ width: "150px" }}
            onClick={handleCmdExecute}
          >
            CMD Execute
          </button>
          <input
            style={{
              fontSize: "20px",
              backgroundColor: "black",
              borderRadius: "7px",
              padding: "3px",
              width: "88%",
              marginLeft: "22px",
            }}
            value={cmdQuery}
            onChange={(e) => setCmdQuery(e.target.value)}
          ></input>
        </div>
        <div className="device_content">
          <div className="devices_list">
            {Object.keys(devices).map((item, index) => {
              return (
                <button
                  key={index}
                  className="device"
                  onClick={() => DeviceControl(index, item)}
                  style={{
                    backgroundColor:
                      activeDeviceKey == index
                        ? "rgb(0,47,57)"
                        : "rgb(2, 68, 82)",
                  }}
                >
                  {item} <br></br> ip: {devices[item].ip}
                </button>
              );
            })}
          </div>

          {activeData && (
            <div className="options">
              <InformationContainer {...DeviceProps} />
              <InformationContainer {...CPUProps} />
              <InformationContainer {...RamProps} />
              <InformationContainer {...GpuProps} />
              {NetworkAdaptersProps.map((item, index) => {
                return <InformationContainer key={index} {...item} />;
              })}
              {DisksProps.map((item, index) => (
                <InformationContainer key={index} {...item} />
              ))}
              {PhysicalDisksProps.map((item, index) => (
                <InformationContainer key={index} {...item} />
              ))}
            </div>
          )}
          {cmdOutput && (
    <div style={{ marginTop: "20px", padding: "10px", backgroundColor: "#1a1a1a", borderRadius: "8px", border: "1px solid #444" }}>
        <h3 style={{ margin: 0, color: "#aaa" }}>Результат:</h3>
        <pre style={{ whiteSpace: "pre-wrap", color: "#0f0", fontSize: "14px", maxHeight: "400px", overflow: "auto" }}>
            {cmdOutput}
        </pre>
    </div>
)}
        </div>
      </div>
    </div>
  );
}
