import platform


def get_cpu_model():
    if platform.system() == "Windows":
        try:
            import winreg

            key = winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE,
                r"HARDWARE\DESCRIPTION\System\CentralProcessor\0",
            )
            return winreg.QueryValueEx(key, "ProcessorNameString")[0].strip()
        except Exception:
            return platform.processor()
    return platform.processor()


def get_cpu_temperature_windows(lhm_computer, log_message):
    
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
    
def get_cpu_temperature_linux( log_message):
    try:
        import psutil

        temps = psutil.sensors_temperatures()
        if not temps:
            return "Н/Д"

        candidates = []
        for name, entries in temps.items():
            driver = name.lower().strip()
            for entry in entries:
                temperature = entry.current
                if temperature < -50 or temperature > 250:
                    continue
                priority = _cpu_temp_priority(driver, entry.label)
                if priority:
                    candidates.append((priority, temperature))

        if candidates:
            _, temperature = max(candidates, key=lambda candidate: (candidate[0], candidate[1]))
            return f"{temperature:.1f}°C"
    except Exception as e:
        log_message(f"CPU TEMP ERROR: {e}")
    return "Н/Д"


def _cpu_temp_priority(driver, label):
    driver = driver.lower()
    label = (label or "").lower().strip()

    if driver == "coretemp":
        if label.startswith("package id"):
            return 100
        if label.startswith("core "):
            return 90
        if not label:
            return 80

    elif driver in ("k10temp", "zenpower"):
        if label == "tdie":
            return 100
        if label == "tctl":
            return 90
        if not label and driver == "k10temp":
            return 70

    elif driver == "peci_cputemp":
        if not label or label == "die":
            return 95

    if "cpu" in driver or "cputemp" in driver:
        if (
            not label
            or "cpu" in label
            or "package" in label
            or "tdie" in label
            or label == "die"
        ):
            return 60

    return 0