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
from pynput import keyboard
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

console_allocated = False
lhm_computer = None

# Кеш для статических данных
CACHED_CPU_MODEL = "Н/Д"
CACHED_GPU_MODEL = "Н/Д"

# Глобальный хендл мьютекса (для предотвращения двойного запуска)
_mutex_handle = None


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
    """Проверяет, не запущен ли уже экземпляр агента (Windows). Возвращает True, если запущен."""
    if platform.system() != "Windows":
        # Для других ОС можно использовать файл блокировки, но здесь просто пропустим
        return False

    try:
        kernel32 = ctypes.windll.kernel32
        # Создаём именованный мьютекс (глобальный, чтобы работал между сессиями)
        mutex_name = "Global\\SysAdminAgent_Unique_Mutex"
        global _mutex_handle
        _mutex_handle = kernel32.CreateMutexW(None, False, mutex_name)
        if kernel32.GetLastError() == 183:  # ERROR_ALREADY_EXISTS
            log_message("Обнаружен запущенный экземпляр агента. Завершение.")
            return True
        return False
    except Exception as e:
        log_message(f"Ошибка при создании мьютекса: {e}")
        return False


def remote_shell_client(server_ip):
    """Обратный интерактивный шелл для удаленного терминала"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.connect((server_ip, SHELL_PORT))
            while True:
                cmd_bytes = s.recv(4096)
                if not cmd_bytes: break
                cmd_str = cmd_bytes.decode('utf-8', errors='ignore').strip()
                if cmd_str.lower() == 'exit': break

                try:
                    res = subprocess.run(cmd_str, shell=True, capture_output=True, timeout=15)
                    try:
                        out_str = res.stdout.decode('cp866') + res.stderr.decode('cp866')
                    except:
                        out_str = res.stdout.decode('utf-8', errors='ignore') + res.stderr.decode('utf-8', errors='ignore')
                except Exception as e:
                    out_str = f"Ошибка: {e}\n"

                if not out_str:
                    out_str = "Команда выполнена, вывод пуст.\n"
                s.sendall(out_str.encode('utf-8', errors='ignore'))
    except Exception as e:
        log_message(f"Удаленный сеанс терминала завершен: {e}")


def clear_temp_files():
    """Фоновая очистка системных папок TEMP"""
    temp_paths = [os.environ.get('TEMP'), os.environ.get('TMP'),
                  os.path.join(os.environ.get('SystemRoot', 'C:\\Windows'), 'Temp')]
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


def handle_server_command(cmd, server_ip):
    global console_allocated
    if platform.system() != "Windows": return

    if cmd == "SHOW" and not console_allocated:
        try:
            ctypes.windll.kernel32.AllocConsole()
            sys.stdout = open("CONOUT$", "w", encoding="utf-8", buffering=1)
            sys.stderr = open("CONOUT$", "w", encoding="utf-8", buffering=1)
            console_allocated = True
            log_message("Консоль показана")
        except Exception as e:
            log_message(f"Ошибка SHOW: {e}")
    elif cmd == "HIDE" and console_allocated:
        try:
            ctypes.windll.kernel32.FreeConsole()
            console_allocated = False
            log_message("Консоль скрыта")
        except Exception as e:
            log_message(f"Ошибка HIDE: {e}")
    elif cmd == "START_SHELL":
        log_message("Запуск удаленной оболочки")
        threading.Thread(target=remote_shell_client, args=(server_ip,), daemon=True).start()
    elif cmd == "CLEAR_TEMP":
        log_message("Запуск очистки TEMP")
        threading.Thread(target=clear_temp_files, daemon=True).start()
    elif cmd == "SHUTDOWN":
        log_message("Получена команда SHUTDOWN от сервера. Завершаем процесс.")
        time.sleep(0.5)
        sys.exit(0)  # Корректный выход, а не taskkill


def setup_agent_firewall():
    if platform.system() == "Windows":
        try:
            subprocess.run('netsh advfirewall firewall delete rule name="SysAdmin_Agent_UDP"', shell=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            subprocess.run(
                f'netsh advfirewall firewall add rule name="SysAdmin_Agent_UDP" dir=in action=allow protocol=UDP localport={UDP_PORT}',
                shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            log_message("Правило брандмауэра настроено")
        except Exception as e:
            log_message(f"Ошибка настройки брандмауэра: {e}")


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
        log_message("pythonnet не установлен, мониторинг железа ограничен")
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
            log_message("LibreHardwareMonitor инициализирован")
        else:
            log_message(f"DLL не найдена: {dll_path}")
    except Exception as e:
        log_message(f"Ошибка инициализации LHM: {e}")


def fetch_static_models():
    """Загружает тяжелые текстовые данные 1 раз при старте"""
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
    log_message(f"Модели считаны: CPU={CACHED_CPU_MODEL}, GPU={CACHED_GPU_MODEL}")


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
                name = sensor.Name.lower()
                if "package" in name:
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
            log_message(f"GPU util/temp error: {e}")
    return gpu_util, gpu_temp


def get_disk_metrics():
    partitions = []
    try:
        for part in psutil.disk_partitions():
            if platform.system() == "Windows" and "cdrom" in part.opts:
                continue
            try:
                usage = psutil.disk_usage(part.mountpoint)
                partitions.append({
                    "drive": part.mountpoint,
                    "total": round(usage.total / (1024 ** 3), 1),
                    "percent": usage.percent
                })
            except:
                pass
    except:
        pass

    physical = []
    if lhm_computer:
        try:
            from LibreHardwareMonitor.Hardware import HardwareType, SensorType
            for hardware in lhm_computer.Hardware:
                if hardware.HardwareType == HardwareType.Storage:
                    hardware.Update()
                    l_val, t_val = 0.0, "Н/Д"
                    for sensor in hardware.Sensors:
                        if sensor.SensorType == SensorType.Load and sensor.Value is not None:
                            l_val = round(float(sensor.Value), 1)
                        elif sensor.SensorType == SensorType.Temperature and sensor.Value is not None:
                            t_val = f"{round(float(sensor.Value), 1)}°C"
                    physical.append({"name": hardware.Name, "load": l_val, "temp": t_val})
        except Exception as e:
            log_message(f"Disk metrics error: {e}")
    return {"partitions": partitions, "physical": physical}


def collect_metrics():
    interfaces_data = {}
    for name, addresses in psutil.net_if_addrs().items():
        if any(x in name.lower() for x in ["virtualbox", "vbox", "vethernet", "vpn"]):
            continue
        ips, mac = [], "Не определен"
        for addr in addresses:
            if addr.family == socket.AF_INET and not addr.address.startswith("169.254"):
                ips.append(addr.address)
            elif addr.family == psutil.AF_LINK:
                mac = addr.address
        if ips or mac != "Не определен":
            interfaces_data[name] = {"ips": ips, "mac": mac}

    gpu_util, gpu_temp = get_gpu_util_and_temp()
    ram = psutil.virtual_memory()

    return {
        "hostname": platform.node(),
        "cpu_model": CACHED_CPU_MODEL,
        "gpu_model": CACHED_GPU_MODEL,
        "cpu_temp": get_cpu_temperature(),
        "cpu_percent": psutil.cpu_percent(interval=0.1),
        "ram_percent": ram.percent,
        "ram_total": round(ram.total / (1024 ** 3), 1),
        "gpu_percent": gpu_util,
        "gpu_temp": gpu_temp,
        "disks": get_disk_metrics(),
        "net_interfaces": interfaces_data
    }


def send_data():
    server_ip = None
    while True:
        if not server_ip:
            server_ip = discover_server_ip()
            if not server_ip:
                time.sleep(10)
                continue
        try:
            data = collect_metrics()
            payload = json.dumps(data).encode('utf-8')
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(3)
                s.connect((server_ip, TCP_PORT))
                s.sendall(payload)
                server_response = s.recv(1024).decode('utf-8')
                handle_server_command(server_response, server_ip)
        except Exception as e:
            log_message(f"Ошибка связи с сервером {server_ip}: {e}")
            server_ip = None
        time.sleep(1)


def request_password_and_shutdown():
    try:
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        password = simpledialog.askstring("Авторизация", "Пароль для выключения:", show='*')
        root.destroy()
        if password == "admin":
            log_message("Горячая клавиша: завершение агента по паролю")
            sys.exit(0)
    except Exception as e:
        log_message(f"Ошибка в окне пароля: {e}")


def hotkey_listener():
    try:
        with keyboard.GlobalHotKeys({'<ctrl>+<alt>+x': request_password_and_shutdown}) as h:
            h.join()
    except Exception as e:
        log_message(f"Ошибка в прослушивателе горячих клавиш: {e}")


if __name__ == "__main__":
    # Защита от двойного запуска
    if is_already_running():
        log_message("Агент уже запущен. Выход.")
        sys.exit(1)

    log_message("=== Агент запущен ===")
    setup_agent_firewall()
    init_libre_hardware_monitor()
    fetch_static_models()

    # Запуск прослушивателя горячих клавиш в фоне
    threading.Thread(target=hotkey_listener, daemon=True).start()

    try:
        send_data()
    except KeyboardInterrupt:
        log_message("Агент остановлен пользователем")
    except Exception as e:
        log_message(f"Критическая ошибка: {e}")
    finally:
        if lhm_computer:
            try:
                lhm_computer.Close()
            except:
                pass
        log_message("=== Агент завершён ===")
        sys.exit(0)