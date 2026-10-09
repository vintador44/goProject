from pprint import pprint
import socket
import json
import time
import psutil
import platform
import subprocess
import ctypes
import sys
import os
import shutil
import threading
import sqlite3
from pynput import keyboard
from pynput.mouse import Button, Controller as MouseController
import tkinter as tk
from tkinter import simpledialog

try:
    import clr

    HAS_PYTHONNET = True
except ImportError:
    HAS_PYTHONNET = False

TCP_PORT = 65432
UDP_PORT = 65433
SHELL_PORT = 65434
RDP_PORT = 65435

console_allocated = False
lhm_computer = None
CACHED_CPU_MODEL = "Н/Д"
CACHED_GPU_MODEL = "Н/Д"
_mutex_handle = None
overlay_root_ref = None

PREV_NET_IO = None
PREV_NET_TIME = None


def log_message(message):
    try:
        base_path = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.dirname(
            os.path.abspath(__file__))
        log_path = os.path.join(base_path, "agent_log.txt")
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%H:%M:%S')}] {message}\n")
    except:
        pass


def is_already_running():
    if platform.system() != "Windows":
        return False
    try:
        kernel32 = ctypes.windll.kernel32
        mutex_name = r"Global\SysAdminAgent_Unique_Mutex"
        global _mutex_handle
        _mutex_handle = kernel32.CreateMutexW(None, False, mutex_name)
        if kernel32.GetLastError() == 183:
            log_message("Обнаружен запущенный экземпляр агента. Завершение.")
            return True
        return False
    except Exception as e:
        log_message(f"Ошибка при создании мьютекса: {e}")
        return False


def init_db():
    try:
        base_path = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.dirname(
            os.path.abspath(__file__))
        db_path = os.path.join(base_path, "agent_history.db")
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            cpu_percent REAL,
            ram_percent REAL,
            gpu_percent REAL,
            raw_json TEXT
        )
        """)
        conn.commit()
        conn.close()
    except Exception as e:
        log_message(f"Ошибка инициализации БД: {e}")


def save_metric_to_db(metrics):
    try:
        base_path = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.dirname(
            os.path.abspath(__file__))
        db_path = os.path.join(base_path, "agent_history.db")
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO metrics (timestamp, cpu_percent, ram_percent, gpu_percent, raw_json)
        VALUES (?, ?, ?, ?, ?)
        """, (time.strftime('%Y-%m-%d %H:%M:%S'), metrics['cpu_percent'], metrics['ram_percent'],
              metrics['gpu_percent'], json.dumps(metrics)))
        cursor.execute("DELETE FROM metrics WHERE id NOT IN (SELECT id FROM metrics ORDER BY id DESC LIMIT 60)")
        conn.commit()
        conn.close()
    except Exception as e:
        log_message(f"Ошибка сохранения метрики в БД: {e}")


def show_user_notification(text, stop_event=None):
    try:
        root = tk.Tk()
        root.overrideredirect(True)
        root.attributes("-topmost", True)
        is_rdp = "экран" in text.lower()
        bg_color = "#ffcd3c" if is_rdp else "#2b579a"
        fg_color = "#121214" if is_rdp else "#ffffff"

        root.configure(bg=bg_color)
        frame = tk.Frame(root, bg=bg_color, bd=2, relief="solid")
        frame.pack(fill="both", expand=True)

        lbl = tk.Label(frame, text=text, fg=fg_color, bg=bg_color,
                       font=("Segoe UI", 12, "bold"), padx=25, pady=12)
        lbl.pack(expand=True, fill="both")

        root.update_idletasks()
        window_w = root.winfo_reqwidth()
        window_h = root.winfo_reqheight()
        screen_w = root.winfo_screenwidth()
        x = (screen_w - window_w) // 2
        y = 25
        root.geometry(f"{window_w}x{window_h}+{x}+{y}")

        def check_dismiss_condition():
            if stop_event and stop_event.is_set():
                root.destroy()
            elif not stop_event:
                root.after(4000, root.destroy)
            else:
                root.after(250, check_dismiss_condition)

        root.after(250, check_dismiss_condition)
        root.mainloop()
    except Exception as e:
        log_message(f"Ошибка UI уведомления: {e}")


