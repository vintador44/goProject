import psutil


def get_top_processes():
    processes = []
    for proc in psutil.process_iter(["pid", "name", "cpu_percent", "memory_info"]):
        try:
            pinfo = proc.info
            pinfo["memory_mb"] = round(pinfo["memory_info"].rss / (1024 * 1024), 1)
            processes.append(pinfo)
        except Exception:
            continue
    return sorted(
        processes,
        key=lambda process: process["cpu_percent"] if process["cpu_percent"] else 0,
        reverse=True,
    )[:10]
