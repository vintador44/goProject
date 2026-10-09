

import { useEffect, useState } from "react";
import { MenuItem, LeftSideBar } from "../modules/SideBar"
import { InformationContainerProps, InformationContainer } from "../modules/InformationContainer"

import { sysmon } from "../wailsjs/go/models";
import {
    GetCPUInfo,
    GetGPUInfo,
    GetDiskInfo,
    GetDiskInfoCross,
    GetNetworkInfo,
    GetRAMInfo,
    GetRAMInfoCross,
    HostInfo
} from "../wailsjs/go/sysmon/SystemMonitor"

function toPercent(value: number, max: number, decimals = 1): string {
  if (max === 0) return '0%'; // Защита от деления на ноль
  
  const fraction = value / max;
  
  // Используем Intl.NumberFormat для красивого вывода
  return new Intl.NumberFormat('ru-RU', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(fraction);
}


function InformationPage() {

    const [cpuInfo, setCpuInfo] = useState<sysmon.CPUInfo>(new sysmon.CPUInfo({
        Name: "Loading",
        Cores: "Loading",
        LoadPct: "Loading"
    }));
    const [gpuInfo, setGpuInfo] = useState<sysmon.GPUInfo>(new sysmon.GPUInfo({
        Name: "Loading",
    }));
    const [diskInfo, setDiskInfo] = useState<sysmon.DiskInfo[]>([]);
    const [networkInfo, setNetworkInfo] = useState<sysmon.NetworkInfo>(new sysmon.NetworkInfo({
        Adapters: [],
        TotalCount: 0,
    }));
    const [ramInfo, setRAMInfo] = useState<sysmon.RAMInfo>(new sysmon.RAMInfo({
        TotalGB: 0,
        UsedGB: 0,
        Percent: 0
    }));

    const [os, setOs] = useState('');
    const [host, setHost] = useState('');



    useEffect(() => {
        setInterval(() => {
            GetCPUInfo().then((info) => {
                setCpuInfo(info);
            });
            GetGPUInfo().then((info) => {
                setGpuInfo(info);
            })
            GetDiskInfoCross().then((info) => {
                setDiskInfo(info);
            })
            GetNetworkInfo().then((info) => {
                setNetworkInfo(info);
            })
            GetRAMInfoCross().then((info) => {
                setRAMInfo(info);
            })
            HostInfo().then(([hostname, osName]) => {
                setHost(hostname);
                setOs(osName);
            });
        }, 2000);


    }, []);

    const MenuItems: MenuItem[] = [
        { 
            label: "System Information",
            path: "/"
        },
        { 
            label: "Database Profiles",
            path: "/databaseProfiles"
        },
        {
            label: "System Agent",
            path: "/SysAgent"
        }
        
    ];

    const totalDiskGB = diskInfo.reduce((total, disk) => total + disk.TotalGB, 0);
    const freeDiskGB = diskInfo.reduce((total, disk) => total + disk.FreeGB, 0);
    const usedDiskPercent = totalDiskGB > 0
        ? ((totalDiskGB - freeDiskGB) / totalDiskGB) * 100
        : 0;

    const MainProps: InformationContainerProps = {
        title: os + " " + host,
        labels: [
            "CPU: " + (cpuInfo?.Name ?? "Loading") + " (" + (cpuInfo?.Cores ?? "Loading") + " cores)" + " Load: " + (cpuInfo?.LoadPct ?? "Loading") + "%",
            "GPU: " + (gpuInfo?.Name ?? "Loading") + " Load: " + "Loading" + "%" ,
            "RAM: " + ramInfo?.TotalGB.toFixed(1) + "gb" + "| Used: " + ramInfo?.UsedGB.toFixed(1) + "gb" + "| Percent: " + ramInfo?.Percent.toFixed(1) + "%",
            "Disk: Total: " + totalDiskGB.toFixed(1) + "gb" + "| Free: " + freeDiskGB.toFixed(1) + "gb" + "| Used Percent: " + usedDiskPercent.toFixed(1) + "%",
        ],
        chartBase: [
            ["CPU", cpuInfo?.LoadPct ?? 0],
            ["GPU", 0],
            ["RAM", ramInfo?.Percent ?? 0],
            ["Disk", usedDiskPercent]
        ],
        maxValue: 100,
        metadata: "%"
    }

    const CpuProps: InformationContainerProps =
    {
        title: "CPU: " + (cpuInfo?.Name ?? "Loading"),
        labels: [
            "Сores: " + ((cpuInfo?.Cores).toString() ?? "Loading"),
            "Load: " + (cpuInfo?.LoadPct.toString() ?? "Loading") + " %",
        ],
        chartBase: null,
    };

    const GpuProps: InformationContainerProps =
    {
        title: "GPU: " + (gpuInfo?.Name ?? "Loading"),
        labels: [
            "Больше нету информации для вывода КОСЯК"
        ],
        chartBase: null,
    }

    const DiskProps: InformationContainerProps[] = diskInfo.map((disk, index) => ({
        title: "Disk " + (index + 1),
        labels: [
            "TotalGB: " + disk.TotalGB.toFixed(1) + "gb",
            "FreeGB: " + disk.FreeGB.toFixed(1) + "gb",
            "Used Percent: " + disk.UsedPercent.toFixed(1) + "%"
        ],
        chartBase: [
            ["Used", +(disk.TotalGB - disk.FreeGB).toFixed(1)],
        ],
        maxValue: disk.TotalGB,
        metadata: "gb"
    }));

    const RAMProps: InformationContainerProps = {
        title: "RAM",
        labels: [
             "Total: " + ramInfo.TotalGB.toFixed(1) + "gb",
            "Used: " + ramInfo.UsedGB.toFixed(1) + "gb",
            "Percent: " + ramInfo.Percent.toFixed(1) + "%"
        ],
        chartBase: [
            ["Used", +ramInfo.UsedGB.toFixed(1)],
            
        ],
        maxValue: ramInfo.TotalGB,
        metadata: "gb"
    }


    const NetworkAdapterProps: InformationContainerProps[] =
        networkInfo.Adapters.map((item, index) => {
            return {
                title: "Network adapter: " + item.Name,
                labels: [
                    "MAC: " + item.MAC,
                    "IP: " + item.IP,
                    "Status: " + item.Status,
                    "Id: " + (index + 1)
                ],
                chartBase: null
            }
        })

    const HostInfoProps: InformationContainerProps =
    {
        title: "User: " + (host || "Loading"),
        labels: [
           "OS: " + (os || "Loading")
        ],
        chartBase: null
    }

    const noNetworkAdapters = NetworkAdapterProps.length === 0

    return (
        <div className="flex min-h-screen w-full flex-col dark text-slate-200 md:flex-row">
            <LeftSideBar menuItems={MenuItems} />
            <main className="flex min-h-screen min-w-0 flex-1 flex-col overflow-y-auto bg-background dark">
                 <h1 className="w-full px-4 py-3 text-3xl font-semibold text-slate-100 md:text-4xl">System Information</h1>
                 <div className="grid w-full grid-cols-1 gap-2 p-2 sm:grid-cols-2 xl:grid-cols-3">
                     <InformationContainer {...MainProps} />
                    <InformationContainer {...HostInfoProps} />
                    <InformationContainer {...RAMProps} />
                    <InformationContainer {...CpuProps} />
                    <InformationContainer {...GpuProps} />
                    {DiskProps.map((item, index) => (
                        <InformationContainer {...item} key={index} />
                    ))}
                    {noNetworkAdapters ? (
                        <section className="min-w-0 rounded border border-border bg-accent p-3 shadow-sm">
                            <h2 className="mb-2 break-words text-base font-semibold text-slate-100">Network adapters</h2>
                            <p className="text-sm text-slate-300">Данные о сетевых адаптерах ещё не получены.</p>
                        </section>
                    ) : (
                        NetworkAdapterProps.map((item, index) => {
                            return <InformationContainer {...item} key={index} />
                        })
                    )}
                </div>
            </main>
        </div>
    )

}

export default InformationPage
