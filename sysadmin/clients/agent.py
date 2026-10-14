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
try:
    from pynput import keyboard
    from pynput.mouse import Button, Controller as MouseController
except Exception:
    keyboard = None
    Button = None
    MouseController = None
import tkinter as tk
from tkinter import simpledialog

import Metrics

TCP_PORT = 65432
UDP_PORT = 65433
SHELL_PORT = 65434
RDP_PORT = 65435

console_allocated = False
ssh_setup_result = None
ssh_setup_result_lock = threading.Lock()
lhm_computer = None
CACHED_CPU_MODEL = "Н/Д"
CACHED_GPU_MODEL = "Н/Д"
_mutex_handle = None
overlay_root_ref = None


def log_message(message):
    try:
        base_path = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.dirname(
            os.path.abspath(__file__))
        log_path = os.path.join(base_path, "agent_log.txt")
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%H:%M:%S')}] {message}\n")
    except:
        pass


def _apply_remote_key_event(event, controller):
    if keyboard is None:
        raise RuntimeError("pynput.keyboard недоступен")
    key_name = str(event.get("key", "")).lower()
    key_aliases = {
        "esc": "esc", "ctrl": "ctrl", "rightctrl": "ctrl_r",
        "shift": "shift", "rightshift": "shift_r",
        "alt": "alt", "rightalt": "alt_r",
        "super": "cmd", "rightsuper": "cmd_r",
        "pageup": "page_up", "pagedown": "page_down",
        "capslock": "caps_lock",
    }
    key_attr = key_aliases.get(key_name, key_name)
    key = getattr(keyboard.Key, key_attr, None)
    if key is None:
        printable_aliases = {
            "minus": "-", "equal": "=", "leftbracket": "[", "rightbracket": "]",
            "backslash": "\\", "semicolon": ";", "apostrophe": "'", "grave": "`",
            "comma": ",", "period": ".", "slash": "/",
        }
        if key_name in printable_aliases:
            key = keyboard.KeyCode.from_char(printable_aliases[key_name])
        elif key_name.startswith("f") and key_name[1:].isdigit():
            key = getattr(keyboard.Key, key_name, None)
        elif len(key_name) == 1:
            key = keyboard.KeyCode.from_char(key_name)
    if key is None:
        raise ValueError(f"неизвестная клавиша {key_name!r}")
    if event.get("type") == "key_down":
        controller.press(key)
    elif event.get("type") == "key_up":
        controller.release(key)
    else:
        raise ValueError("неизвестное клавиатурное событие")


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


def _remote_desktop_client_windows(server_ip):
    import io

    try:
        from PIL import ImageGrab
    except ImportError:
        log_message("Ошибка RDP: Pillow не установлена.")
        return

    if MouseController is None or Button is None:
        log_message("Ошибка RDP: pynput недоступен.")
        return

    mouse = MouseController()
    keyboard_controller = keyboard.Controller() if keyboard is not None else None

    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass

    rdp_active_event = threading.Event()
    threading.Thread(
        target=show_user_notification,
        args=(
            "⚠️ ДИСТАНЦИОННОЕ УПРАВЛЕНИЕ: Администратор видит ваш экран",
            rdp_active_event,
        ),
        daemon=True,
    ).start()

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
                            line = line_bytes.decode("utf-8", errors="ignore").strip()

                            if line.startswith("{"):
                                event = json.loads(line)
                                if event.get("type") in ("key_down", "key_up") and keyboard_controller:
                                    _apply_remote_key_event(event, keyboard_controller)
                                continue

                            if ":" in line:
                                btn_type, coords = line.split(":", 1)
                                pct_x, pct_y = map(float, coords.split(","))
                                screen_w = ctypes.windll.user32.GetSystemMetrics(0)
                                screen_h = ctypes.windll.user32.GetSystemMetrics(1)
                                mouse.position = (
                                    int(pct_x * screen_w),
                                    int(pct_y * screen_h),
                                )

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
                        screenshot.save(img_byte_arr, format="JPEG", quality=50)
                        img_bytes = img_byte_arr.getvalue()

                        s.setblocking(True)
                        s.sendall(len(img_bytes).to_bytes(4, "big") + img_bytes)
                        s.setblocking(False)
                        last_shot_time = now
                    except Exception as e:
                        log_message(f"RDP Send Error: {e}")
                        break

                time.sleep(0.03)

    except Exception as e:
        log_message(f"Ошибка Windows RDP: {e}")
    finally:
        rdp_active_event.set()
        log_message("Сессия удаленного рабочего стола завершена")


def check_wayland_dependencies():
    errors = []

    if not os.environ.get("WAYLAND_DISPLAY"):
        errors.append("Не задан WAYLAND_DISPLAY")

    Gst = None
    try:
        import gi
        gi.require_version("Gst", "1.0")

        if not hasattr(gi, "repository"):
            raise ImportError("PyGObject is not installed")

        Gst = gi.repository.Gst  # type: ignore[attr-defined]
        Gst.init(None)

        if Gst.ElementFactory.find("pipewiresrc") is None:
            errors.append("GStreamer: отсутствует плагин pipewiresrc")

        if Gst.ElementFactory.find("appsink") is None:
            errors.append("GStreamer: отсутствует элемент appsink")

    except Exception as e:
        errors.append(f"Ошибка Python/GStreamer: {e}")

    return errors


