import platform
from pprint import pprint
import cpuinfo
import psutil

from .CPU import get_cpu_temperature_windows, get_cpu_temperature_linux
from .Disks import get_disk_metrics
from .GPU import get_gpu_util_and_temp_windows, get_gpu_util_and_temp_linux
from .Network import get_network_metrics, get_network_utilization_percentage
from .Processes import get_top_processes


def collect_metrics(cpu_model, gpu_model, lhm_computer, log_message):
    gpu_util, gpu_temp, gpu_name = get_gpu_util_and_temp_windows(lhm_computer, log_message) if platform.system() == "Windows" else get_gpu_util_and_temp_linux(log_message)
    ram = psutil.virtual_memory()
    freq = psutil.cpu_freq()

    metrics = {
        "hostname": platform.node(),
        "cpu_model": cpuinfo.get_cpu_info().get("brand_raw", cpu_model),
        "gpu_model": gpu_name,
        "cpu_temp": get_cpu_temperature_windows(lhm_computer, log_message) if platform.system() == "Windows" else get_cpu_temperature_linux(log_message),
        "cpu_percent":  psutil.cpu_percent(interval=0.1),
        "cpu_freq": freq.current if freq else 0,
        "ram_percent": ram.percent,
        "ram_total": round(ram.total / (1024 ** 3), 1),
        "gpu_percent": gpu_util,
        "gpu_temp": gpu_temp,
        "net_percent": get_network_utilization_percentage(),
        "disks": get_disk_metrics(log_message),
        "network": get_network_metrics(log_message),
        "processes": get_top_processes(),
    }
    pprint("Collected Metrics:")
    pprint(metrics)
    
    return metrics
