import platform
import socket
import os
import subprocess, shutil
import base64
import re
import secrets


def _run(cmd, check=False):
    return subprocess.run(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=check,
    )

RULE_NAME = "SysAdmin_Agent_UDP"

def setup_agent_firewall(udp_port, log_message):
    system = platform.system()

    try:
        if system == "Windows":
            _run(["netsh", "advfirewall", "firewall", "delete", "rule", f"name={RULE_NAME}"])
            _run([
                "netsh", "advfirewall", "firewall", "add", "rule",
                f"name={RULE_NAME}", "dir=in", "action=allow",
                "protocol=UDP", f"localport={udp_port}",
            ], check=True)
            log_message(f"Windows: порт UDP {udp_port} открыт")

        elif system == "Linux":
            if os.geteuid() != 0:
                log_message("Linux: нужны права root для настройки файрвола")
                return
            port = str(udp_port)

            if shutil.which("ufw"):
                _run(["ufw", "allow", f"{port}/udp"], check=True)
                log_message(f"ufw: порт UDP {port} открыт")

            elif shutil.which("firewall-cmd"):
                _run(["firewall-cmd", "--permanent", f"--add-port={port}/udp"], check=True)
                _run(["firewall-cmd", "--reload"], check=True)
                log_message(f"firewalld: порт UDP {port} открыт")

            elif shutil.which("iptables"):
                rule = ["INPUT", "-p", "udp", "--dport", port, "-j", "ACCEPT"]
                # -C проверяет, что правила ещё нет, чтобы не плодить дубли
                if _run(["iptables", "-C", *rule]).returncode != 0:
                    _run(["iptables", "-I", *rule], check=True)
                log_message(f"iptables: порт UDP {port} открыт (до перезагрузки)")

            else:
                log_message("Файрвол не найден, порт, скорее всего, и так открыт")

    except Exception as e:
        log_message(f"Ошибка файрвола: {e}")

def discover_server_ip(udp_port):
    configured_server = os.environ.get("SYSADMIN_SERVER_IP", "").strip()
    if configured_server:
        return configured_server

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
    
