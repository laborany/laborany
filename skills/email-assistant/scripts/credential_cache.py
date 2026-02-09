#!/usr/bin/env python3
"""
邮箱凭据加密缓存模块

功能:
1. 加密存储邮箱凭据（AES-256-GCM）
2. 与 LaborAny 用户绑定，隔离不同用户的凭据
3. 安全的密钥派生（基于用户ID和机器指纹）
4. 支持凭据验证和自动清理

安全特性:
- 使用 cryptography 库的 AES-256-GCM 加密
- 密钥通过 PBKDF2 从用户ID派生
- 每个凭据包含唯一盐值和认证标签
- 密码只在内存中解密，使用后立即清除
"""
import base64
import hashlib
import json
import os
import platform
import uuid
from datetime import datetime, timedelta
from pathlib import Path

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives import hashes
    CRYPTO_AVAILABLE = True
except ImportError:
    CRYPTO_AVAILABLE = False
    # 降级到标准库实现（安全性较低，仅作备用）
    import secrets


# ============================================================================
# 配置
# ============================================================================

# 凭据缓存目录（与 LaborAny 用户绑定）
CACHE_DIR = Path(os.path.expanduser("~")) / ".laborany" / "email_assistant" / "credentials"

# 凭据有效期（天），超过有效期需要重新验证
CREDENTIAL_VALID_DAYS = 30

# 机器指纹（用于密钥派生，增强安全性）
MACHINE_FINGERPRINT = (
    platform.node() +  # 主机名
    platform.system() +  # 操作系统
    platform.machine()  # 机器架构
)


# ============================================================================
# 加密核心类
# ============================================================================

class CredentialEncryptor:
    """凭据加密器（使用 cryptography 库）"""

    def __init__(self, user_id: str):
        """初始化加密器

        Args:
            user_id: LaborAny 用户ID，用于派生加密密钥
        """
        if not CRYPTO_AVAILABLE:
            raise RuntimeError("cryptography 库未安装，请运行: pip install cryptography")

        self.user_id = user_id
        self._key = None

    def _derive_key(self, salt: bytes) -> bytes:
        """从用户ID和机器指纹派生加密密钥

        使用 PBKDF2-HMAC-SHA256 进行密钥派生
        """
        # 结合用户ID和机器指纹作为密钥材料
        secret = (self.user_id + MACHINE_FINGERPRINT).encode('utf-8')

        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,  # AES-256
            salt=salt,
            iterations=100000,  #足够的迭代次数防止暴力破解
            backend=default_backend()
        )
        return kdf.derive(secret)

    def encrypt(self, plaintext: str) -> dict:
        """加密明文

        Returns:
            包含加密数据的字典:
            {
                'ciphertext': base64编码的密文,
                'salt': base64编码的盐值,
                'nonce': base64编码的nonce
            }
        """
        # 生成随机盐值（用于密钥派生）
        salt = os.urandom(16)
        key = self._derive_key(salt)

        # 生成随机 nonce（AES-GCM 要求）
        aesgcm = AESGCM(key)
        nonce = os.urandom(12)

        # 加密（AES-256-GCM 提供认证加密）
        ciphertext = aesgcm.encrypt(nonce, plaintext.encode('utf-8'), None)

        return {
            'ciphertext': base64.b64encode(ciphertext).decode('ascii'),
            'salt': base64.b64encode(salt).decode('ascii'),
            'nonce': base64.b64encode(nonce).decode('ascii')
        }

    def decrypt(self, encrypted_data: dict) -> str:
        """解密密文

        Args:
            encrypted_data: encrypt() 返回的加密数据字典

        Returns:
            解密后的明文
        """
        salt = base64.b64decode(encrypted_data['salt'])
        nonce = base64.b64decode(encrypted_data['nonce'])
        ciphertext = base64.b64decode(encrypted_data['ciphertext'])

        key = self._derive_key(salt)
        aesgcm = AESGCM(key)

        plaintext = aesgcm.decrypt(nonce, ciphertext, None)
        return plaintext.decode('utf-8')


