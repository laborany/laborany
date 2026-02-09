/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     证据链追踪器                                          ║
 * ║                                                                          ║
 * ║  职责：管理 Profile 字段的证据来源                                         ║
 * ║  设计：每个字段值都有证据列表支撑                                          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface Evidence {
  source: string      // 格式：YYYY-MM-DD|cell_xxx
  timestamp: Date
  content: string     // 原始内容片段
  confidence: number
}

export interface EvidencedValue<T> {
  value: T
  evidences: Evidence[]
  lastUpdated: Date
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     证据链管理器类                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export class EvidenceTracker {
  /* ────────────────────────────────────────────────────────────────────────
   *  创建新的证据记录
   * ──────────────────────────────────────────────────────────────────────── */
  createEvidence(cellId: string, content: string, confidence = 0.8): Evidence {
    const date = new Date().toISOString().split('T')[0]
    return {
      source: `${date}|${cellId}`,
      timestamp: new Date(),
      content,
      confidence,
    }
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  创建带证据的值
   * ──────────────────────────────────────────────────────────────────────── */
  createValue<T>(value: T, evidence: Evidence): EvidencedValue<T> {
    return {
      value,
      evidences: [evidence],
      lastUpdated: new Date(),
    }
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  添加证据到现有值
   * ──────────────────────────────────────────────────────────────────────── */
  addEvidence<T>(ev: EvidencedValue<T>, evidence: Evidence): EvidencedValue<T> {
    return {
      ...ev,
      evidences: [...ev.evidences, evidence],
      lastUpdated: new Date(),
    }
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  更新值（保留旧证据，添加新证据）
   * ──────────────────────────────────────────────────────────────────────── */
  updateValue<T>(
    ev: EvidencedValue<T>,
    newValue: T,
    evidence: Evidence
  ): EvidencedValue<T> {
    return {
      value: newValue,
      evidences: [...ev.evidences, evidence],
      lastUpdated: new Date(),
    }
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  计算综合置信度（证据越多、越新，置信度越高）
   * ──────────────────────────────────────────────────────────────────────── */
  calcConfidence<T>(ev: EvidencedValue<T>): number {
    if (ev.evidences.length === 0) return 0

    const now = Date.now()
    let weightedSum = 0
    let totalWeight = 0

    for (const e of ev.evidences) {
      // 时间衰减：7 天内权重为 1，之后逐渐衰减
      const ageMs = now - e.timestamp.getTime()
      const ageDays = ageMs / (1000 * 60 * 60 * 24)
      const timeWeight = Math.max(0.1, 1 - ageDays / 30)

      weightedSum += e.confidence * timeWeight
      totalWeight += timeWeight
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  序列化证据（用于存储）
   * ──────────────────────────────────────────────────────────────────────── */
  serializeEvidence(evidence: Evidence): string {
    return evidence.source
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  反序列化证据
   * ──────────────────────────────────────────────────────────────────────── */
  deserializeEvidence(source: string, content = ''): Evidence {
    const [date, cellId] = source.split('|')
    return {
      source,
      timestamp: new Date(date || Date.now()),
      content,
      confidence: 0.8,
    }
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           导出单例                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export const evidenceTracker = new EvidenceTracker()