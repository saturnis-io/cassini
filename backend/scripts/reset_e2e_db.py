"""Reset test-e2e.db by dropping all tables (for use when file is locked)."""
import sqlite3
import sys

db_path = sys.argv[1] if len(sys.argv) > 1 else 'test-e2e.db'
conn = sqlite3.connect(db_path)
conn.execute('PRAGMA foreign_keys=OFF')
tables = [r[0] for r in conn.execute(
    "SELECT name FROM sqlite_master WHERE type='table'"
).fetchall()]
for t in tables:
    conn.execute(f'DROP TABLE IF EXISTS [{t}]')
conn.commit()
conn.close()
print(f'Dropped {len(tables)} tables from {db_path}')