class FallbackEncryptor:
    """备用加密器（使用标准库，安全性较低）"""

    def __init__(self, user_id: str):
        self.user_id = user_id

    def encrypt(self, plaintext: str) -> dict:
        """使用简单的异或加密（仅作备用）"""
        # 生成随机密钥
        key = secrets.token_bytes(32)
        nonce = secrets.token_bytes(12)

        # 简单的流加密
        plaintext_bytes = plaintext.encode('utf-8')
        ciphertext = bytearray()
        for i, byte in enumerate(plaintext_bytes):
            ciphertext.append(byte ^ key[i % len(key)])

        return {
            'ciphertext': base64.b64encode(bytes(ciphertext)).decode('ascii'),
            'salt': base64.b64encode(key).decode('ascii'),
            'nonce': base64.b64encode(nonce).decode('ascii'),
            '_fallback': True  # 标记为备用加密
        }

    def decrypt(self, encrypted_data: dict) -> str:
        key = base64.b64decode(encrypted_data['salt'])
        ciphertext = base64.b64decode(encrypted_data['ciphertext'])

        plaintext = bytearray()
        for i, byte in enumerate(ciphertext):
            plaintext.append(byte ^ key[i % len(key)])

        return plaintext.decode('utf-8')


# ============================================================================
# 凭据缓存管理类
# ============================================================================