def remote_shell_client(server_ip):
    threading.Thread(target=show_user_notification,
                     args=("🔌 БЕЗОПАСНОСТЬ: Администратор открыл удаленный терминал (CMD)", None),
                     daemon=True).start()
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.connect((server_ip, SHELL_PORT))
            with s.makefile("rwb") as stream:
                handshake = {"hostname": platform.node()}
                stream.write((json.dumps(handshake) + "\n").encode("utf-8"))
                stream.flush()

                for line in stream:
                    request = json.loads(line.decode("utf-8"))
                    cmd_str = request.get("command", "")
                    try:
                        res = subprocess.run(
                            cmd_str,
                            shell=True,
                            capture_output=True,
                            timeout=15,
                        )
                        try:
                            out_str = res.stdout.decode("cp866") + res.stderr.decode("cp866")
                        except UnicodeDecodeError:
                            out_str = res.stdout.decode("utf-8", errors="replace") + res.stderr.decode(
                                "utf-8", errors="replace"
                            )
                    except Exception as e:
                        out_str = f"Ошибка: {e}\n"

                    if not out_str:
                        out_str = "Команда выполнена, вывод пуст.\n"
                    response = {"output": out_str}
                    stream.write((json.dumps(response) + "\n").encode("utf-8"))
                    stream.flush()
    except Exception as e:
        log_message(f"Удаленный сеанс терминала завершен: {e}")

def remote_desktop_client(server_ip):
    system = platform.system()

    if system == "Windows":
        _remote_desktop_client_windows(server_ip)
        return

    if system == "Linux":
        if os.environ.get("XDG_SESSION_TYPE", "").lower() != "wayland":
            if os.environ.get("DISPLAY"):
                _remote_desktop_client_x11(server_ip)
            else:
                log_message("RDP: Linux GUI session not found (DISPLAY/WAYLAND_DISPLAY is missing).")
            return

        errors = check_wayland_dependencies()
        if errors:
            log_message("Wayland RDP: " + "; ".join(errors))
            return

        try:
            from Metrics import RDPWayland

            RDPWayland.run_remote_desktop(
                server_ip=server_ip,
                port=RDP_PORT,
                log=log_message,
                notify=show_user_notification,
            )
        except Exception as e:
            log_message(f"Ошибка запуска Wayland RDP: {e}")
        return

    log_message(f"RDP не поддерживается на {system}")


def _remote_desktop_client_x11(server_ip):
    """Capture an X11 desktop and forward normalized mouse clicks."""
    import io

    try:
        from PIL import ImageGrab
    except ImportError:
        log_message("Ошибка RDP X11: Pillow не установлена.")
        return
    if MouseController is None or Button is None:
        log_message("Ошибка RDP X11: pynput недоступен.")
        return

    mouse = MouseController()
    active_event = threading.Event()
    threading.Thread(
        target=show_user_notification,
        args=("⚠️ ДИСТАНЦИОННОЕ УПРАВЛЕНИЕ: Администратор видит ваш экран", active_event),
        daemon=True,
    ).start()

    try:
        with socket.create_connection((server_ip, RDP_PORT), timeout=10) as sock:
            sock.setblocking(False)
            command_buffer = b""
            last_frame = 0.0
            keyboard_controller = keyboard.Controller() if keyboard is not None else None
            while True:
                try:
                    data = sock.recv(4096)
                    if not data:
                        break
                    command_buffer += data
                    while b"\n" in command_buffer:
                        raw, command_buffer = command_buffer.split(b"\n", 1)
                        try:
                            line = raw.decode("utf-8").strip()
                            if line.startswith("{"):
                                event = json.loads(line)
                                if event.get("type") in ("key_down", "key_up") and keyboard_controller:
                                    _apply_remote_key_event(event, keyboard_controller)
                                continue
                            button, coords = line.split(":", 1)
                            pct_x, pct_y = map(float, coords.split(",", 1))
                            screen = ImageGrab.grab()
                            width, height = screen.size
                            mouse.position = (int(pct_x * width), int(pct_y * height))
                            if button == "CLICK":
                                mouse.click(Button.left, 1)
                            elif button == "RCLICK":
                                mouse.click(Button.right, 1)
                        except (ValueError, UnicodeDecodeError):
                            log_message("RDP X11: некорректная команда мыши.")
                except BlockingIOError:
                    pass
                except OSError as exc:
                    log_message(f"RDP X11 Recv Error: {exc}")
                    break

                now = time.monotonic()
                if now - last_frame >= 0.10:
                    try:
                        screenshot = ImageGrab.grab()
                        image_buffer = io.BytesIO()
                        screenshot.save(image_buffer, format="JPEG", quality=50)
                        frame = image_buffer.getvalue()
                        sock.setblocking(True)
                        sock.sendall(len(frame).to_bytes(4, "big") + frame)
                        sock.setblocking(False)
                        last_frame = now
                    except Exception as exc:
                        log_message(f"RDP X11 Send Error: {exc}")
                        break
                time.sleep(0.03)
    except Exception as exc:
        log_message(f"Ошибка запуска RDP X11: {exc}")
    finally:
        active_event.set()
        log_message("Сессия удаленного рабочего стола X11 завершена")

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
    is_windows = platform.system() == "Windows"
    if cmd == "SHOW" and is_windows and not console_allocated:
        try:
            ctypes.windll.kernel32.AllocConsole()
            sys.stdout = open("CONOUT$", "w", encoding="utf-8", buffering=1)
            sys.stderr = open("CONOUT$", "w", encoding="utf-8", buffering=1)
            console_allocated = True
        except Exception as e:
            log_message(f"Ошибка SHOW: {e}")
    elif cmd == "HIDE" and is_windows and console_allocated:
        try:
            ctypes.windll.kernel32.FreeConsole()
            console_allocated = False
        except Exception as e:
            log_message(f"Ошибка HIDE: {e}")
    elif cmd == "START_SHELL":
        threading.Thread(target=remote_shell_client, args=(server_ip,), daemon=True).start()
    elif cmd == "START_RDP" and platform.system() in ("Windows", "Linux"):
        threading.Thread(
        target=remote_desktop_client,
        args=(server_ip,),
        daemon=True,
    ).start()
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
    elif cmd == "OPEN_SSH":
        log_message("Получена команда OPEN_SSH от сервера. Настраиваем SSH.")
        threading.Thread(target=open_ssh, daemon=True).start()
    elif cmd.startswith("CONFIGURE_SSH:"):
        try:
            request = json.loads(cmd[len("CONFIGURE_SSH:"):])
            if not request.get("request_id") or not request.get("username") or not request.get("public_key"):
                raise ValueError("неполная команда настройки SSH")
            threading.Thread(target=configure_ssh, args=(request,), daemon=True).start()
        except (json.JSONDecodeError, ValueError) as e:
            log_message(f"Некорректная команда настройки SSH: {e}")


