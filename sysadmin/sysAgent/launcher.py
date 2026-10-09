import subprocess
import time
import sys
import os


def start_monitoring_system():
    print("[ЛАУНЧЕР] Запуск системы мониторинга...")

    # Автоматически определяем путь к текущему интерпретатору Python (из venv)
    python_exe = sys.executable

    # Получаем точную папку, в которой лежит сам лаунчер
    base_dir = os.path.dirname(os.path.abspath(__file__))
    print(f"[ЛАУНЧЕР] Корневая папка проекта: {base_dir}")

    # 1. Запускаем Сервер с интерфейсом
    print("[ЛАУНЧЕР] Шаг 1: Запуск Сервера...")
    # Добавляем параметр cwd, чтобы сервер запускался строго в своей папке
    server_process = subprocess.Popen([python_exe, "server_gui.py"], cwd=base_dir)

    # Ждем 2 секунды, чтобы сервер успел подняться
    time.sleep(2)

    # ПРОВЕРКА: Не упал ли сервер сразу после запуска?
    if server_process.poll() is not None:
        print("\n" + "!"*60)
        print("[КРИТИЧЕСКАЯ ОШИБКА] Сервер аварийно завершил работу сразу после старта!")
        print("[РЕШЕНИЕ] Запустите файл 'server_gui.py' напрямую в PyCharm (без лаунчера),")
        print("          чтобы увидеть красную ошибку (Traceback) в консоли.")
        print("!"*60 + "\n")
        return

    # 2. Запускаем Агента (сборщика метрик)
    print("[ЛАУНЧЕР] Шаг 2: Запуск Агента...")
    agent_process = subprocess.Popen([python_exe, "agent.py"], cwd=base_dir)

    print("[ЛАУНЧЕР] Все процессы успешно запущены! Для выхода закройте окно интерфейса.")

    try:
        # Держим лаунчер активным, пока работает сервер
        server_process.wait()
    except KeyboardInterrupt:
        print("\n[ЛАУНЧЕР] Принудительное завершение работы...")
    finally:
        # Если закрыли сервер — автоматически убиваем и агента, чтобы не висел в процессах
        if server_process.poll() is None:
            server_process.terminate()
        if agent_process.poll() is None:
            agent_process.terminate()
        print("[ЛАУНЧЕР] Работа завершена.")


if __name__ == "__main__":
    start_monitoring_system()