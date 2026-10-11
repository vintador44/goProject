import platform

import psutil


def get_disk_metrics(log_message):
    disks_list = []
    try:
        for part in psutil.disk_partitions():
            if "cdrom" in part.opts:
                continue
            try:
                usage = psutil.disk_usage(part.mountpoint)
                clean_name = part.mountpoint.replace("\\", "/")
                disks_list.append(
                    {
                        "device": clean_name if clean_name else part.mountpoint,
                        "total": round(usage.total / (1024 ** 3), 1),
                        "free": round(usage.free / (1024 ** 3), 1),
                        "percent": usage.percent,
                    }
                )
            except Exception:
                pass
    except Exception as e:
        log_message(f"Disk metric collection error: {e}")
    return disks_list