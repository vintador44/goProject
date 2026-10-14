import { MenuItem, LeftSideBar } from "../modules/SideBar";
import * as SysAgentAPI from "../wailsjs/go/sysagent/SysAgent";
import { sysagent } from "../wailsjs/go/models";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from "react";
import {MenuItems} from "../constants"
import SSHTerminal from "../modules/SSHTerminal";
import {
  InformationContainerProps,
  InformationContainer,
} from "../modules/InformationContainer";

const RDP_KEY_ALIASES: Record<string, string> = {
  Enter: "enter", NumpadEnter: "enter", Escape: "esc", Backspace: "backspace",
  Tab: "tab", Space: "space", ShiftLeft: "shift", ShiftRight: "rightshift",
  ControlLeft: "ctrl", ControlRight: "rightctrl", AltLeft: "alt", AltRight: "rightalt",
  MetaLeft: "super", MetaRight: "rightsuper", ArrowUp: "up", ArrowDown: "down",
  ArrowLeft: "left", ArrowRight: "right", Home: "home", End: "end",
  PageUp: "pageup", PageDown: "pagedown", Insert: "insert", Delete: "delete",
  CapsLock: "capslock", Minus: "minus", Equal: "equal", BracketLeft: "leftbracket",
  BracketRight: "rightbracket", Backslash: "backslash", Semicolon: "semicolon",
  Quote: "apostrophe", Backquote: "grave", Comma: "comma", Period: "period", Slash: "slash",
};

function rdpKeyAlias(code: string): string | undefined {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return code.slice(6);
  if (/^F([1-9]|1[0-2])$/.test(code)) return code.toLowerCase();
  return RDP_KEY_ALIASES[code];
}

