
import json
import os
import socket
import struct
import threading
import time
import uuid


FPS = 15
JPEG_QUALITY = 55
MAX_COMMAND_SIZE = 64 * 1024

BUTTON_CODES = {
    "left": 0x110,
    "right": 0x111,
    "middle": 0x112,
}

# Linux evdev keycodes.
KEY_CODES = {
    "esc": 1, "escape": 1,
    "1": 2, "2": 3, "3": 4, "4": 5,
    "5": 6, "6": 7, "7": 8, "8": 9, "9": 10, "0": 11,
    "backspace": 14, "tab": 15,
    "q": 16, "w": 17, "e": 18, "r": 19, "t": 20,
    "y": 21, "u": 22, "i": 23, "o": 24, "p": 25,
    "enter": 28, "return": 28, "ctrl": 29, "control": 29,
    "a": 30, "s": 31, "d": 32, "f": 33, "g": 34,
    "h": 35, "j": 36, "k": 37, "l": 38,
    "shift": 42,
    "rightshift": 54, "capslock": 58,
    "minus": 12, "equal": 13,
    "leftbracket": 26, "rightbracket": 27, "backslash": 43,
    "semicolon": 39, "apostrophe": 40, "grave": 41,
    "comma": 51, "period": 52, "slash": 53,
    "z": 44, "x": 45, "c": 46, "v": 47, "b": 48,
    "n": 49, "m": 50, "alt": 56, "space": 57,
    "f1": 59, "f2": 60, "f3": 61, "f4": 62,
    "f5": 63, "f6": 64, "f7": 65, "f8": 66,
    "f9": 67, "f10": 68, "f11": 87, "f12": 88,
    "home": 102, "up": 103, "pageup": 104, "left": 105,
    "right": 106, "end": 107, "down": 108, "pagedown": 109,
    "insert": 110, "delete": 111,
    "rightctrl": 97, "rightalt": 100,
    "super": 125, "rightsuper": 126,
}
def _unwrap(value):
    try:
        from gi.repository import GLib
        if isinstance(value, GLib.Variant):
            return _unwrap(value.unpack())
    except Exception:
        pass

    if isinstance(value, dict):
        return {key: _unwrap(item) for key, item in value.items()}

    if isinstance(value, (tuple, list)):
        return type(value)(_unwrap(item) for item in value)

    return value