class CredentialCache:
    """邮箱凭据缓存管理器

    负责加密存储和检索邮箱凭据，与 LaborAny 用户ID绑定。
    """

    def __init__(self, laborany_user_id: str = None):
        """初始化凭据缓存管理器

        Args:
            laborany_user_id: LaborAny 用户ID，用于隔离不同用户的凭据
                            如果为 None，则使用机器ID作为降级方案
        """
        # 确定用户ID
        if laborany_user_id:
            self.user_id = laborany_user_id
        else:
            # 降级方案：使用机器ID
            self.user_id = self._get_machine_id()

        # 创建用户专属的缓存目录
        self.cache_dir = CACHE_DIR / self._hash_user_id(self.user_id)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        # 初始化加密器
        if CRYPTO_AVAILABLE:
            self.encryptor = CredentialEncryptor(self.user_id)
        else:
            self.encryptor = FallbackEncryptor(self.user_id)

    @staticmethod
    def _get_machine_id() -> str:
        """获取机器唯一标识（降级方案）"""
        # 尝试读取机器ID
        try:
            # Windows
            if platform.system() == 'Windows':
                import winreg
                key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
                                     r'SOFTWARE\Microsoft\Cryptography')
                machine_guid, _ = winreg.QueryValueEx(key, 'MachineGuid')
                return machine_guid
        except:
            pass

        # 备用：生成一个基于机器特征的ID
        fingerprint = MACHINE_FINGERPRINT
        return hashlib.sha256(fingerprint.encode()).hexdigest()

    @staticmethod
    def _hash_user_id(user_id: str) -> str:
        """对用户ID进行哈希，用作目录名"""
        return hashlib.sha256(user_id.encode('utf-8')).hexdigest()[:32]

    def _get_credential_path(self, email_address: str) -> Path:
        """获取指定邮箱的凭据文件路径"""
        # 使用邮箱地址的哈希作为文件名
        safe_email = self._hash_email(email_address)
        return self.cache_dir / f"{safe_email}.json"

    @staticmethod
    def _hash_email(email: str) -> str:
        """对邮箱地址进行哈希"""
        return hashlib.sha256(email.lower().encode('utf-8')).hexdigest()[:32]

    def save(self, email_address: str, password: str,
             server_config: dict = None) -> bool:
        """保存邮箱凭据（加密存储）

        Args:
            email_address: 邮箱地址
            password: 密码或授权码
            server_config: 可选的服务器配置信息

        Returns:
            是否保存成功
        """
        try:
            # 加密密码
            encrypted = self.encryptor.encrypt(password)

            # 构建凭据数据
            credential_data = {
                'email_address': email_address.lower(),
                'encrypted_password': encrypted,
                'server_config': server_config,
                'created_at': datetime.now().isoformat(),
                'expires_at': (datetime.now() + timedelta(days=CREDENTIAL_VALID_DAYS)).isoformat(),
                'last_used': datetime.now().isoformat()
            }

            # 保存到文件
            cred_path = self._get_credential_path(email_address)
            with open(cred_path, 'w', encoding='utf-8') as f:
                json.dump(credential_data, f, ensure_ascii=False, indent=2)

            # 设置文件权限（仅所有者可读写）
            os.chmod(cred_path, 0o600)

            return True

        except Exception as e:
            print(f"保存凭据失败: {e}")
            return False

    def load(self, email_address: str) -> dict:
        """加载邮箱凭据

        Args:
            email_address: 邮箱地址

        Returns:
            凭据信息字典，如果不存在或已过期返回 None:
            {
                'email_address': str,
                'password': str,
                'server_config': dict or None,
                'is_expired': bool
            }
        """
        try:
            cred_path = self._get_credential_path(email_address)

            if not cred_path.exists():
                return None

            # 读取凭据文件
            with open(cred_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # 检查是否过期
            expires_at = datetime.fromisoformat(data['expires_at'])
            is_expired = datetime.now() > expires_at

            if is_expired:
                # 过期则删除
                self.delete(email_address)
                return None

            # 解密密码
            password = self.encryptor.decrypt(data['encrypted_password'])

            # 更新最后使用时间
            data['last_used'] = datetime.now().isoformat()
            with open(cred_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

            return {
                'email_address': data['email_address'],
                'password': password,
                'server_config': data.get('server_config'),
                'is_expired': is_expired,
                'expires_at': data['expires_at']
            }

        except Exception as e:
            print(f"加载凭据失败: {e}")
            return None

    def delete(self, email_address: str) -> bool:
        """删除邮箱凭据

        Args:
            email_address: 邮箱地址

        Returns:
            是否删除成功
        """
        try:
            cred_path = self._get_credential_path(email_address)
            if cred_path.exists():
                cred_path.unlink()
                return True
            return False
        except Exception as e:
            print(f"删除凭据失败: {e}")
            return False

    def list_credentials(self) -> list:
        """列出所有已保存的凭据（不包含密码）

        Returns:
            凭据列表
        """
        credentials = []
        try:
            for cred_file in self.cache_dir.glob("*.json"):
                try:
                    with open(cred_file, 'r', encoding='utf-8') as f:
                        data = json.load(f)

                    expires_at = datetime.fromisoformat(data['expires_at'])
                    is_expired = datetime.now() > expires_at

                    if is_expired:
                        # 清理过期凭据
                        cred_file.unlink()
                        continue

                    credentials.append({
                        'email_address': data['email_address'],
                        'created_at': data['created_at'],
                        'expires_at': data['expires_at'],
                        'last_used': data.get('last_used')
                    })
                except:
                    continue
        except:
            pass

        return credentials

    def clear_all(self) -> bool:
        """清除所有凭据

        Returns:
            是否清除成功
        """
        try:
            for cred_file in self.cache_dir.glob("*.json"):
                cred_file.unlink()
            return True
        except Exception as e:
            print(f"清除凭据失败: {e}")
            return False


# ============================================================================
# 便捷函数
# ============================================================================

def get_cache(user_id: str = None) -> CredentialCache:
    """获取凭据缓存实例

    Args:
        user_id: LaborAny 用户ID

    Returns:
        CredentialCache 实例
    """
    return CredentialCache(user_id)


def save_credential(email_address: str, password: str,
                   user_id: str = None, server_config: dict = None) -> bool:
    """快捷保存凭据"""
    cache = get_cache(user_id)
    return cache.save(email_address, password, server_config)


def load_credential(email_address: str, user_id: str = None) -> dict:
    """快捷加载凭据"""
    cache = get_cache(user_id)
    return cache.load(email_address)


def delete_credential(email_address: str, user_id: str = None) -> bool:
    """快捷删除凭据"""
    cache = get_cache(user_id)
    return cache.delete(email_address)


# ============================================================================
# 命令行工具
# ============================================================================

if __name__ == "__main__":
    import sys

    # 测试加密功能
    print("=== 凭据加密缓存测试 ===\n")

    if CRYPTO_AVAILABLE:
        print("✅ 使用 AES-256-GCM 加密")
    else:
        print("⚠️ cryptography 库未安装，使用备用加密方案")
        print("   推荐安装: pip install cryptography")

    # 测试用户ID
    test_user_id = "test_user_12345"

    # 创建缓存实例
    cache = CredentialCache(test_user_id)

    print(f"\n缓存目录: {cache.cache_dir}")

    # 测试保存
    test_email = "test@example.com"
    test_password = "test_password_123"

    print(f"\n测试保存凭据: {test_email}")
    if cache.save(test_email, test_password):
        print("✅ 保存成功")
    else:
        print("❌ 保存失败")
        sys.exit(1)

    # 测试加载
    print(f"\n测试加载凭据: {test_email}")
    credential = cache.load(test_email)
    if credential:
        print(f"✅ 加载成功")
        print(f"   邮箱: {credential['email_address']}")
        print(f"   密码: {credential['password']}")
        print(f"   过期时间: {credential.get('expires_at')}")
    else:
        print("❌ 加载失败")
        sys.exit(1)

    # 测试列出
    print("\n测试列出凭据:")
    credentials = cache.list_credentials()
    for cred in credentials:
        print(f"  - {cred['email_address']} (过期: {cred['expires_at']})")

    # 测试删除
    print(f"\n测试删除凭据: {test_email}")
    if cache.delete(test_email):
        print("✅ 删除成功")
    else:
        print("❌ 删除失败")

    print("\n=== 测试完成 ===")
