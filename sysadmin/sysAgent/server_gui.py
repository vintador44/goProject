import socket
import json
import threading
import subprocess
import platform
import tkinter as tk
from tkinter import ttk
from tkinter import messagebox
import matplotlib
matplotlib.use("TkAgg")
from matplotlib.figure import Figure
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg

HOST = '0.0.0.0'
TCP_PORT = 65432
UDP_PORT = 65433
SHELL_PORT = 65434

BG_MAIN = "#121214"
BG_CARD = "#1a1a1e"
BG_SIDEBAR = "#0e0e10"
TEXT_MAIN = "#e1e1e6"
TEXT_MUTED = "#8d8d99"
ACCENT_GREEN = "#04d361"
ACCENT_WARN = "#ffcd3c"
ACCENT_CRIT = "#f74040"
ACCENT_BLUE = "#007acc"

MAX_HISTORY = 60

def setup_firewall():
    if platform.system() == "Windows":
        try:
            for rule in ["TCP", "UDP", "Shell"]:
                subprocess.run(f'netsh advfirewall firewall delete rule name="SysAdmin_Server_{rule}"', shell=True,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            subprocess.run(
                f'netsh advfirewall firewall add rule name="SysAdmin_Server_TCP" dir=in action=allow protocol=TCP localport={TCP_PORT}',
                shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            subprocess.run(
                f'netsh advfirewall firewall add rule name="SysAdmin_Server_UDP" dir=in action=allow protocol=UDP localport={UDP_PORT}',
                shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            subprocess.run(
                f'netsh advfirewall firewall add rule name="SysAdmin_Server_Shell" dir=in action=allow protocol=TCP localport={SHELL_PORT}',
                shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except:
            pass

class MultiDeviceServerApp:
    def __init__(self, root):
        self.root = root
        self.root.title("SysAdmin Control Center v4.0")
        self.root.geometry("1100x850")
        self.root.configure(bg=BG_MAIN)

        self.devices_data = {}
        self.device_commands = {}
        self.selected_hostname = None
        self.history = {}

        self.style = ttk.Style()
        self.style.theme_use('default')
        self.configure_styles()

        # --- БОКОВАЯ ПАНЕЛЬ ---
        self.sidebar = tk.Frame(root, bg=BG_SIDEBAR, width=220, bd=0)
        self.sidebar.pack(side="left", fill="y")
        self.sidebar.pack_propagate(False)

        tk.Label(self.sidebar, text="🖥️ УСТРОЙСТВА", font=("Segoe UI", 10, "bold"), fg=TEXT_MUTED, bg=BG_SIDEBAR).pack(
            pady=(20, 10), padx=10, anchor="w")

        self.device_listbox = tk.Listbox(
            self.sidebar, bg=BG_SIDEBAR, fg=TEXT_MAIN, selectbackground="#29292e",
            selectforeground=ACCENT_GREEN, font=("Segoe UI", 11), bd=0, highlightthickness=0
        )
        self.device_listbox.pack(fill="both", expand=True, padx=10, pady=5)
        self.device_listbox.bind("<<ListboxSelect>>", self.on_device_selected)

        # --- ГЛАВНАЯ ПАНЕЛЬ ---
        self.main_panel = tk.Frame(root, bg=BG_MAIN)
        self.main_panel.pack(side="right", fill="both", expand=True)

        # Верхняя панель с названием хоста и кнопками
        self.header_frame = tk.Frame(self.main_panel, bg=BG_MAIN)
        self.header_frame.pack(fill="x", padx=25, pady=15)

        self.label_host = tk.Label(self.header_frame, text="Ожидание агентов...", font=("Segoe UI", 16, "bold"),
                                   fg=TEXT_MAIN, bg=BG_MAIN)
        self.label_host.pack(side="left")

        self.btn_shutdown = tk.Button(self.header_frame, text="🛑 Выключить агента", font=("Segoe UI", 10, "bold"),
                                      bg=ACCENT_CRIT, fg="white", bd=0, padx=10, pady=6, cursor="hand2",
                                      command=self.trigger_shutdown)
        self.btn_shutdown.pack(side="right", padx=5)
        self.btn_shutdown.pack_forget()

        self.btn_clear_temp = tk.Button(self.header_frame, text="🗑️ Очистить TEMP", font=("Segoe UI", 10, "bold"),
                                        bg=ACCENT_WARN, fg=BG_MAIN, bd=0, padx=10, pady=6, cursor="hand2",
                                        command=self.trigger_temp_cleanup)
        self.btn_clear_temp.pack(side="right", padx=5)
        self.btn_clear_temp.pack_forget()

        self.btn_terminal = tk.Button(self.header_frame, text="🔌 Удаленный терминал", font=("Segoe UI", 10, "bold"),
                                      bg=ACCENT_BLUE, fg="white", bd=0, padx=10, pady=6, cursor="hand2",
                                      command=self.open_remote_terminal)
        self.btn_terminal.pack(side="right", padx=5)
        self.btn_terminal.pack_forget()

        self.btn_console = tk.Button(self.header_frame, text="📟 Включить консоль", font=("Segoe UI", 10, "bold"),
                                     bg=ACCENT_GREEN, fg=BG_MAIN, bd=0, padx=10, pady=6, cursor="hand2",
                                     command=self.toggle_agent_console)
        self.btn_console.pack(side="right", padx=5)
        self.btn_console.pack_forget()

        # NOTEBOOK (ВКЛАДКИ) С ЕДИНЫМ СТИЛЕМ
        self.notebook = ttk.Notebook(self.main_panel)
        self.notebook.pack(fill="both", expand=True, padx=25, pady=(0, 15))

        # Вкладка 1: Мониторинг
        self.tab_monitor = tk.Frame(self.notebook, bg=BG_MAIN)
        self.notebook.add(self.tab_monitor, text="📊 Мониторинг")

        # Вкладка 2: Графики
        self.tab_plots = tk.Frame(self.notebook, bg=BG_MAIN)
        self.notebook.add(self.tab_plots, text="📈 Графики")

        # --- СОДЕРЖИМОЕ ВКЛАДКИ МОНИТОРИНГ ---
        self.create_monitor_tab()

        # --- СОДЕРЖИМОЕ ВКЛАДКИ ГРАФИКОВ ---
        self.create_plots_tab()

        # Запуск сетевых потоков
        threading.Thread(target=self.socket_server_worker, daemon=True).start()
        threading.Thread(target=self.udp_broadcast_worker, daemon=True).start()

    def configure_styles(self):
        # Стиль для прогресс-баров
        self.style.configure("TProgressbar", thickness=12, troughcolor=BG_MAIN, borderwidth=0)
        self.style.configure("Green.Horizontal.TProgressbar", background=ACCENT_GREEN)
        self.style.configure("Yellow.Horizontal.TProgressbar", background=ACCENT_WARN)
        self.style.configure("Red.Horizontal.TProgressbar", background=ACCENT_CRIT)

        # --- СТИЛЬ ДЛЯ ВКЛАДОК (NOTEBOOK) ---
        self.style.configure("TNotebook", background=BG_MAIN, borderwidth=0, tabmargins=0)
        self.style.configure("TNotebook.Tab",
                             background=BG_CARD,
                             foreground=TEXT_MUTED,
                             padding=[12, 6],
                             font=("Segoe UI", 10, "bold"),
                             borderwidth=0,
                             focuscolor="")
        # Цвет активной вкладки
        self.style.map("TNotebook.Tab",
                       background=[("selected", BG_MAIN)],
                       foreground=[("selected", ACCENT_GREEN)],
                       expand=[("selected", [1, 1, 1, 0])])

    def get_style_by_value(self, value):
        if value < 50:
            return "Green.Horizontal.TProgressbar"
        elif value < 80:
            return "Yellow.Horizontal.TProgressbar"
        return "Red.Horizontal.TProgressbar"

    def create_monitor_tab(self):
        # Карточка CPU
        self.cpu_frame = tk.Frame(self.tab_monitor, bg=BG_CARD, bd=0, highlightbackground="#29292e", highlightthickness=1)
        self.cpu_frame.pack(fill="x", pady=4)
        tk.Label(self.cpu_frame, text="📊 ЦЕНТРАЛЬНЫЙ ПРОЦЕССОР (CPU)", font=("Segoe UI", 10, "bold"), fg=TEXT_MUTED,
                 bg=BG_CARD).pack(anchor="w", padx=15, pady=(10, 2))
        self.label_cpu_model = tk.Label(self.cpu_frame, text="Модель: --", font=("Segoe UI", 9, "italic"),
                                        fg=TEXT_MUTED, bg=BG_CARD)
        self.label_cpu_model.pack(anchor="w", padx=15, pady=(0, 2))
        self.cpu_info_frame = tk.Frame(self.cpu_frame, bg=BG_CARD)
        self.cpu_info_frame.pack(fill="x", padx=15)
        self.label_cpu = tk.Label(self.cpu_info_frame, text="Загрузка CPU: --%", font=("Segoe UI", 12), fg=TEXT_MAIN,
                                  bg=BG_CARD)
        self.label_cpu.pack(side="left")
        self.label_cpu_temp = tk.Label(self.cpu_info_frame, text="Темп.: --", font=("Segoe UI", 12, "bold"),
                                       fg=TEXT_MUTED, bg=BG_CARD)
        self.label_cpu_temp.pack(side="right")
        self.progress_cpu = ttk.Progressbar(self.cpu_frame, mode='determinate', style="Green.Horizontal.TProgressbar")
        self.progress_cpu.pack(fill="x", padx=15, pady=(5, 12))

        # Карточка RAM
        self.ram_frame = tk.Frame(self.tab_monitor, bg=BG_CARD, bd=0, highlightbackground="#29292e", highlightthickness=1)
        self.ram_frame.pack(fill="x", pady=4)
        tk.Label(self.ram_frame, text="🧠 ОПЕРАТИВНАЯ ПАМЯТЬ (RAM)", font=("Segoe UI", 10, "bold"), fg=TEXT_MUTED,
                 bg=BG_CARD).pack(anchor="w", padx=15, pady=(10, 2))
        self.label_ram = tk.Label(self.ram_frame, text="Загрузка RAM: --%", font=("Segoe UI", 12), fg=TEXT_MAIN,
                                  bg=BG_CARD)
        self.label_ram.pack(anchor="w", padx=15)
        self.progress_ram = ttk.Progressbar(self.ram_frame, mode='determinate', style="Green.Horizontal.TProgressbar")
        self.progress_ram.pack(fill="x", padx=15, pady=(5, 12))

        # Карточка GPU
        self.gpu_frame = tk.Frame(self.tab_monitor, bg=BG_CARD, bd=0, highlightbackground="#29292e", highlightthickness=1)
        self.gpu_frame.pack(fill="x", pady=4)
        tk.Label(self.gpu_frame, text="🎮 ГРАФИЧЕСКИЙ ПРОЦЕССОР (GPU)", font=("Segoe UI", 10, "bold"), fg=TEXT_MUTED,
                 bg=BG_CARD).pack(anchor="w", padx=15, pady=(10, 2))
        self.label_gpu_model = tk.Label(self.gpu_frame, text="Модель: --", font=("Segoe UI", 9, "italic"),
                                        fg=TEXT_MUTED, bg=BG_CARD)
        self.label_gpu_model.pack(anchor="w", padx=15, pady=(0, 2))
        self.gpu_info_frame = tk.Frame(self.gpu_frame, bg=BG_CARD)
        self.gpu_info_frame.pack(fill="x", padx=15)
        self.label_gpu = tk.Label(self.gpu_info_frame, text="Загрузка GPU: --%", font=("Segoe UI", 12), fg=TEXT_MAIN,
                                  bg=BG_CARD)
        self.label_gpu.pack(side="left")
        self.label_gpu_temp = tk.Label(self.gpu_info_frame, text="Темп.: --", font=("Segoe UI", 12, "bold"),
                                       fg=TEXT_MUTED, bg=BG_CARD)
        self.label_gpu_temp.pack(side="right")
        self.progress_gpu = ttk.Progressbar(self.gpu_frame, mode='determinate', style="Green.Horizontal.TProgressbar")
        self.progress_gpu.pack(fill="x", padx=15, pady=(5, 12))

        # Карточка дисков
        self.disks_frame = tk.Frame(self.tab_monitor, bg=BG_CARD, bd=0, highlightbackground="#29292e", highlightthickness=1)
        self.disks_frame.pack(fill="x", pady=4)
        tk.Label(self.disks_frame, text="💾 НАКОПИТЕЛИ И ДИСКИ", font=("Segoe UI", 10, "bold"), fg=TEXT_MUTED,
                 bg=BG_CARD).pack(anchor="w", padx=15, pady=(8, 2))
        self.text_disks = tk.Text(self.disks_frame, bg=BG_CARD, fg=TEXT_MAIN, font=("Consolas", 10), bd=0,
                                  highlightthickness=0, height=4)
        self.text_disks.pack(fill="x", padx=15, pady=(0, 8))

        # Карточка сети
        self.net_frame = tk.Frame(self.tab_monitor, bg=BG_CARD, bd=0, highlightbackground="#29292e", highlightthickness=1)
        self.net_frame.pack(fill="both", expand=True, pady=4)
        tk.Label(self.net_frame, text="🌐 СЕТЕВЫЕ ИНТЕРФЕЙСЫ", font=("Segoe UI", 10, "bold"), fg=TEXT_MUTED,
                 bg=BG_CARD).pack(anchor="w", padx=15, pady=(8, 2))
        self.text_net = tk.Text(self.net_frame, bg=BG_CARD, fg=TEXT_MAIN, font=("Consolas", 10), bd=0,
                                highlightthickness=0)
        self.text_net.pack(fill="both", expand=True, padx=15, pady=(0, 8))

    def create_plots_tab(self):
        # Создаем фигуру matplotlib с тремя подграфиками
        self.figure = Figure(figsize=(10, 6), dpi=80, facecolor=BG_CARD)
        self.ax_cpu = self.figure.add_subplot(311)
        self.ax_ram = self.figure.add_subplot(312)
        self.ax_gpu = self.figure.add_subplot(313)

        for ax in (self.ax_cpu, self.ax_ram, self.ax_gpu):
            ax.set_facecolor(BG_CARD)
            ax.tick_params(colors=TEXT_MUTED, labelcolor=TEXT_MUTED)
            ax.spines['bottom'].set_color(TEXT_MUTED)
            ax.spines['top'].set_color(TEXT_MUTED)
            ax.spines['right'].set_color(TEXT_MUTED)
            ax.spines['left'].set_color(TEXT_MUTED)
            ax.xaxis.label.set_color(TEXT_MUTED)
            ax.yaxis.label.set_color(TEXT_MUTED)
            ax.title.set_color(TEXT_MAIN)
            ax.grid(True, linestyle='--', alpha=0.3, color=TEXT_MUTED)

        self.ax_cpu.set_ylabel("CPU %")
        self.ax_ram.set_ylabel("RAM %")
        self.ax_gpu.set_ylabel("GPU %")
        self.ax_gpu.set_xlabel("Время (номер измерения)")

        self.canvas = FigureCanvasTkAgg(self.figure, master=self.tab_plots)
        self.canvas.draw()
        self.canvas.get_tk_widget().pack(fill="both", expand=True, padx=15, pady=15)

    def update_history(self, hostname, metrics):
        if hostname not in self.history:
            self.history[hostname] = {'cpu': [], 'ram': [], 'gpu': [], 'time': []}
        hist = self.history[hostname]
        hist['cpu'].append(metrics['cpu_percent'])
        hist['ram'].append(metrics['ram_percent'])
        hist['gpu'].append(metrics['gpu_percent'])
        current_len = len(hist['cpu'])
        hist['time'].append(current_len)
        if len(hist['cpu']) > MAX_HISTORY:
            hist['cpu'] = hist['cpu'][-MAX_HISTORY:]
            hist['ram'] = hist['ram'][-MAX_HISTORY:]
            hist['gpu'] = hist['gpu'][-MAX_HISTORY:]
            hist['time'] = list(range(1, MAX_HISTORY + 1))

    def update_plots(self, hostname):
        if hostname not in self.history or not self.history[hostname]['cpu']:
            return
        hist = self.history[hostname]
        self.ax_cpu.clear()
        self.ax_ram.clear()
        self.ax_gpu.clear()

        self.ax_cpu.plot(hist['time'], hist['cpu'], color=ACCENT_GREEN, linewidth=2, marker='o', markersize=3)
        self.ax_cpu.set_ylabel("CPU %")
        self.ax_cpu.set_ylim(0, 100)
        self.ax_cpu.set_facecolor(BG_CARD)
        self.ax_cpu.tick_params(colors=TEXT_MUTED, labelcolor=TEXT_MUTED)
        self.ax_cpu.grid(True, linestyle='--', alpha=0.3, color=TEXT_MUTED)

        self.ax_ram.plot(hist['time'], hist['ram'], color=ACCENT_BLUE, linewidth=2, marker='o', markersize=3)
        self.ax_ram.set_ylabel("RAM %")
        self.ax_ram.set_ylim(0, 100)
        self.ax_ram.set_facecolor(BG_CARD)
        self.ax_ram.tick_params(colors=TEXT_MUTED, labelcolor=TEXT_MUTED)
        self.ax_ram.grid(True, linestyle='--', alpha=0.3, color=TEXT_MUTED)

        self.ax_gpu.plot(hist['time'], hist['gpu'], color=ACCENT_WARN, linewidth=2, marker='o', markersize=3)
        self.ax_gpu.set_ylabel("GPU %")
        self.ax_gpu.set_xlabel("Время (номер измерения)")
        self.ax_gpu.set_ylim(0, 100)
        self.ax_gpu.set_facecolor(BG_CARD)
        self.ax_gpu.tick_params(colors=TEXT_MUTED, labelcolor=TEXT_MUTED)
        self.ax_gpu.grid(True, linestyle='--', alpha=0.3, color=TEXT_MUTED)

        self.canvas.draw_idle()

    def handle_incoming_data(self, metrics, ip_addr):
        hostname = metrics['hostname']
        is_new = hostname not in self.devices_data
        self.devices_data[hostname] = {"metrics": metrics, "ip": ip_addr}
        self.update_history(hostname, metrics)

        if is_new:
            self.device_listbox.insert(tk.END, hostname)
            if not self.selected_hostname:
                self.device_listbox.selection_set(0)
                self.selected_hostname = hostname
                self.update_plots(hostname)

        if self.selected_hostname == hostname:
            self.refresh_dashboard(hostname)
            self.update_plots(hostname)

    def on_device_selected(self, event):
        selection = self.device_listbox.curselection()
        if selection:
            self.selected_hostname = self.device_listbox.get(selection[0])
            self.refresh_dashboard(self.selected_hostname)
            self.update_plots(self.selected_hostname)

    def toggle_agent_console(self):
        if not self.selected_hostname: return
        cmd = "SHOW" if self.device_commands.get(self.selected_hostname) != "SHOW" else "HIDE"
        self.device_commands[self.selected_hostname] = cmd
        self.refresh_dashboard(self.selected_hostname)

    def trigger_temp_cleanup(self):
        if not self.selected_hostname: return
        if messagebox.askyesno("Очистка TEMP", f"Очистить папки TEMP на узле {self.selected_hostname}?"):
            self.device_commands[self.selected_hostname] = "CLEAR_TEMP"
            messagebox.showinfo("Готово", "Команда отправлена агенту.")

    def trigger_shutdown(self):
        if not self.selected_hostname: return
        if messagebox.askyesno("ВЫКЛЮЧЕНИЕ",
                               f"Вы уверены, что хотите завершить работу агента на {self.selected_hostname}?\nБез ручного перезапуска он больше не появится в сети.",
                               icon='warning'):
            self.device_commands[self.selected_hostname] = "SHUTDOWN"
            messagebox.showinfo("Готово", "Сигнал отправлен агенту.")

    def open_remote_terminal(self):
        if not self.selected_hostname: return
        hostname = self.selected_hostname
        self.device_commands[hostname] = "START_SHELL"

        term_win = tk.Toplevel(self.root)
        term_win.title(f"Удаленная консоль: {hostname}")
        term_win.geometry("750x480")
        term_win.configure(bg="#1e1e1e")

        txt_output = tk.Text(term_win, bg="#1e1e1e", fg="#ffffff", font=("Consolas", 10), insertbackground="white")
        txt_output.pack(fill="both", expand=True, padx=12, pady=12)
        txt_output.insert(tk.END, f"[СЕРВЕР] Ожидание подключения сессии от {hostname}...\n")

        cmd_entry = tk.Entry(term_win, bg="#2d2d2d", fg="#ffffff", font=("Consolas", 11), insertbackground="white", bd=0)
        cmd_entry.pack(fill="x", padx=12, pady=(0, 12))
        cmd_entry.focus_set()

        shell_ctx = {"conn": None, "active": True}

        def append_log(text):
            if term_win.winfo_exists():
                self.root.after(0, lambda: (txt_output.insert(tk.END, text), txt_output.see(tk.END)))

        def send_command(event=None):
            cmd = cmd_entry.get()
            cmd_entry.delete(0, tk.END)
            if not cmd: return
            append_log(f"\n> {cmd}\n")
            if shell_ctx["conn"]:
                try:
                    shell_ctx["conn"].sendall(cmd.encode('utf-8'))
                except Exception as e:
                    append_log(f"[СЕРВЕР] Ошибка: {e}\n")
            else:
                append_log("[СЕРВЕР] Подключение еще не установлено.\n")

        cmd_entry.bind("<Return>", send_command)

        def run_terminal_listener():
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                s.bind(('0.0.0.0', SHELL_PORT))
                s.listen(1)
                s.settimeout(12.0)
                try:
                    conn, addr = s.accept()
                    shell_ctx["conn"] = conn
                    append_log(f"[СЕРВЕР] Успешно подключено к интерпретатору {addr[0]}!\n\n")
                    while shell_ctx["active"]:
                        data = conn.recv(16384)
                        if not data:
                            append_log("\n[СЕРВЕР] Соединение разорвано агентом.\n")
                            break
                        append_log(data.decode('utf-8', errors='ignore'))
                except socket.timeout:
                    append_log("\n[СЕРВЕР] Таймаут ожидания агента.\n")
                except Exception as e:
                    append_log(f"\n[СЕРВЕР] Исключение: {e}\n")

        def close_session():
            shell_ctx["active"] = False
            if shell_ctx["conn"]:
                try:
                    shell_ctx["conn"].close()
                except:
                    pass
            if term_win.winfo_exists():
                term_win.destroy()

        term_win.protocol("WM_DELETE_WINDOW", close_session)
        threading.Thread(target=run_terminal_listener, daemon=True).start()

    def refresh_dashboard(self, hostname):
        device = self.devices_data.get(hostname)
        if not device: return
        metrics, ip = device["metrics"], device["ip"]

        self.label_host.config(text=f"💻 {hostname} [{ip}]")

        self.btn_shutdown.pack(side="right", padx=5)
        self.btn_clear_temp.pack(side="right", padx=5)
        self.btn_terminal.pack(side="right", padx=5)
        self.btn_console.pack(side="right", padx=5)

        if self.device_commands.get(hostname) == "SHOW":
            self.btn_console.config(text="📴 Выключить консоль", bg=ACCENT_CRIT, fg=TEXT_MAIN)
        else:
            self.btn_console.config(text="📟 Включить консоль", bg=ACCENT_GREEN, fg=BG_MAIN)

        # CPU
        self.label_cpu_model.config(text=f"Модель: {metrics.get('cpu_model', 'Неизвестно')}")
        temp = metrics.get('cpu_temp', 'Н/Д')
        self.label_cpu_temp.config(text=f"Темп.: {temp}")
        if "°C" in temp:
            try:
                t_val = float(temp.replace("°C", ""))
                if t_val > 75:
                    self.label_cpu_temp.config(fg=ACCENT_CRIT)
                elif t_val > 60:
                    self.label_cpu_temp.config(fg=ACCENT_WARN)
                else:
                    self.label_cpu_temp.config(fg=ACCENT_GREEN)
            except:
                self.label_cpu_temp.config(fg=TEXT_MUTED)
        cpu = metrics['cpu_percent']
        self.label_cpu.config(text=f"Загрузка CPU: {cpu}%")
        self.progress_cpu.config(style=self.get_style_by_value(cpu))
        self.progress_cpu['value'] = cpu

        # RAM
        ram = metrics['ram_percent']
        self.label_ram.config(text=f"Загрузка RAM: {ram}% (Всего: {metrics.get('ram_total', '--')} GB)")
        self.progress_ram.config(style=self.get_style_by_value(ram))
        self.progress_ram['value'] = ram

        # GPU
        self.label_gpu_model.config(text=f"Модель: {metrics.get('gpu_model', 'Неизвестно')}")
        gpu_pct, gpu_temp = metrics.get('gpu_percent', 0), metrics.get('gpu_temp', 'Н/Д')
        self.label_gpu.config(text=f"Загрузка GPU: {gpu_pct}%")
        self.label_gpu_temp.config(text=f"Темп.: {gpu_temp}")
        self.progress_gpu.config(style=self.get_style_by_value(gpu_pct))
        self.progress_gpu['value'] = gpu_pct
        if "°C" in gpu_temp:
            try:
                t_val = float(gpu_temp.replace("°C", ""))
                if t_val > 78:
                    self.label_gpu_temp.config(fg=ACCENT_CRIT)
                elif t_val > 68:
                    self.label_gpu_temp.config(fg=ACCENT_WARN)
                else:
                    self.label_gpu_temp.config(fg=ACCENT_GREEN)
            except:
                self.label_gpu_temp.config(fg=TEXT_MUTED)
        else:
            self.label_gpu_temp.config(fg=TEXT_MUTED)

        # Диски
        self.text_disks.delete("1.0", tk.END)
        disks = metrics.get("disks", {})
        parts, phys = disks.get("partitions", []), disks.get("physical", [])
        if parts:
            self.text_disks.insert(tk.END, " Логические разделы:\n")
            for p in parts:
                self.text_disks.insert(tk.END, f"   ├─ {p.get('drive')} (Всего: {p.get('total')} GB) ── Занято: {p.get('percent')}%\n")
        if phys:
            self.text_disks.insert(tk.END, " Физические накопители:\n")
            for d in phys:
                self.text_disks.insert(tk.END, f"   └─ {d.get('name')} ── Нагрузка: {d.get('load')}% | Темп: {d.get('temp')}\n")
        if not parts and not phys:
            self.text_disks.insert(tk.END, " Данные отсутствуют.")

        # Сеть
        self.text_net.delete("1.0", tk.END)
        for net_card, net_info in metrics.get('net_interfaces', {}).items():
            ips_str = ", ".join(net_info['ips']) if net_info['ips'] else "Нет IP"
            self.text_net.insert(tk.END, f" 🖥️  {net_card}\n     ├─ IPv4: {ips_str}\n     └─ MAC:  {net_info['mac']}\n\n")

    def socket_server_worker(self):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind((HOST, TCP_PORT))
            s.listen()
            while True:
                try:
                    conn, addr = s.accept()
                    with conn:
                        data = conn.recv(4096)
                        if not data: continue
                        metrics = json.loads(data.decode('utf-8'))
                        hostname = metrics['hostname']
                        cmd = self.device_commands.get(hostname, "HIDE")
                        conn.sendall(cmd.encode('utf-8'))
                        if cmd in ["START_SHELL", "CLEAR_TEMP", "SHUTDOWN"]:
                            self.device_commands[hostname] = "HIDE"
                        self.root.after(0, self.handle_incoming_data, metrics, addr[0])
                except:
                    pass

    def udp_broadcast_worker(self):
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind(('0.0.0.0', UDP_PORT))
            while True:
                try:
                    data, addr = s.recvfrom(1024)
                    if data == b"DISCOVER_SYSADMIN_SERVER":
                        s.sendto(b"HERE_IS_SYSADMIN_SERVER", addr)
                except:
                    pass

if __name__ == "__main__":
    setup_firewall()
    root = tk.Tk()
    app = MultiDeviceServerApp(root)
    root.mainloop()