class PortalSession:
    BUS = "org.freedesktop.portal.Desktop"
    DESKTOP = "/org/freedesktop/portal/desktop"
    REQUEST = "org.freedesktop.portal.Request"
    SESSION = "org.freedesktop.portal.Session"
    RDP = "org.freedesktop.portal.RemoteDesktop"
    SCREENCAST = "org.freedesktop.portal.ScreenCast"

    def __init__(self, log):
        import gi
        gi.require_version("Gio", "2.0")
        gi.require_version("GLib", "2.0")
        from gi.repository import Gio, GLib

        self.Gio = Gio
        self.GLib = GLib
        self.log = log
        self.bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
        self.context = GLib.MainContext.default()
        self.responses = {}
        self.response_lock = threading.Lock()
        self.session_handle = None
        self.pipewire_fd = None
        self.stream_id = None
        self.width = None
        self.height = None

        self.subscription = self.bus.signal_subscribe(
            self.BUS, self.REQUEST, "Response", None, None,
            Gio.DBusSignalFlags.NONE, self._on_response,
        )

    def _on_response(self, _conn, _sender, path, _iface, _signal,
                     parameters, _data):
        try:
            code, results = parameters.unpack()
            with self.response_lock:
                self.responses[path] = (code, results)
        except Exception as exc:
            self.log(f"[RDP] Portal response error: {exc}")

    def _options(self, **values):
        return self.GLib.Variant(
            "a{sv}",
            {key: self.GLib.Variant(signature, value)
             for key, (signature, value) in values.items()},
        )

    def _call(self, interface, method, signature, values,
              timeout=30000):
        params = self.GLib.Variant(signature, values) if signature else None
        result = self.bus.call_sync(
            self.BUS, self.DESKTOP, interface, method, params, None,
            self.Gio.DBusCallFlags.NONE, timeout, None,
        )
        return result.unpack() if result else None

    def _request(self, interface, method, signature, values):
        returned = self._call(interface, method, signature, values)
        request_path = returned[0]
        deadline = time.monotonic() + 120

        while time.monotonic() < deadline:
            with self.response_lock:
                response = self.responses.pop(request_path, None)

            if response is not None:
                code, results = response
                if code == 1:
                    raise RuntimeError(f"{method}: запрос отменён пользователем")
                if code != 0:
                    raise RuntimeError(f"{method}: портал отказал, код {code}")
                return results

            while self.context.pending():
                self.context.iteration(False)
            time.sleep(0.01)

        raise TimeoutError(f"Таймаут ожидания ответа портала: {method}")

    def start(self):
        token = uuid.uuid4().hex[:16]

        result = self._request(
            self.RDP, "CreateSession", "(a{sv},)",
            (self._options(
                handle_token=("s", "rdp_req_" + token),
                session_handle_token=("s", "rdp_session_" + token),
            ),),
        )
        self.session_handle = result.get("session_handle")
        if not self.session_handle:
            raise RuntimeError("Портал не вернул session_handle")

        # 1 = keyboard, 2 = pointer.
        self._request(
            self.RDP, "SelectDevices", "(o,a{sv})",
            (self.session_handle, self._options(
                handle_token=("s", "rdp_devices_" + token),
                types=("u", 3),
            )),
        )

        # ScreenCast source type: 1 = monitor. Cursor: 2 = embedded.
        self._request(
            self.SCREENCAST, "SelectSources", "(o,a{sv})",
            (self.session_handle, self._options(
                handle_token=("s", "rdp_sources_" + token),
                types=("u", 1),
                multiple=("b", False),
                cursor_mode=("u", 2),
            )),
        )

        self._request(
            self.RDP, "Start", "(o,s,a{sv})",
            (self.session_handle, "", self._options(
                handle_token=("s", "rdp_start_" + token),
            )),
        )

        cast = self._request(
            self.SCREENCAST, "Start", "(o,s,a{sv})",
            (self.session_handle, "", self._options(
                handle_token=("s", "rdp_cast_" + token),
            )),
        )
        streams = cast.get("streams", [])
        if not streams:
            raise RuntimeError("Портал не вернул видеопоток")

        self.stream_id, properties = streams[0]
        self.stream_id = int(self.stream_id)

        # Stream properties are a{sv}; size is normally (width, height).
        size = properties.get("size")
        if size is not None:
            try:
                self.width, self.height = map(int, size.unpack())
            except Exception:
                try:
                    self.width, self.height = map(int, size)
                except Exception:
                    pass

        reply, fd_list = self.bus.call_with_unix_fd_list_sync(
            self.BUS, self.DESKTOP, self.SCREENCAST,
            "OpenPipeWireRemote",
            self.GLib.Variant("(o,a{sv})", (
                self.session_handle, self._options(),
            )),
            self.GLib.VariantType.new("(h)"),
            self.Gio.DBusCallFlags.NONE, 30000, None, None,
        )
        self.pipewire_fd = fd_list.get(reply.unpack()[0])
        os.set_inheritable(self.pipewire_fd, False)
        return self

    def notify(self, method, signature, args):
        return self._call(self.RDP, method, signature, args, timeout=5000)

    def close(self):
        if self.session_handle:
            try:
                self.bus.call_sync(
                    self.BUS, self.session_handle, self.SESSION, "Close",
                    None, None, self.Gio.DBusCallFlags.NONE, 3000, None,
                )
            except Exception as exc:
                self.log(f"[RDP] Ошибка закрытия портала: {exc}")

        if self.pipewire_fd is not None:
            try:
                os.close(self.pipewire_fd)
            except OSError:
                pass
            self.pipewire_fd = None

        if self.subscription:
            self.bus.signal_unsubscribe(self.subscription)
            self.subscription = 0


def _send_event(portal, event):
    kind = event.get("type")
    options = portal._options()

    if kind == "mouse_move":
        if not portal.width or not portal.height:
            raise ValueError("Неизвестно разрешение потока экрана")

        x = max(0.0, min(1.0, float(event["x"]))) * portal.width
        y = max(0.0, min(1.0, float(event["y"]))) * portal.height
        portal.notify(
            "NotifyPointerMotionAbsolute", "(o,a{sv},u,d,d)",
            (portal.session_handle, options, portal.stream_id, x, y),
        )

    elif kind in ("mouse_down", "mouse_up"):
        button = BUTTON_CODES.get(str(event.get("button", "left")).lower())
        if button is None:
            raise ValueError("Неизвестная кнопка мыши")
        state = 1 if kind == "mouse_down" else 0
        portal.notify(
            "NotifyPointerButton", "(o,a{sv},i,u)",
            (portal.session_handle, options, button, state),
        )

    elif kind in ("mouse_click", "mouse_double_click"):
        _send_event(portal, {
            "type": "mouse_move", "x": event["x"], "y": event["y"],
        })
        button = BUTTON_CODES.get(str(event.get("button", "left")).lower())
        if button is None:
            raise ValueError("Неизвестная кнопка мыши")
        for _ in range(2 if kind == "mouse_double_click" else 1):
            for state in (1, 0):
                portal.notify(
                    "NotifyPointerButton", "(o,a{sv},i,u)",
                    (portal.session_handle, options, button, state),
                )

    elif kind in ("key_down", "key_up"):
        if "keycode" in event:
            keycode = int(event["keycode"])
        else:
            key_name = str(event.get("key", "")).lower()
            if key_name not in KEY_CODES:
                raise ValueError(f"Неизвестная клавиша: {key_name}")
            keycode = KEY_CODES[key_name]

        if not 0 <= keycode <= 767:
            raise ValueError("Некорректный keycode")

        state = 1 if kind == "key_down" else 0
        portal.notify(
            "NotifyKeyboardKeycode", "(o,a{sv},i,u)",
            (portal.session_handle, options, keycode, state),
        )

    elif kind == "scroll":
        portal.notify(
            "NotifyPointerAxis", "(o,a{sv},d,d)",
            (portal.session_handle, options,
             float(event.get("dx", 0)), float(event.get("dy", 0))),
        )

    else:
        raise ValueError(f"Неизвестный тип события: {kind}")


