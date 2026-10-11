#:package LibreHardwareMonitorLib@0.9.6
#:package System.Management@10.0.2

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Management;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Json.Serialization.Metadata;
using System.Threading;
using LibreHardwareMonitor.Hardware;
using System.Text.Encodings.Web;

public class CpuInfo
{
    public string Name { get; set; } = "";
    public float? Temperature { get; set; }
    public float? Load { get; set; }
}

public class GpuInfo
{
    public string Name { get; set; } = "";
    public float? Temperature { get; set; }
    public float? Load { get; set; }
}

public class RamInfo
{
    public string Name { get; set; } = "";
    public float TotalGB { get; set; }
    public float UsedGB { get; set; }
    public float AvailableGB { get; set; }
    public float LoadPercent { get; set; }
}

public class StorageInfo
{
    public string Name { get; set; } = "";
    public string VolumeLabel { get; set; } = "";
    public string DriveType { get; set; } = "";
    public double TotalSpaceGB { get; set; }
    public double FreeSpaceGB { get; set; }
    public double UsedSpaceGB { get; set; }
}

public class NetworkInfo
{
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string Mac { get; set; } = "";
    public string Ip { get; set; } = "";
    public string SubnetMask { get; set; } = "";
    public string Gateway { get; set; } = "";
}

public class HardwareReport
{
    public List<CpuInfo> CPU { get; set; } = new();
    public List<GpuInfo> GPU { get; set; } = new();
    public RamInfo? RAM { get; set; }
    public List<StorageInfo> Storage { get; set; } = new();
    public List<NetworkInfo> Network { get; set; } = new();
}

public class ErrorResponse
{
    public string Error { get; set; } = "";
}

public class NetSample
{
    public long Sent { get; set; }
    public long Recv { get; set; }
    public long Ticks { get; set; }
}

public class NetCache
{
    public Dictionary<string, NetSample> Nics { get; set; } = new();
}

[JsonSourceGenerationOptions(WriteIndented = true)]
[JsonSerializable(typeof(HardwareReport))]
[JsonSerializable(typeof(ErrorResponse))]
[JsonSerializable(typeof(NetCache))]
internal partial class AppJsonContext : JsonSerializerContext
{
}

[SupportedOSPlatform("windows")]
class Program
{
    static readonly string CachePath = Path.Combine(Path.GetTempPath(), "hwlibrehelper_netcache.json");

