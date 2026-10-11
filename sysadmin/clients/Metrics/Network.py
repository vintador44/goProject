import time

import psutil

_prev_net_io = None
_prev_net_time = None


def get_network_metrics(log_message):
    network_data = {}
    try:
        net_io = psutil.net_io_counters(pernic=True)
        ignored_adapters = ["virtualbox", "vbox", "vethernet", "vpn", "loopback"]
        for name, io in net_io.items():
            if any(adapter in name.lower() for adapter in ignored_adapters):
                continue
            network_data[name] = {
                "sent": round(io.bytes_sent / (1024 * 1024), 1),
                "recv": round(io.bytes_recv / (1024 * 1024), 1),
            }
    except Exception as e:
        log_message(f"Network metric collection error: {e}")
    return network_data


def get_network_utilization_percentage():
    global _prev_net_io, _prev_net_time
    try:
        current_io = psutil.net_io_counters()
        current_time = time.time()
        if _prev_net_io is None or _prev_net_time is None:
            _prev_net_io = current_io
            _prev_net_time = current_time
            return 0.0

        dt = current_time - _prev_net_time
        if dt <= 0:
            return 0.0

        bytes_sent_diff = current_io.bytes_sent - _prev_net_io.bytes_sent
        bytes_recv_diff = current_io.bytes_recv - _prev_net_io.bytes_recv
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
        except Exception:
            pass

        bits_per_sec = (total_bytes_diff / dt) * 8
        max_bits_per_sec = speed_mbps * 1000000
        util_percent = (bits_per_sec / max_bits_per_sec) * 100
        util_percent = max(0.0, min(100.0, round(util_percent, 2)))

        _prev_net_io = current_io
        _prev_net_time = current_time
        return util_percent
    except Exception:
        return 0.0