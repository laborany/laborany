import asyncio
from src.core.database import get_db
from src.core.security import hash_password, create_access_token
from uuid import uuid4

async def test_register():
    async for db in get_db():
        try:
            email = "test2@example.com"
            # 检查邮箱是否已存在
            cursor = await db.execute("SELECT id FROM users WHERE email = ?", (email,))
            if await cursor.fetchone():
                print("邮箱已被注册")
                return

            # 创建用户
            user_id = str(uuid4())
            password_hash = hash_password("test123")
            print(f"User ID: {user_id}")
            print(f"Password hash: {password_hash[:20]}...")

            await db.execute(
                "INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)",
                (user_id, email, password_hash, "Test User"),
            )
            await db.commit()
            print("User created successfully")

            token = create_access_token(user_id)
            print(f"Token: {token[:50]}...")
        except Exception as e:
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()

asyncio.run(test_register())