    static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = true,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        TypeInfoResolver = AppJsonContext.Default
    };

    static readonly JsonSerializerOptions CompactOptions = new()
    {
        WriteIndented = false,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        TypeInfoResolver = AppJsonContext.Default
    };

    [StructLayout(LayoutKind.Sequential)]
    private class MEMORYSTATUSEX
    {
        public uint dwLength;
        public uint dwMemoryLoad;
        public ulong ullTotalPhys;
        public ulong ullAvailPhys;
        public ulong ullTotalPageFile;
        public ulong ullAvailPageFile;
        public ulong ullTotalVirtual;
        public ulong ullAvailVirtual;
        public ulong ullAvailExtendedVirtual;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GlobalMemoryStatusEx([In, Out] MEMORYSTATUSEX lpBuffer);

    static void Main(string[] args)
    {
        try
        {
            var report = CollectAllMetrics();
            var typeInfo = (JsonTypeInfo<HardwareReport>)Options.GetTypeInfo(typeof(HardwareReport));
            string jsonResult = JsonSerializer.Serialize(report, typeInfo);
            Console.WriteLine(jsonResult);
        }
        catch (Exception ex)
        {
            var error = new ErrorResponse { Error = ex.Message };
            var typeInfo = (JsonTypeInfo<ErrorResponse>)CompactOptions.GetTypeInfo(typeof(ErrorResponse));
            Console.Error.WriteLine(JsonSerializer.Serialize(error, typeInfo));
            Environment.Exit(1);
        }
    }

    static HardwareReport CollectAllMetrics()
    {
        var report = new HardwareReport();

        var computer = new Computer
        {
            IsCpuEnabled = true,
            IsGpuEnabled = true,
            IsMemoryEnabled = false,
            IsStorageEnabled = false,
            IsNetworkEnabled = false
        };

        computer.Open();

        try
        {
            foreach (var hardware in computer.Hardware)
            {
                hardware.Update();

                switch (hardware.HardwareType)
                {
                    case HardwareType.Cpu:
                        float? cpuTemp = null;
                        float? cpuLoad = null;

                        foreach (var sensor in hardware.Sensors)
                        {
                            if (sensor.SensorType == SensorType.Temperature &&
                                (sensor.Name.Contains("Package") ||
                                 sensor.Name.Contains("Core (Max)") ||
                                 sensor.Name.Contains("CPU")))
                                cpuTemp = sensor.Value;
                            if (sensor.SensorType == SensorType.Load && sensor.Name.Contains("Total"))
                                cpuLoad = sensor.Value;
                        }

                        if (cpuTemp == null)
                            cpuTemp = GetCpuTempWmi();

                        report.CPU.Add(new CpuInfo
                        {
                            Name = hardware.Name,
                            Temperature = cpuTemp,
                            Load = cpuLoad
                        });
                        break;

                    case HardwareType.GpuNvidia:
                    case HardwareType.GpuAmd:
                    case HardwareType.GpuIntel:
                        float? gpuTemp = null;
                        float? gpuLoad = null;

                        foreach (var sensor in hardware.Sensors)
                        {
                            if (sensor.SensorType == SensorType.Temperature && sensor.Name.Contains("Core"))
                                gpuTemp = sensor.Value;
                            if (sensor.SensorType == SensorType.Load && sensor.Name.Contains("Core"))
                                gpuLoad = sensor.Value;
                        }

                        report.GPU.Add(new GpuInfo
                        {
                            Name = hardware.Name,
                            Temperature = gpuTemp,
                            Load = gpuLoad
                        });
                        break;
                }
            }
        }
        finally
        {
            computer.Close();
        }

        report.RAM = GetRamInfo();
        report.Storage = GetStorageInfo();
        report.Network = GetNetworkInfo();

        return report;
    }

    static float? GetCpuTempWmi()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher(
                @"root\WMI", "SELECT CurrentTemperature FROM MSAcpi_ThermalZoneTemperature");
            using var results = searcher.Get();
            foreach (ManagementObject obj in results)
            {
                try
                {
                    double tempK = Convert.ToDouble(obj["CurrentTemperature"]);
                    return (float)((tempK / 10.0) - 273.15);
                }
                catch { }
            }
        }
        catch { }
        return null;
    }

    static RamInfo GetRamInfo()
    {
        var mem = new MEMORYSTATUSEX();
        mem.dwLength = (uint)Marshal.SizeOf<MEMORYSTATUSEX>();

        if (!GlobalMemoryStatusEx(mem))
            return new RamInfo { Name = "Unknown" };

        const double GB = 1024.0 * 1024.0 * 1024.0;
        double totalGB = mem.ullTotalPhys / GB;
        double availGB = mem.ullAvailPhys / GB;
        double usedGB = totalGB - availGB;

        return new RamInfo
        {
            Name = "Physical Memory",
            TotalGB = (float)Math.Round(totalGB, 2),
            UsedGB = (float)Math.Round(usedGB, 2),
            AvailableGB = (float)Math.Round(availGB, 2),
            LoadPercent = mem.dwMemoryLoad
        };
    }

    static List<StorageInfo> GetStorageInfo()
    {
        var list = new List<StorageInfo>();
        DriveInfo[] drives;
        try { drives = DriveInfo.GetDrives(); }
        catch { return list; }

        foreach (var drive in drives)
        {
            try
            {
                if (!drive.IsReady) continue;

                string label = "";
                try { label = drive.VolumeLabel; } catch { }

                long total = 0;
                long free = 0;
                try
                {
                    total = drive.TotalSize;
                    free = drive.TotalFreeSpace;
                }
                catch { continue; }

                list.Add(new StorageInfo
                {
                    Name = drive.Name,
                    VolumeLabel = label,
                    DriveType = drive.DriveType.ToString(),
                    TotalSpaceGB = Math.Round((double)total / 1024 / 1024 / 1024, 2),
                    FreeSpaceGB = Math.Round((double)free / 1024 / 1024 / 1024, 2),
                    UsedSpaceGB = Math.Round((double)(total - free) / 1024 / 1024 / 1024, 2)
                });
            }
            catch { }
        }

        return list;
    }

    static bool IsRealAdapter(NetworkInterface nic)
    {
        if (nic.OperationalStatus != OperationalStatus.Up) return false;

        if (nic.NetworkInterfaceType != NetworkInterfaceType.Ethernet
            && nic.NetworkInterfaceType != NetworkInterfaceType.Wireless80211
            && nic.NetworkInterfaceType != NetworkInterfaceType.GigabitEthernet)
            return false;

        string haystack = (nic.Description + " " + nic.Name).ToLowerInvariant();
        string[] bad =
        {
            "virtual", "vmware", "hyper-v", "npcap", "wfp", "qos",
            "lightweight", "filter", "loopback", "tunnel", "bluetooth",
            "pseudo", "tap", "vpn", "miniport", "packet scheduler",
            "native wifi", "virtualbox", "vmnet"
        };
        foreach (var b in bad)
            if (haystack.Contains(b)) return false;

        try
        {
            var props = nic.GetIPProperties();
            if (props.GatewayAddresses.Count == 0) return false;
        }
        catch { return false; }

        return true;
    }

    static List<NetworkInfo> GetNetworkInfo()
    {
        var list = new List<NetworkInfo>();

        List<NetworkInterface> nics;
        try
        {
            nics = NetworkInterface.GetAllNetworkInterfaces()
                .Where(IsRealAdapter)
                .ToList();
        }
        catch
        {
            return list;
        }

        foreach (var nic in nics)
        {
            try
            {
                string mac = "";
                try
                {
                    var bytes = nic.GetPhysicalAddress().GetAddressBytes();
                    if (bytes.Length == 6)
                        mac = string.Join(":", bytes.Select(b => b.ToString("X2")));
                }
                catch { }

                string ip = "";
                string mask = "";
                string gw = "";

                try
                {
                    var props = nic.GetIPProperties();

                    var v4 = props.UnicastAddresses
                        .FirstOrDefault(a => a.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork);
                    if (v4 != null)
                    {
                        ip = v4.Address.ToString();
                        if (v4.IPv4Mask != null)
                            mask = v4.IPv4Mask.ToString();
                    }

                    var gateway = props.GatewayAddresses
                        .FirstOrDefault(g => g.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork);
                    if (gateway != null)
                        gw = gateway.Address.ToString();
                }
                catch { }

                list.Add(new NetworkInfo
                {
                    Name = nic.Name,
                    Description = nic.Description,
                    Mac = mac,
                    Ip = ip,
                    SubnetMask = mask,
                    Gateway = gw
                });
            }
            catch { }
        }

        return list;
    }
}