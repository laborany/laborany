/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                         沙盒提供者注册表                                   ║
 * ║                                                                          ║
 * ║  职责：管理沙盒提供者的注册和获取                                          ║
 * ║  设计：简单的工厂模式，按优先级选择可用提供者                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import type { ISandboxProvider, SandboxProviderFactory } from './types.js'

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           注册表实现                                      │
 * └──────────────────────────────────────────────────────────────────────────┘ */

class SandboxRegistry {
  private factories = new Map<string, SandboxProviderFactory>()
  private instances = new Map<string, ISandboxProvider>()
  private priority: string[] = ['uv-python', 'native']

  /**
   * 注册提供者工厂
   */
  register(type: string, factory: SandboxProviderFactory): void {
    this.factories.set(type, factory)
    console.log(`[SandboxRegistry] 注册提供者: ${type}`)
  }

  /**
   * 获取提供者实例（单例）
   */
  async getInstance(type: string): Promise<ISandboxProvider | null> {
    // 已有实例直接返回
    const existing = this.instances.get(type)
    if (existing) return existing

    // 创建新实例
    const factory = this.factories.get(type)
    if (!factory) {
      console.warn(`[SandboxRegistry] 未知提供者类型: ${type}`)
      return null
    }

    const provider = factory()
    const available = await provider.isAvailable()
    if (!available) {
      console.warn(`[SandboxRegistry] 提供者不可用: ${type}`)
      return null
    }

    await provider.init()
    this.instances.set(type, provider)
    return provider
  }

  /**
   * 获取最佳可用提供者
   * 按优先级顺序尝试
   */
  async getBestProvider(): Promise<ISandboxProvider | null> {
    for (const type of this.priority) {
      const provider = await this.getInstance(type)
      if (provider) {
        console.log(`[SandboxRegistry] 使用提供者: ${type}`)
        return provider
      }
    }
    console.error('[SandboxRegistry] 没有可用的提供者')
    return null
  }

  /**
   * 获取所有可用提供者类型
   */
  async getAvailable(): Promise<string[]> {
    const available: string[] = []
    for (const [type, factory] of this.factories) {
      const provider = factory()
      if (await provider.isAvailable()) {
        available.push(type)
      }
    }
    return available
  }

  /**
   * 获取所有已注册的提供者类型
   */
  getRegistered(): string[] {
    return Array.from(this.factories.keys())
  }

  /**
   * 停止所有提供者实例
   */
  async stopAll(): Promise<void> {
    for (const [type, instance] of this.instances) {
      try {
        await instance.stop()
        console.log(`[SandboxRegistry] 已停止: ${type}`)
      } catch (err) {
        console.warn(`[SandboxRegistry] 停止失败: ${type}`, err)
      }
    }
    this.instances.clear()
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           全局单例                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

let globalRegistry: SandboxRegistry | null = null

export function getSandboxRegistry(): SandboxRegistry {
  if (!globalRegistry) {
    globalRegistry = new SandboxRegistry()
  }
  return globalRegistry
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           便捷函数                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

export function registerProvider(type: string, factory: SandboxProviderFactory): void {
  getSandboxRegistry().register(type, factory)
}

export async function getProvider(type?: string): Promise<ISandboxProvider | null> {
  const registry = getSandboxRegistry()
  return type ? registry.getInstance(type) : registry.getBestProvider()
}

export async function stopAllProviders(): Promise<void> {
  return getSandboxRegistry().stopAll()
}
