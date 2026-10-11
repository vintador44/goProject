import importlib
import os
import platform
import sys

from .CPU import get_cpu_model
from .GPU import get_gpu_model_linux, get_gpu_model_windows


def init_libre_hardware_monitor(log_message):
    try:
        clr = importlib.import_module("clr")
    except ImportError:
        return None
    try:
        base_path = (
            sys._MEIPASS
            if getattr(sys, "frozen", False)
            else os.path.dirname(os.path.abspath(__file__))
        )
        if not getattr(sys, "frozen", False):
            base_path = os.path.dirname(base_path)
        dll_path = os.path.join(base_path, "LibreHardwareMonitorLib.dll")
        if os.path.exists(dll_path):
            clr.AddReference(dll_path)
            from LibreHardwareMonitor.Hardware import Computer

            computer = Computer()
            computer.IsCpuEnabled = True
            computer.IsGpuEnabled = True
            computer.IsStorageEnabled = True
            computer.Open()
            return computer
        log_message(f"DLL не найдена: {dll_path}")
    except Exception as e:
        log_message(f"Ошибка LHM: {e}")
    return None


def fetch_static_models():
    get_gpu_model = (
        get_gpu_model_windows
        if platform.system() == "Windows"
        else get_gpu_model_linux
    )
    return get_cpu_model(), get_gpu_model()
