import httpx
import asyncio

async def test():
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                "http://localhost:8000/api/auth/register",
                json={"email": "test6@example.com", "password": "test123", "name": "Test User 6"}
            )
            print(f"Status: {response.status_code}")
            print(f"Response: {response.text}")
        except Exception as e:
            print(f"Error: {e}")

asyncio.run(test())
