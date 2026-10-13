import type { Terminal } from "@xterm/xterm";
import * as SysAgentAPI from "../wailsjs/go/sysagent/SysAgent";
import { sysagent } from "../wailsjs/go/models";


export type SSHSessionStatus =
  | "preparing"
  | "connected"
  | "closed"
  | "error";

  function isIPv4(s: string): boolean {
  const parts = s.split(".");
  if (parts.length !== 4) return false;
  return parts.every(
    (p) => /^\d{1,3}$/.test(p) && Number(p) <= 255 && String(Number(p)) === p
  );
}

export class SSHSessionController {
  private sessionId: string | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private polling = false;
  private closed = false;

  constructor(
    private readonly hostname: string,
     private readonly username: string,
    private readonly terminal: Terminal,
    private readonly onStatus: (status: SSHSessionStatus, detail?: string) => void,
  ) {}

  async start(): Promise<void> {
    try {
      this.onStatus("preparing");
      
      const sessionId = await (!isIPv4(this.hostname) ? SysAgentAPI.StartSSHSessionByHostname(this.hostname): SysAgentAPI.StartSSHSessionByIP(this.hostname, this.username));
      if (this.closed) {
        await SysAgentAPI.CloseSSHSession(sessionId);
        return;
      }

      this.sessionId = sessionId;
      this.onStatus("connected");
      this.schedulePoll();
    } catch (error: unknown) {
      if (this.closed) return;
      this.onStatus("error", this.errorMessage(error));
      this.terminal.write(
        `\r\nНе удалось запустить SSH: ${this.errorMessage(error)}\r\n`,
      );
    }
  }

  async write(data: string): Promise<void> {
    if (!this.sessionId || this.closed) return;
    try {
      await SysAgentAPI.WriteSSHSession(this.sessionId, data);
    } catch (error: unknown) {
      if (this.closed) return;
      this.onStatus("error", this.errorMessage(error));
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    const sessionId = this.sessionId;
    this.sessionId = null;
    if (sessionId) {
      await SysAgentAPI.CloseSSHSession(sessionId);
    }
  }

  private schedulePoll(): void {
    if (this.closed || this.pollTimer !== null) return;
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      void this.poll();
    }, 100);
  }

  private async poll(): Promise<void> {
    if (!this.sessionId || this.closed || this.polling) return;
    this.polling = true;
    try {
      const update: sysagent.SSHSessionUpdate =
        await SysAgentAPI.ReadSSHSession(this.sessionId);
      if (this.closed) return;
      if (update.output) this.terminal.write(update.output);
      if (!update.running) {
        this.onStatus(
          update.error ? "error" : "closed",
          update.error || "SSH-соединение закрыто.",
        );
        return;
      }
    } catch (error: unknown) {
      if (this.closed) return;
      this.onStatus("error", this.errorMessage(error));
      return;
    } finally {
      this.polling = false;
    }

    this.schedulePoll();
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
