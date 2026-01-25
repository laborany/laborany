import asyncio
from src.core.database import init_db, DB_PATH
print(f'DB Path: {DB_PATH}')
asyncio.run(init_db())
print('DB initialized')
