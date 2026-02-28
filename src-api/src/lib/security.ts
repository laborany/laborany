/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         安全模块 - JWT 认证                              ║
 * ║                                                                          ║
 * ║  职责：密码哈希、JWT 生成与验证、用户认证                                  ║
 * ║  技术：jose (JWT) + bcryptjs (密码哈希)                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import * as jose from 'jose'
import bcrypt from 'bcryptjs'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           配置常量                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const ALGORITHM = 'HS256'
const TOKEN_EXPIRE_DAYS = 7

const textEncoder = new TextEncoder()

function getSecretKey(): Uint8Array {
  const raw = process.env.LABORANY_SECRET_KEY || 'laborany-secret-key-change-in-production'
  return textEncoder.encode(raw)
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           密码处理                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10)
}

export function verifyPassword(plain: string, hashed: string): boolean {
  return bcrypt.compareSync(plain, hashed)
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           JWT 处理                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export async function createAccessToken(userId: string): Promise<string> {
  const jwt = await new jose.SignJWT({ sub: userId })
    .setProtectedHeader({ alg: ALGORITHM })
    .setExpirationTime(`${TOKEN_EXPIRE_DAYS}d`)
    .setIssuedAt()
    .sign(getSecretKey())
  return jwt
}

export async function decodeToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jose.jwtVerify(token, getSecretKey(), {
      algorithms: [ALGORITHM],
    })
    return (payload.sub as string) || null
  } catch {
    return null
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           认证中间件辅助                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export async function extractUserIdFromHeader(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }
  const token = authHeader.slice(7)
  return decodeToken(token)
}