def remote_desktop_client(server_ip):
    import io
    try:
        from PIL import ImageGrab
    except ImportError:
        log_message("Ошибка RDP: Pillow не установлена.")
        return
    mouse = MouseController()
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except:
        pass

    rdp_active_event = threading.Event()
    threading.Thread(target=show_user_notification,
                     args=("⚠️ ДИСТАНЦИОННОЕ УПРАВЛЕНИЕ: Администратор видит ваш экран", rdp_active_event),
                     daemon=True).start()

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.connect((server_ip, RDP_PORT))
            s.setblocking(False)
            buffer = b""
            last_shot_time = 0

            while True:
                try:
                    data = s.recv(1024)
                    if data:
                        buffer += data
                        while b"\n" in buffer:
                            line_bytes, buffer = buffer.split(b"\n", 1)
                            line = line_bytes.decode('utf-8', errors='ignore').strip()
                            if ":" in line:
                                btn_type, coords = line.split(":", 1)
                                pct_x, pct_y = map(float, coords.split(","))
                                screen_w = ctypes.windll.user32.GetSystemMetrics(0)
                                screen_h = ctypes.windll.user32.GetSystemMetrics(1)
                                target_x = int(pct_x * screen_w)
                                target_y = int(pct_y * screen_h)
                                mouse.position = (target_x, target_y)
                                if btn_type == "CLICK":
                                    mouse.click(Button.left, 1)
                                elif btn_type == "RCLICK":
                                    mouse.click(Button.right, 1)
                    elif data == b"":
                        break
                except BlockingIOError:
                    pass
                except Exception as e:
                    log_message(f"RDP Recv Error: {e}")
                    break

                now = time.time()
                if now - last_shot_time > 0.10:
                    try:
                        screenshot = ImageGrab.grab()
                        img_byte_arr = io.BytesIO()
                        screenshot.save(img_byte_arr, format='JPEG', quality=50)
                        img_bytes = img_byte_arr.getvalue()
                        size_prefix = len(img_bytes).to_bytes(4, byteorder='big')

                        s.setblocking(True)
                        s.sendall(size_prefix + img_bytes)
                        s.setblocking(False)
                        last_shot_time = now
                    except Exception as e:
                        log_message(f"RDP Send Error: {e}")
                        break
                time.sleep(0.03)
    finally:
        rdp_active_event.set()
        log_message("Сессия удаленного рабочего стола завершена")


def remote_shell_client(server_ip):
    threading.Thread(target=show_user_notification,
                     args=("🔌 БЕЗОПАСНОСТЬ: Администратор открыл удаленный терминал (CMD)", None),
                     daemon=True).start()
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.connect((server_ip, SHELL_PORT))
            while True:
                cmd_bytes = s.recv(4096)
                if not cmd_bytes:
                    break
                cmd_str = cmd_bytes.decode('utf-8', errors='ignore').strip()
                if cmd_str.lower() == 'exit':
                    break

                try:
                    res = subprocess.run(cmd_str, shell=True, capture_output=True, timeout=15)
                    try:
                        out_str = res.stdout.decode('cp866') + res.stderr.decode('cp866')
                    except:
                        out_str = res.stdout.decode('utf-8', errors='ignore') + res.stderr.decode('utf-8',
                                                                                                  errors='ignore')
                except Exception as e:
                    out_str = f"Ошибка: {e}\n"

                if not out_str:
                    out_str = "Команда выполнена, вывод пуст.\n"
                s.sendall(out_str.encode('utf-8', errors='ignore'))
    except Exception as e:
        log_message(f"Удаленный сеанс терминала завершен: {e}")


def clear_temp_files():
    temp_paths = [
        os.environ.get('TEMP'),
        os.environ.get('TMP'),
        os.path.join(os.environ.get('SystemRoot', r'C:\Windows'), 'Temp')
    ]
    deleted_files, deleted_dirs = 0, 0
    for path in temp_paths:
        if path and os.path.exists(path):
            for item in os.listdir(path):
                try:
                    p = os.path.join(path, item)
                    if os.path.isfile(p):
                        os.unlink(p)
                        deleted_files += 1
                    elif os.path.isdir(p):
                        shutil.rmtree(p)
                        deleted_dirs += 1
                except:
                    continue
    log_message(f"Очистка TEMP завершена. Файлов: {deleted_files}, Папок: {deleted_dirs}")


def get_top_processes():
    processes = []
    for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_info']):
        try:
            pinfo = proc.info
            pinfo['memory_mb'] = round(pinfo['memory_info'].rss / (1024 * 1024), 1)
            processes.append(pinfo)
        except:
            continue
    return sorted(processes, key=lambda x: x['cpu_percent'] if x['cpu_percent'] else 0, reverse=True)[:10]