def ps(cmd: str):
    result = subprocess.run(
        ["powershell", "-NoProfile", "-Command", cmd],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def enable_ssh_windows():
    ps(
        "$ErrorActionPreference = 'Stop'; "
        "if ((Get-WindowsCapability -Online -Name OpenSSH.Server*).State -ne 'Installed') { "
        "Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0 }; "
        "Set-Service -Name sshd -StartupType Automatic; "
        "Start-Service -Name sshd; "
        "if (-not (Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' "
        "-ErrorAction SilentlyContinue)) { "
        "New-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' "
        "-DisplayName 'OpenSSH Server (TCP 22)' -Enabled True "
        "-Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 "
        "-Profile Any -RemoteAddress LocalSubnet } else { "
        "Set-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -Enabled True "
        "-Profile Any -RemoteAddress LocalSubnet }"
    )


def sh(*cmd):
    subprocess.run(cmd, check=True)


def enable_ssh_linux():
    if not shutil.which("sshd"):
        installers = (
            ("apt-get", ["apt-get", "install", "-y", "openssh-server"]),
            ("dnf", ["dnf", "install", "-y", "openssh-server"]),
            ("pacman", ["pacman", "-S", "--noconfirm", "openssh"]),
            ("zypper", ["zypper", "--non-interactive", "install", "openssh"]),
            ("apk", ["apk", "add", "openssh"]),
        )
        for manager, command in installers:
            if shutil.which(manager):
                sh(*command)
                break
        else:
            raise RuntimeError("не найден поддерживаемый пакетный менеджер для OpenSSH")

    if shutil.which("ufw"):
        sh("ufw", "allow", "22/tcp")
    elif shutil.which("firewall-cmd"):
        sh("firewall-cmd", "--permanent", "--add-service=ssh")
        sh("firewall-cmd", "--reload")

    if shutil.which("systemctl"):
        try:
            sh("systemctl", "enable", "--now", "ssh")
        except subprocess.CalledProcessError:
            sh("systemctl", "enable", "--now", "sshd")
    elif shutil.which("rc-service"):
        if shutil.which("rc-update"):
            sh("rc-update", "add", "sshd", "default")
        sh("rc-service", "sshd", "start")
    elif shutil.which("service"):
        try:
            sh("service", "ssh", "start")
        except subprocess.CalledProcessError:
            sh("service", "sshd", "start")


def _validate_ssh_identity(username, public_key):
    if not re.fullmatch(r"[a-z_][a-z0-9_-]{0,31}", username):
        raise ValueError("недопустимое имя SSH-пользователя")
    parts = public_key.strip().split()
    if len(parts) < 2 or parts[0] != "ssh-ed25519" or "\n" in public_key or "\r" in public_key:
        raise ValueError("ожидался публичный ключ Ed25519")
    try:
        key_data = base64.b64decode(parts[1], validate=True)
    except ValueError as error:
        raise ValueError("публичный SSH-ключ имеет неверный формат") from error
    if not key_data:
        raise ValueError("публичный SSH-ключ пуст")
    return " ".join(parts[:3])


def _install_linux_authorized_key(username, public_key):
    import pwd

    try:
        account = pwd.getpwnam(username)
    except KeyError:
        password = secrets.token_urlsafe(48) + "aA1!"
        sh("useradd", "--create-home", "--shell", "/bin/bash", username)
        subprocess.run(
            ["chpasswd"],
            input=f"{username}:{password}\n",
            text=True,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        account = pwd.getpwnam(username)

    ssh_dir = os.path.join(account.pw_dir, ".ssh")
    os.makedirs(ssh_dir, mode=0o700, exist_ok=True)
    os.chown(ssh_dir, account.pw_uid, account.pw_gid)
    os.chmod(ssh_dir, 0o700)
    authorized_keys = os.path.join(ssh_dir, "authorized_keys")
    try:
        with open(authorized_keys, "r", encoding="utf-8") as key_file:
            existing_keys = key_file.read().splitlines()
    except FileNotFoundError:
        existing_keys = []
    if public_key not in existing_keys:
        descriptor = os.open(
            authorized_keys,
            os.O_WRONLY | os.O_CREAT | os.O_APPEND,
            0o600,
        )
        with os.fdopen(descriptor, "a", encoding="utf-8") as key_file:
            key_file.write(public_key + "\n")
    os.chown(authorized_keys, account.pw_uid, account.pw_gid)
    os.chmod(authorized_keys, 0o600)


def _install_windows_authorized_key(username, public_key):
    encoded_key = base64.b64encode(public_key.encode("utf-8")).decode("ascii")
    ps(
        "$ErrorActionPreference = 'Stop'; "
        f"$User = '{username}'; "
        f"$Key = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('{encoded_key}')); "
        "if (-not (Get-LocalUser -Name $User -ErrorAction SilentlyContinue)) { "
        "$rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider; "
        "$bytes = New-Object byte[] 48; $rng.GetBytes($bytes); $rng.Dispose(); "
        "$password = [Convert]::ToBase64String($bytes) + 'aA1!'; "
        "$securePassword = ConvertTo-SecureString $password -AsPlainText -Force; "
        "New-LocalUser -Name $User -Password $securePassword "
        "-PasswordNeverExpires -UserMayNotChangePassword | Out-Null }; "
        "$sshDir = Join-Path $env:SystemDrive ('Users\\' + $User + '\\.ssh'); "
        "New-Item -ItemType Directory -Path $sshDir -Force | Out-Null; "
        "$authorizedKeys = Join-Path $sshDir 'authorized_keys'; "
        "if (-not (Test-Path $authorizedKeys) -or "
        "-not (Select-String -Path $authorizedKeys -SimpleMatch $Key -Quiet)) { "
        "Add-Content -Path $authorizedKeys -Value $Key -Encoding ascii }; "
        "icacls $sshDir /setowner $User | Out-Null; "
        "if ($LASTEXITCODE -ne 0) { throw 'Не удалось настроить владельца .ssh' }; "
        "icacls $sshDir /inheritance:r /grant:r "
        "\"${User}:(OI)(CI)F\" 'SYSTEM:(OI)(CI)F' | Out-Null; "
        "if ($LASTEXITCODE -ne 0) { throw 'Не удалось настроить права .ssh' }; "
        "icacls $authorizedKeys /setowner $User | Out-Null; "
        "if ($LASTEXITCODE -ne 0) { throw 'Не удалось настроить владельца authorized_keys' }; "
        "icacls $authorizedKeys /inheritance:r /grant:r "
        "\"${User}:F\" 'SYSTEM:F' | Out-Null; "
        "if ($LASTEXITCODE -ne 0) { throw 'Не удалось настроить права authorized_keys' }"
    )


def configure_ssh(username, public_key):
    public_key = _validate_ssh_identity(username, public_key)
    system = platform.system()
    if system == "Linux":
        if os.geteuid() != 0:
            raise PermissionError("для настройки SSH на Linux запустите агент с sudo")
        _install_linux_authorized_key(username, public_key)
        enable_ssh_linux()
    elif system == "Windows":
        _install_windows_authorized_key(username, public_key)
        enable_ssh_windows()
    else:
        raise RuntimeError(f"SSH setup is not supported on {system}")