def configure_ssh(request):
    global ssh_setup_result
    result = {
        "request_id": request["request_id"],
        "success": False,
        "error": "",
    }
    try:
        Metrics.configure_ssh(request["username"], request["public_key"])
        result["success"] = True
        log_message(f"SSH настроен для пользователя {request['username']}")
    except Exception as e:
        result["error"] = str(e)
        log_message(f"Не удалось настроить SSH: {e}")
    with ssh_setup_result_lock:
        ssh_setup_result = result


def setup_agent_firewall():
    Metrics.setup_agent_firewall(UDP_PORT, log_message)


def discover_server_ip():
    return Metrics.discover_server_ip(UDP_PORT)


def init_libre_hardware_monitor():
    global lhm_computer
    lhm_computer = Metrics.init_libre_hardware_monitor(log_message)


def fetch_static_models():
    global CACHED_CPU_MODEL, CACHED_GPU_MODEL
    CACHED_CPU_MODEL, CACHED_GPU_MODEL = Metrics.fetch_static_models()


def get_cpu_temperature():
    return Metrics.get_cpu_temperature(lhm_computer, log_message)


def get_gpu_util_and_temp():
    return Metrics.get_gpu_util_and_temp(lhm_computer, log_message)


def get_disk_metrics():
    return Metrics.get_disk_metrics(log_message)


def get_network_metrics():
    return Metrics.get_network_metrics(log_message)


def get_network_utilization_percentage():
    return Metrics.get_network_utilization_percentage()


def collect_metrics():
    return Metrics.collect_metrics(
        CACHED_CPU_MODEL, CACHED_GPU_MODEL, lhm_computer, log_message
    )


def init_db():
    Metrics.init_db(log_message)


def save_metric_to_db(metrics):
    Metrics.save_metric_to_db(metrics, log_message)


def get_top_processes():
    return Metrics.get_top_processes()


def send_data():
    global ssh_setup_result
    server_ip = None
    while True:
        try:
            data = collect_metrics()
            with ssh_setup_result_lock:
                setup_result = ssh_setup_result
            if setup_result is not None:
                data["ssh_setup_result"] = setup_result
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
                    if setup_result is not None:
                        with ssh_setup_result_lock:
                            if ssh_setup_result == setup_result:
                                ssh_setup_result = None
        except Exception as e:
            log_message(f"Ошибка связи с сервером: {e}")
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
    

    

def open_ssh():
    try:
        if platform.system() == "Windows":
            enable_ssh_windows()
        elif platform.system() == "Linux":
            enable_ssh_linux()
        else:
            raise RuntimeError(f"SSH setup is not supported on {platform.system()}")
        log_message("SSH запущен; входящий порт TCP 22 настроен")
    except Exception as e:
        log_message(f"Не удалось настроить SSH: {e}")

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
