import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { SSHSessionController } from "./SSHSessionController";
import type { SSHSessionAPI, SSHSessionStatus } from "./SSHSessionController";
import * as SysAgentAPI from "../wailsjs/go/sysagent/SysAgent";

type SSHTerminalProps = {
  hostname: string;
  username: string;
  onClose: () => void;
  api?: SSHSessionAPI;
  connectByIP?: boolean;
};

const statusLabels: Record<SSHSessionStatus, string> = {
  preparing: "Настраиваю SSH и подключаюсь...",
  connected: "Подключено",
  closed: "Соединение закрыто",
  error: "Ошибка SSH",
};

export default function SSHTerminal({
  hostname,
  username,
  onClose,
  api = SysAgentAPI,
  connectByIP = false,
}: SSHTerminalProps) {
  const terminalElementRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<SSHSessionStatus>("preparing");
  const [statusDetail, setStatusDetail] = useState("");

  useEffect(() => {
    const element = terminalElementRef.current;
    if (!element) return;

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: 'ui-monospace, "Cascadia Code", "Segoe UI Mono", monospace',
      fontSize: 13,
      scrollback: 5000,
      theme: {
        background: "#020617",
        foreground: "#d1fae5",
        cursor: "#6ee7b7",
        selectionBackground: "#334155",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(element);
    fitAddon.fit();
    terminal.focus();

    const controller = new SSHSessionController(
      hostname,
      username,
      terminal,
      (nextStatus, detail = "") => {
        setStatus(nextStatus);
        setStatusDetail(detail);
      },
      api,
      connectByIP,
    );
    const inputSubscription = terminal.onData((data) => {
      void controller.write(data);
    });
    void controller.start();

    const resizeObserver = new ResizeObserver(() => fitAddon.fit());
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
      inputSubscription.dispose();
      void controller.close().catch((error: unknown) => {
        console.error("Не удалось закрыть SSH-сессию:", error);
      });
      terminal.dispose();
    };
  }, [hostname, username, api, connectByIP]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="ssh-terminal-title"
        className="flex h-[min(85vh,52rem)] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2
              id="ssh-terminal-title"
              className="font-semibold text-card-foreground"
            >
              SSH Terminal · {hostname}
            </h2>
            <p className="text-xs text-muted-foreground">
              {statusDetail || statusLabels[status]}
            </p>
          </div>
          <button
            className="rounded border border-border px-3 py-1.5 text-sm hover:bg-accent"
            onClick={onClose}
          >
            Закрыть
          </button>
        </header>
        <div
          ref={terminalElementRef}
          className="min-h-0 flex-1 overflow-hidden bg-slate-950 p-2"
        />
      </section>
    </div>
  );
}