def start_overlay():
    global overlay_root_ref
    try:
        root = tk.Tk()
        overlay_root_ref = root
        root.title("Local Overlay")
        root.overrideredirect(True)
        root.attributes("-topmost", True)

        bg_color = "#121214"
        if platform.system() == "Windows":
            root.wm_attributes("-alpha", 0.85)

        root.configure(bg=bg_color)

        frame = tk.Frame(root, bg=bg_color, bd=1, relief="solid", highlightbackground="#2b579a", highlightthickness=1)
        frame.pack(fill="both", expand=True)

        tk.Label(frame, text="💻 Локальный мониторинг", font=("Segoe UI", 9, "bold"), fg="#ffffff", bg=bg_color).pack(
            anchor="w", padx=10, pady=(5, 0))

        lbl_cpu = tk.Label(frame, text="CPU: --", fg="#04d361", bg=bg_color, font=("Consolas", 10))
        lbl_cpu.pack(anchor="w", padx=10, pady=2)

        lbl_gpu = tk.Label(frame, text="GPU: --", fg="#ffcd3c", bg=bg_color, font=("Consolas", 10))
        lbl_gpu.pack(anchor="w", padx=10, pady=2)

        lbl_ram = tk.Label(frame, text="RAM: --", fg="#007acc", bg=bg_color, font=("Consolas", 10))
        lbl_ram.pack(anchor="w", padx=10, pady=(2, 5))

        screen_w = root.winfo_screenwidth()
        screen_h = root.winfo_screenheight()
        win_w, win_h = 210, 110
        root.geometry(f"{win_w}x{win_h}+{screen_w - win_w - 20}+{screen_h - win_h - 60}")

        def update_ui():
            try:
                m = collect_metrics()
                lbl_cpu.config(text=f"CPU: {m.get('cpu_percent', 0)}% | {m.get('cpu_temp', 'Н/Д')}")
                lbl_gpu.config(text=f"GPU: {m.get('gpu_percent', 0)}% | {m.get('gpu_temp', 'Н/Д')}")
                lbl_ram.config(text=f"RAM: {m.get('ram_percent', 0)}%")
            except Exception:
                pass
            root.after(2000, update_ui)

        update_ui()
        root.mainloop()
    except Exception as e:
        log_message(f"Ошибка оверлея: {e}")


def toggle_overlay():
    global overlay_root_ref
    if overlay_root_ref is not None:
        try:
            overlay_root_ref.destroy()
        except:
            pass
        overlay_root_ref = None
    else:
        threading.Thread(target=start_overlay, daemon=True).start()


def handle_server_command(cmd, server_ip):
    global console_allocated, overlay_root_ref
    if platform.system() != "Windows":
        return
    if cmd == "SHOW" and not console_allocated:
        try:
            ctypes.windll.kernel32.AllocConsole()
            sys.stdout = open("CONOUT$", "w", encoding="utf-8", buffering=1)
            sys.stderr = open("CONOUT$", "w", encoding="utf-8", buffering=1)
            console_allocated = True
        except Exception as e:
            log_message(f"Ошибка SHOW: {e}")
    elif cmd == "HIDE" and console_allocated:
        try:
            ctypes.windll.kernel32.FreeConsole()
            console_allocated = False
        except Exception as e:
            log_message(f"Ошибка HIDE: {e}")
    elif cmd == "START_SHELL":
        threading.Thread(target=remote_shell_client, args=(server_ip,), daemon=True).start()
    elif cmd == "START_RDP":
        threading.Thread(target=remote_desktop_client, args=(server_ip,), daemon=True).start()
    elif cmd == "CLEAR_TEMP":
        threading.Thread(target=clear_temp_files, daemon=True).start()
    elif cmd.startswith("KILL_PID:"):
        pid = int(cmd.split(":")[1])
        try:
            psutil.Process(pid).terminate()
            log_message(f"Процесс {pid} завершен администратором.")
        except Exception as e:
            log_message(f"Ошибка при завершении процесса {pid}: {e}")
    elif cmd == "SHUTDOWN":
        log_message("Получена команда SHUTDOWN от сервера.")
        time.sleep(0.5)
        sys.exit(0)
    elif cmd == "START_OVERLAY":
        if overlay_root_ref is None:
            threading.Thread(target=start_overlay, daemon=True).start()
    elif cmd == "STOP_OVERLAY":
        if overlay_root_ref is not None:
            try:
                overlay_root_ref.destroy()
            except:
                pass
            overlay_root_ref = None


