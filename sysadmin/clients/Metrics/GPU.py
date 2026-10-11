import subprocess

def get_gpu_model_windows():
    try:
        cmd = 'powershell "(Get-CimInstance Win32_VideoController).Name"'
        out = subprocess.check_output(
            cmd, shell=True, stderr=subprocess.DEVNULL
        ).decode(errors="ignore").strip()
        if out:
            lines = [line.strip() for line in out.splitlines() if line.strip()]
            return lines[0] if lines else "Неизвестно"
    except Exception:
        pass
    return "Н/Д"


def get_gpu_util_and_temp_windows(lhm_computer, log_message):
    gpu_util = 0.0
    gpu_temp = "Н/Д"
    gpu_name = get_gpu_model_windows()
    if lhm_computer:
        try:
            from LibreHardwareMonitor.Hardware import HardwareType, SensorType

            for hardware in lhm_computer.Hardware:
                if hardware.HardwareType in [
                    HardwareType.GpuNvidia,
                    HardwareType.GpuAmd,
                    HardwareType.GpuIntel,
                ]:
                    hardware.Update()
                    for sensor in hardware.Sensors:
                        if sensor.SensorType == SensorType.Load and sensor.Value is not None:
                            gpu_util = round(float(sensor.Value), 1)
                        elif (
                            sensor.SensorType == SensorType.Temperature
                            and sensor.Value is not None
                        ):
                            gpu_temp = f"{round(float(sensor.Value), 1)}°C"
        except Exception as e:
            log_message(f"GPU error: {e}")
    return gpu_util, gpu_temp, gpu_name

def get_gpu_util_and_temp_linux(log_message):
    gpu_util = 0.0
    gpu_temp = "Н/Д"
    gpu_name = get_gpu_model_linux()

    try:
        import pynvml

        nvml_initialized = False
        try:
            pynvml.nvmlInit()
            nvml_initialized = True
            if pynvml.nvmlDeviceGetCount() > 0:
                handle = pynvml.nvmlDeviceGetHandleByIndex(0)
                util = pynvml.nvmlDeviceGetUtilizationRates(handle)
                gpu_util = round(float(util.gpu), 1)
                temp = pynvml.nvmlDeviceGetTemperature(
                    handle, pynvml.NVML_TEMPERATURE_GPU
                )
                gpu_temp = f"{temp}°C"
                return gpu_util, gpu_temp, gpu_name
        except Exception as e:
            if "NVML Shared Library Not Found" not in str(e):
                log_message(f"NVIDIA GPU unavailable: {e}")
        finally:
            if nvml_initialized:
                pynvml.nvmlShutdown()
    except ImportError:
        pass

    try:
        import pyamdgpuinfo

        if pyamdgpuinfo.detect_gpus() > 0:
            amd_gpu = pyamdgpuinfo.get_gpu(0)
            try:
                gpu_util = round(float(amd_gpu.query_load()) * 100, 1)
            except Exception as e:
                log_message(f"AMD GPU load unavailable: {e}")
            try:
                gpu_temp = f"{float(amd_gpu.query_temperature()):.1f}°C"
            except Exception as e:
                log_message(f"AMD GPU temperature unavailable: {e}")
        elif gpu_name == "Н/Д":
            log_message("No supported NVIDIA or AMD GPU detected")
    except ImportError as e:
        log_message(f"AMD GPU metrics unavailable; pyamdgpuinfo not installed: {e}")
    except Exception as e:
        log_message(f"AMD GPU error: {e}")
    return gpu_util, gpu_temp, gpu_name

def get_gpu_model_linux():
    try:
        cmd = 'lspci | grep -i vga'
        out = subprocess.check_output(
            cmd, shell=True, stderr=subprocess.DEVNULL
        ).decode(errors="ignore").strip()
        if out:
            lines = [line.strip() for line in out.splitlines() if line.strip()]
            return lines[0] if lines else "Неизвестно"
    except Exception:
        pass
    return "Н/Д"