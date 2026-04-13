

import "../styles/main.css"
import "../styles/sidebar.css"
import { useEffect, useState } from "react";
import { MenuItem, LeftSideBar } from "../modules/SideBar"
import { InformationContainerProps, InformationContainer } from "../modules/InformationContainer"

import { sysmon } from "../wailsjs/go/models";
import {
    GetCPUInfo,
    GetGPUInfo,
    GetDiskInfo,
    GetNetworkInfo,
    GetRAMInfo,
    HostInfo
} from "../wailsjs/go/sysmon/SystemMonitor"




function InformationPage() {

    const [cpuInfo, setCpuInfo] = useState<sysmon.CPUInfo>(new sysmon.CPUInfo({
        Name: "Loading",
        Cores: "Loading",
        LoadPct: "Loading"
    }));
    const [gpuInfo, setGpuInfo] = useState<sysmon.GPUInfo>(new sysmon.GPUInfo({
        Name: "Loading",
    }));
    const [diskInfo, setDiskInfo] = useState<sysmon.DiskInfo>(new sysmon.DiskInfo({
        TotalGB: 0,
        FreeGB: 0,
        UsedPercent: 0,
    }));
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
            GetDiskInfo("C:").then((info) => {
                setDiskInfo(info);
            })
            GetNetworkInfo().then((info) => {
                setNetworkInfo(info);
            })
            GetRAMInfo().then((info) => {
                setRAMInfo(info);
            })
            HostInfo().then(([hostname, osName]) => {
                setHost(hostname);
                setOs(osName);
            });
        }, 2000);


    }, []);

    const MenuItems: MenuItem[] = [
        { label: "Home" },
        { label: "Home" },
        { label: "Home" }
    ];

    const CpuProps: InformationContainerProps =
    {
        title: "CPU: " + (cpuInfo?.Name ?? "Loading"),
        labels: [
            "Сores: " + ((cpuInfo?.Cores).toString() ?? "Loading"),
            "Load: " + (cpuInfo?.LoadPct.toString() ?? "Loading") + " %",
        ],
        targetNumberLabel: null,
    };

    const GpuProps: InformationContainerProps =
    {
        title: "GPU: " + (gpuInfo?.Name ?? "Loading"),
        labels: [
            "Больше нету информации для вывода КОСЯК"
        ],
        targetNumberLabel: null,
    }

    const DiskProps: InformationContainerProps =
    {
        title: "Disk: C:",
        labels: [
            "TotalGB: " + diskInfo.TotalGB.toFixed(1) + "gb",
            "FreeGB: " + diskInfo.FreeGB.toFixed(1) + "gb",
            "Used Percent: " + diskInfo.UsedPercent.toFixed(1) + "%"
        ],
        targetNumberLabel: null
    }

    const RAMProps: InformationContainerProps = {
        title: "RAM",
        labels: [
             "Total: " + ramInfo.TotalGB.toFixed(1) + "gb",
            "Used: " + ramInfo.UsedGB.toFixed(1) + "gb",
            "Percent: " + ramInfo.Percent.toFixed(1) + "%"
        ],
        targetNumberLabel:null
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
                targetNumberLabel: null
            }
        })

    const HostInfoProps: InformationContainerProps =
    {
        title: "User: " + host,
        labels: [
           "OS: " + os
        ],
        targetNumberLabel: null
    }



    return (
        <div className="main">
            <LeftSideBar menuItems={MenuItems} />
            <div className="main_content">
                <InformationContainer {...HostInfoProps} />
                <InformationContainer {...RAMProps} />
                <InformationContainer {...CpuProps} />
                <InformationContainer {...GpuProps} />
                <InformationContainer {...DiskProps} />
                {
                    NetworkAdapterProps.map((item, index) => {
                        return <InformationContainer {...item} key={index} />
                    })
                }


            </div>

        </div>
    )

}

export default InformationPage