export default function SysAgent() {
  
  const [devices, setDevices] = useState<Record<string, sysagent.DeviceInfo>>(
    {},
  );
  const [activeName, setActiveName] = useState<string>();
  const activeData = activeName ? devices[activeName] : undefined;
  const [cmdQuery, setCmdQuery] = useState<string>("");
  const [sshTerminalOpen, setSshTerminalOpen] = useState(false);
  const [rdpOpen, setRdpOpen] = useState(false);
  const [rdpStartFailed, setRdpStartFailed] = useState(false);
  const [rdpFrame, setRdpFrame] = useState("");
  const [rdpError, setRdpError] = useState("");
  const rdpLastError = useRef("");
  const rdpHasFrame = useRef(false);
  const rdpSurfaceRef = useRef<HTMLElement | null>(null);
  const rdpHeldKeys = useRef(new Set<string>());

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

  useEffect(() => {
    if (!rdpOpen || !activeName || rdpStartFailed) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const frame = await SysAgentAPI.ReadRDPFrame(activeName);
        if (!stopped && frame) {
          setRdpFrame(`data:image/jpeg;base64,${frame}`);
          setRdpError("");
          rdpLastError.current = "";
          if (!rdpHasFrame.current) {
            rdpHasFrame.current = true;
            console.info(`[RDP] First frame received for ${activeName} (${frame.length} base64 chars)`);
          }
        }
      } catch (error: any) {
        if (!stopped) {
          const message = String(error?.message || error);
          if (rdpLastError.current !== message) {
            console.error(`[RDP] ${activeName}: ${message.slice(0, 500)}${message.length > 500 ? `… (${message.length} chars)` : ""}`);
          }
          rdpLastError.current = message;
          setRdpError(message.slice(0, 300));
        }
      }
      if (!stopped) timer = setTimeout(poll, 150);
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [rdpOpen, activeName, rdpStartFailed]);

  useEffect(() => {
    if (!rdpOpen) return;
    const frame = requestAnimationFrame(() => rdpSurfaceRef.current?.focus());
    const releaseKeys = () => {
      if (activeName) {
        for (const key of rdpHeldKeys.current) {
          void SysAgentAPI.SendRDPKeyboardInput(activeName, "key_up", key);
        }
      }
      rdpHeldKeys.current.clear();
    };
    window.addEventListener("blur", releaseKeys);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("blur", releaseKeys);
      releaseKeys();
    };
  }, [rdpOpen, activeName]);

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
  const handleOpenRDP = async () => {
    if (!activeName) return;
    rdpLastError.current = ""; rdpHasFrame.current = false;
    setRdpStartFailed(false);
    setRdpFrame(""); setRdpError(""); setRdpOpen(true);
    try { await SysAgentAPI.StartRDPSessionByHostname(activeName); }
    catch (error: any) {
      const message = String(error?.message || error);
      console.error(`[RDP] Start failed for ${activeName}: ${message.slice(0, 500)}${message.length > 500 ? `… (${message.length} chars)` : ""}`);
      setRdpStartFailed(true);
      setRdpError(message.slice(0, 300));
    }
  };
  const handleRDPClick = async (event: MouseEvent<HTMLImageElement>) => {
    rdpSurfaceRef.current?.focus();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    try { await SysAgentAPI.SendRDPInput(activeName!, event.button === 2 ? "RCLICK" : "CLICK", x, y); }
    catch (error: any) { setRdpError(String(error?.message || error)); }
  };
  const handleRDPKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const key = rdpKeyAlias(event.code);
    if (!key) return;
    event.preventDefault();
    if (rdpHeldKeys.current.has(key)) return;
    rdpHeldKeys.current.add(key);
    if (activeName) void SysAgentAPI.SendRDPKeyboardInput(activeName, "key_down", key);
  };
  const handleRDPKeyUp = (event: ReactKeyboardEvent<HTMLElement>) => {
    const key = rdpKeyAlias(event.code);
    if (!key) return;
    event.preventDefault();
    rdpHeldKeys.current.delete(key);
    if (activeName) void SysAgentAPI.SendRDPKeyboardInput(activeName, "key_up", key);
  };
  const closeRDP = () => {
    for (const key of rdpHeldKeys.current) {
      if (activeName) void SysAgentAPI.SendRDPKeyboardInput(activeName, "key_up", key);
    }
    rdpHeldKeys.current.clear();
    if (activeName) void SysAgentAPI.CloseRDPSession(activeName);
    setRdpOpen(false); setRdpStartFailed(false); setRdpFrame("");
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
            className="shrink-0 rounded border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm font-medium text-emerald-100 transition-colors hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={handleOpenRDP}
            disabled={!activeName || rdpOpen}
          >
            Подключиться к экрану
          </button>
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
      {rdpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onContextMenu={(event) => event.preventDefault()}>
          <section
            ref={rdpSurfaceRef}
            tabIndex={0}
            onKeyDown={handleRDPKeyDown}
            onKeyUp={handleRDPKeyUp}
            className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"
          >
            <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <h2 className="font-semibold text-slate-100">Удалённый экран · {activeName}</h2>
              <button className="rounded border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800" onClick={closeRDP}>Отключиться</button>
            </header>
            <div className="flex min-h-64 items-center justify-center overflow-auto p-3">
              {rdpFrame ? (
                <img
                  src={rdpFrame}
                  alt="Экран удалённого компьютера"
                  className="max-h-[75vh] max-w-full cursor-crosshair object-contain"
                  onClick={handleRDPClick}
                  onAuxClick={handleRDPClick}
                  onError={() => {
                    console.error(`[RDP] Browser could not decode frame for ${activeName}`);
                    setRdpError("Получен кадр, но браузер не смог его декодировать.");
                  }}
                  draggable={false}
                />
              ) : (
                <p className="text-sm text-slate-400">{rdpError || "Ожидание кадра от агента…"}</p>
              )}
            </div>
            {rdpError && rdpFrame && <p className="px-4 pb-3 text-sm text-rose-300">{rdpError}</p>}
          </section>
        </div>
      )}
    </div>
  );
}