def setup_agent_firewall():
    if platform.system() == "Windows":
        try:
            subprocess.run('netsh advfirewall firewall delete rule name="SysAdmin_Agent_UDP"', shell=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            subprocess.run(
                f'netsh advfirewall firewall add rule name="SysAdmin_Agent_UDP" dir=in action=allow protocol=UDP localport={UDP_PORT}',
                shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception as e:
            log_message(f"Ошибка файрвола: {e}")


def discover_server_ip():
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        s.settimeout(1.5)
        for _ in range(2):
            try:
                s.sendto(b"DISCOVER_SYSADMIN_SERVER", ('255.255.255.255', UDP_PORT))
                data, addr = s.recvfrom(1024)
                if data == b"HERE_IS_SYSADMIN_SERVER":
                    return addr[0]
            except:
                pass
        return None


def init_libre_hardware_monitor():
    global lhm_computer
    if not HAS_PYTHONNET:
        return
    try:
        base_path = sys._MEIPASS if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))
        dll_path = os.path.join(base_path, "LibreHardwareMonitorLib.dll")
        if os.path.exists(dll_path):
            clr.AddReference(dll_path)
            from LibreHardwareMonitor.Hardware import Computer
            lhm_computer = Computer()
            lhm_computer.IsCpuEnabled = True
            lhm_computer.IsGpuEnabled = True
            lhm_computer.IsStorageEnabled = True
            lhm_computer.Open()
        else:
            log_message(f"DLL не найдена: {dll_path}")
    except Exception as e:
        log_message(f"Ошибка LHM: {e}")


def fetch_static_models():
    global CACHED_CPU_MODEL, CACHED_GPU_MODEL
    if platform.system() == "Windows":
        try:
            import winreg
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
            CACHED_CPU_MODEL = winreg.QueryValueEx(key, "ProcessorNameString")[0].strip()
        except:
            CACHED_CPU_MODEL = platform.processor()
    else:
        CACHED_CPU_MODEL = platform.processor()
    try:
        cmd = 'powershell "(Get-CimInstance Win32_VideoController).Name"'
        out = subprocess.check_output(cmd, shell=True, stderr=subprocess.DEVNULL).decode(errors='ignore').strip()
        if out:
            lines = [l.strip() for l in out.splitlines() if l.strip()]
            CACHED_GPU_MODEL = lines[0] if lines else "Неизвестно"
    except:
        CACHED_GPU_MODEL = "Н/Д"


def get_cpu_temperature():
    if not lhm_computer:
        return "Н/Д"
    try:
        from LibreHardwareMonitor.Hardware import SensorType
        cpu_package = None
        temps = []
        for hardware in lhm_computer.Hardware:
            hardware.Update()
            for sub in hardware.SubHardware:
                sub.Update()
            for sensor in hardware.Sensors:
                if sensor.SensorType != SensorType.Temperature or sensor.Value is None:
                    continue
                temp = float(sensor.Value)
                if not (20 <= temp <= 110):
                    continue
                if "package" in sensor.Name.lower():
                    cpu_package = temp
                temps.append(temp)
        if cpu_package:
            return f"{cpu_package:.1f}°C"
        if temps:
            return f"{max(temps):.1f}°C"
    except Exception as e:
        log_message(f"CPU TEMP ERROR: {e}")
        return "Н/Д"


def get_gpu_util_and_temp():
    gpu_util = 0.0
    gpu_temp = "Н/Д"
    if lhm_computer:
        try:
            from LibreHardwareMonitor.Hardware import HardwareType, SensorType
            for hardware in lhm_computer.Hardware:
                if hardware.HardwareType in [HardwareType.GpuNvidia, HardwareType.GpuAmd, HardwareType.GpuIntel]:
                    hardware.Update()
                    for sensor in hardware.Sensors:
                        if sensor.SensorType == SensorType.Load and sensor.Value is not None:
                            gpu_util = round(float(sensor.Value), 1)
                        elif sensor.SensorType == SensorType.Temperature and sensor.Value is not None:
                            gpu_temp = f"{round(float(sensor.Value), 1)}°C"
        except Exception as e:
            log_message(f"GPU error: {e}")
    return gpu_util, gpu_temp


def get_disk_metrics():
    disks_list = []
    try:
        for part in psutil.disk_partitions():
            if platform.system() == "Windows" and "cdrom" in part.opts:
                continue
            try:
                usage = psutil.disk_usage(part.mountpoint)
                clean_name = part.mountpoint.replace("\\", "/")
                disks_list.append({
                    "device": clean_name if clean_name else part.mountpoint,
                    "total": round(usage.total / (1024 ** 3), 1),
                    "free": round(usage.free / (1024 ** 3), 1),
                    "percent": usage.percent
                })
            except:
                pass
    except Exception as e:
        log_message(f"Disk metric collection error: {e}")
    return disks_list


