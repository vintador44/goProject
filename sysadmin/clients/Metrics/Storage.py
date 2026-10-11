import json
import os
import sqlite3
import sys
import time


def _database_path():
    if getattr(sys, "frozen", False):
        base_path = os.path.dirname(sys.executable)
    else:
        base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base_path, "agent_history.db")


def init_db(log_message):
    try:
        conn = sqlite3.connect(_database_path())
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT,
                cpu_percent REAL,
                ram_percent REAL,
                gpu_percent REAL,
                raw_json TEXT
            )
            """
        )
        conn.commit()
        conn.close()
    except Exception as e:
        log_message(f"Ошибка инициализации БД: {e}")


def save_metric_to_db(metrics, log_message):
    try:
        conn = sqlite3.connect(_database_path())
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO metrics (timestamp, cpu_percent, ram_percent, gpu_percent, raw_json)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                time.strftime("%Y-%m-%d %H:%M:%S"),
                metrics["cpu_percent"],
                metrics["ram_percent"],
                metrics["gpu_percent"],
                json.dumps(metrics),
            ),
        )
        cursor.execute(
            "DELETE FROM metrics WHERE id NOT IN "
            "(SELECT id FROM metrics ORDER BY id DESC LIMIT 60)"
        )
        conn.commit()
        conn.close()
    except Exception as e:
        log_message(f"Ошибка сохранения метрики в БД: {e}")
