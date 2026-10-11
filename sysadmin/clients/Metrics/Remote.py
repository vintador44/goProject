import platform
import socket
import subprocess


def setup_agent_firewall(udp_port, log_message):
    if platform.system() == "Windows":
        try:
            subprocess.run(
                'netsh advfirewall firewall delete rule name="SysAdmin_Agent_UDP"',
                shell=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            subprocess.run(
                f'netsh advfirewall firewall add rule name="SysAdmin_Agent_UDP" '
                f"dir=in action=allow protocol=UDP localport={udp_port}",
                shell=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except Exception as e:
            log_message(f"Ошибка файрвола: {e}")


def discover_server_ip(udp_port):
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        s.settimeout(1.5)
        for _ in range(2):
            try:
                s.sendto(b"DISCOVER_SYSADMIN_SERVER", ("255.255.255.255", udp_port))
                data, addr = s.recvfrom(1024)
                if data == b"HERE_IS_SYSADMIN_SERVER":
                    return addr[0]
            except Exception:
                pass
        return None