def get_network_metrics():
    network_data = {}
    try:
        net_io = psutil.net_io_counters(pernic=True)
        for name, io in net_io.items():
            if any(x in name.lower() for x in ["virtualbox", "vbox", "vethernet", "vpn", "loopback"]):
                continue
            network_data[name] = {
                "sent": round(io.bytes_sent / (1024 * 1024), 1),
                "recv": round(io.bytes_recv / (1024 * 1024), 1)
            }
    except Exception as e:
        log_message(f"Network metric collection error: {e}")
    return network_data


def get_network_utilization_percentage():
    global PREV_NET_IO, PREV_NET_TIME
    try:
        current_io = psutil.net_io_counters()
        current_time = time.time()
        if PREV_NET_IO is None or PREV_NET_TIME is None:
            PREV_NET_IO = current_io
            PREV_NET_TIME = current_time
            return 0.0

        dt = current_time - PREV_NET_TIME
        if dt <= 0:
            return 0.0

        bytes_sent_diff = current_io.bytes_sent - PREV_NET_IO.bytes_sent
        bytes_recv_diff = current_io.bytes_recv - PREV_NET_IO.bytes_recv
        total_bytes_diff = bytes_sent_diff + bytes_recv_diff

        speed_mbps = 100
        try:
            stats = psutil.net_if_stats()
            io_per_nic = psutil.net_io_counters(pernic=True)
            for nic, stat in stats.items():
                if stat.isup and stat.speed > 0:
                    if nic in io_per_nic and io_per_nic[nic].bytes_recv > 0:
                        speed_mbps = stat.speed
                        break
        except:
            pass

        bits_per_sec = (total_bytes_diff / dt) * 8
        max_bits_per_sec = speed_mbps * 1000000
        util_percent = (bits_per_sec / max_bits_per_sec) * 100
        util_percent = max(0.0, min(100.0, round(util_percent, 2)))

        PREV_NET_IO = current_io
        PREV_NET_TIME = current_time
        return util_percent
    except:
        return 0.0


def collect_metrics():
    gpu_util, gpu_temp = get_gpu_util_and_temp()
    ram = psutil.virtual_memory()
   
    utils =  {
        "hostname": platform.node(),
        "cpu_model": CACHED_CPU_MODEL,
        "gpu_model": CACHED_GPU_MODEL,
        "cpu_temp": get_cpu_temperature(),
        "cpu_percent": psutil.cpu_percent(interval=0.1),
        "ram_percent": ram.percent,
        "ram_total": round(ram.total / (1024 ** 3), 1),
        "gpu_percent": gpu_util,
        "gpu_temp": gpu_temp,
        "net_percent": get_network_utilization_percentage(),
        "disks": get_disk_metrics(),
        "network": get_network_metrics(),
        "processes": get_top_processes()
    }
    pprint(utils, indent=4, width=40)
    return utils


def send_data():
    server_ip = None
    while True:
        try:
            data = collect_metrics()
            save_metric_to_db(data)
            if not server_ip:
                server_ip = discover_server_ip()
            if server_ip:
                payload = json.dumps(data).encode('utf-8')
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.settimeout(3)
                    s.connect((server_ip, TCP_PORT))
                    s.sendall(payload)
                    server_response = s.recv(1024).decode('utf-8')
                    handle_server_command(server_response, server_ip)
        except:
            server_ip = None
        time.sleep(8)


def request_password_and_shutdown():
    try:
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        password = simpledialog.askstring("Авторизация", "Пароль для выключения:", show='*')
        root.destroy()
        if password == "admin":
            sys.exit(0)
    except:
        pass


def hotkey_listener():
    try:
        with keyboard.GlobalHotKeys({
            '<ctrl>+<alt>+x': request_password_and_shutdown,
            '<ctrl>+<alt>+o': toggle_overlay
        }) as h:
            h.join()
    except:
        pass


if __name__ == "__main__":
    if is_already_running():
        sys.exit(1)
    init_db()
    setup_agent_firewall()
    init_libre_hardware_monitor()
    fetch_static_models()
    threading.Thread(target=hotkey_listener, daemon=True).start()
    try:
        send_data()
    except KeyboardInterrupt:
        pass
    finally:
        if lhm_computer:
            try:
                lhm_computer.Close()
            except:
                pass
        sys.exit(0)