def _receive_commands(sock, portal, stop_event, log):
    buffer = bytearray()

    while not stop_event.is_set():
        try:
            data = sock.recv(4096)
            if not data:
                stop_event.set()
                return
            buffer.extend(data)

            if len(buffer) > MAX_COMMAND_SIZE and b"\n" not in buffer:
                log("[RDP] Слишком длинная команда; закрываю соединение")
                stop_event.set()
                return

            while b"\n" in buffer:
                raw, _, rest = buffer.partition(b"\n")
                buffer = bytearray(rest)
                if not raw.strip():
                    continue

                try:
                    line = raw.decode("utf-8").strip()

                    # Temporary compatibility with the old server protocol.
                    if line.startswith(("CLICK:", "RCLICK:")):
                        command, coords = line.split(":", 1)
                        x, y = map(float, coords.split(",", 1))
                        _send_event(portal, {
                            "type": "mouse_click",
                            "button": "left" if command == "CLICK" else "right",
                            "x": x, "y": y,
                        })
                    else:
                        event = json.loads(line)
                        if not isinstance(event, dict):
                            raise ValueError("Ожидался JSON-объект")
                        _send_event(portal, event)
                except Exception as exc:
                    log(f"[RDP] Ошибка события ввода: {exc}")

        except socket.timeout:
            continue
        except OSError as exc:
            if not stop_event.is_set():
                log(f"[RDP] Ошибка приёма команд: {exc}")
            stop_event.set()
            return


def run_remote_desktop(server_ip, port, log, notify=None):
    if os.environ.get("XDG_SESSION_TYPE", "").lower() != "wayland":
        log("[RDP] Этот backend предназначен для Wayland")
        return

    portal = None
    pipeline = None
    sock = None
    stop_event = threading.Event()

    try:
        import gi
        gi.require_version("Gst", "1.0")
        from gi.repository import Gst

        Gst.init(None)

        portal = PortalSession(log).start()

        if notify:
            threading.Thread(
                target=notify,
                args=(
                    "ДИСТАНЦИОННОЕ УПРАВЛЕНИЕ АКТИВНО: экран передаётся администратору",
                    stop_event,
                ),
                daemon=True,
            ).start()

        pipeline_text = (
            f"pipewiresrc fd={portal.pipewire_fd} path={portal.stream_id} "
            "do-timestamp=true "
            "! queue leaky=downstream max-size-buffers=1 "
            "! videoconvert "
            f"! jpegenc quality={JPEG_QUALITY} "
            "! appsink name=rdp_sink sync=false max-buffers=1 drop=true"
        )
        pipeline = Gst.parse_launch(pipeline_text)
        sink = pipeline.get_by_name("rdp_sink")

        if pipeline.set_state(Gst.State.PLAYING) == Gst.StateChangeReturn.FAILURE:
            raise RuntimeError("Не удалось запустить PipeWire pipeline")

        sock = socket.create_connection((server_ip, port), timeout=10)
        sock.settimeout(1.0)

        threading.Thread(
            target=_receive_commands,
            args=(sock, portal, stop_event, log),
            daemon=True,
        ).start()

        log("[RDP] Wayland-поток запущен после подтверждения портала")
        frame_interval = 1.0 / FPS

        while not stop_event.is_set():
            started = time.monotonic()
            sample = sink.emit("try-pull-sample", 100_000_000)

            if sample is not None:
                caps = sample.get_caps()
                structure = caps.get_structure(0)

                if not portal.width:
                    portal.width = structure.get_value("width")
                if not portal.height:
                    portal.height = structure.get_value("height")

                buffer = sample.get_buffer()
                ok, mapped = buffer.map(Gst.MapFlags.READ)
                if ok:
                    try:
                        frame = bytes(mapped.data)
                    finally:
                        buffer.unmap(mapped)

                    if frame:
                        sock.sendall(struct.pack("!I", len(frame)))
                        sock.sendall(frame)

            remaining = frame_interval - (time.monotonic() - started)
            if remaining > 0:
                stop_event.wait(remaining)

    except Exception as exc:
        log(f"[RDP] Wayland backend: {type(exc).__name__}: {exc}")

    finally:
        stop_event.set()

        if pipeline is not None:
            try:
                pipeline.set_state(Gst.State.NULL)
            except Exception:
                pass

        if sock is not None:
            try:
                sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            try:
                sock.close()
            except OSError:
                pass

        if portal is not None:
            portal.close()

        log("[RDP] Wayland-сессия завершена")
