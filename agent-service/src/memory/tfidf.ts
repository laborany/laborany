/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     TF-IDF 语义检索引擎                                   ║
 * ║                                                                          ║
 * ║  职责：轻量级语义检索，无外部依赖                                          ║
 * ║  算法：TF-IDF 向量化 + 余弦相似度                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           类型定义                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export interface TFIDFDocument {
  id: string
  tokens: string[]
  vector: Map<string, number>
  magnitude: number
}

export interface TFIDFIndex {
  documents: Map<string, TFIDFDocument>
  idf: Map<string, number>
  vocabulary: Set<string>
  docCount: number
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     分词器（中英文混合）                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1)
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     计算词频 (TF)                                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function calcTF(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>()
  for (const token of tokens) {
    freq.set(token, (freq.get(token) || 0) + 1)
  }
  // 归一化：除以文档长度
  const len = tokens.length
  for (const [term, count] of freq) {
    freq.set(term, count / len)
  }
  return freq
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     计算向量模长                                          │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function calcMagnitude(vector: Map<string, number>): number {
  let sum = 0
  for (const val of vector.values()) {
    sum += val * val
  }
  return Math.sqrt(sum)
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     TF-IDF 索引构建器                                     │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export class TFIDFIndexer {
  private index: TFIDFIndex = {
    documents: new Map(),
    idf: new Map(),
    vocabulary: new Set(),
    docCount: 0,
  }

  /*
   *  添加文档到索引
   * ──────────────────────────────────────────────────────────────────────── */
  addDocument(id: string, content: string): void {
    const tokens = tokenize(content)
    for (const token of tokens) {
      this.index.vocabulary.add(token)
    }
    // 暂存 tokens，IDF 计算后再生成向量
    this.index.documents.set(id, {
      id,
      tokens,
      vector: new Map(),
      magnitude: 0,
    })
    this.index.docCount++
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  计算 IDF 并生成 TF-IDF 向量
   * ──────────────────────────────────────────────────────────────────────── */
  build(): TFIDFIndex {
    const N = this.index.docCount
    if (N === 0) return this.index

    // 计算每个词的文档频率
    const docFreq = new Map<string, number>()
    for (const doc of this.index.documents.values()) {
      const seen = new Set<string>()
      for (const token of doc.tokens) {
        if (!seen.has(token)) {
          docFreq.set(token, (docFreq.get(token) || 0) + 1)
          seen.add(token)
        }
      }
    }

    // 计算 IDF: log(N / df)
    for (const [term, df] of docFreq) {
      this.index.idf.set(term, Math.log(N / df))
    }

    // 为每个文档生成 TF-IDF 向量
    for (const doc of this.index.documents.values()) {
      const tf = calcTF(doc.tokens)
      for (const [term, tfVal] of tf) {
        const idf = this.index.idf.get(term) || 0
        doc.vector.set(term, tfVal * idf)
      }
      doc.magnitude = calcMagnitude(doc.vector)
    }

    return this.index
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  获取索引
   * ──────────────────────────────────────────────────────────────────────── */
  getIndex(): TFIDFIndex {
    return this.index
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  清空索引
   * ──────────────────────────────────────────────────────────────────────── */
  clear(): void {
    this.index = {
      documents: new Map(),
      idf: new Map(),
      vocabulary: new Set(),
      docCount: 0,
    }
  }
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                     TF-IDF 检索器                                         │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export class TFIDFSearcher {
  constructor(private index: TFIDFIndex) {}

  /* ────────────────────────────────────────────────────────────────────────
   *  计算查询向量
   * ──────────────────────────────────────────────────────────────────────── */
  private queryToVector(queryTokens: string[]): Map<string, number> {
    const tf = calcTF(queryTokens)
    const vector = new Map<string, number>()
    for (const [term, tfVal] of tf) {
      const idf = this.index.idf.get(term) || 0
      if (idf > 0) {
        vector.set(term, tfVal * idf)
      }
    }
    return vector
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  计算余弦相似度
   * ──────────────────────────────────────────────────────────────────────── */
  private cosineSimilarity(
    v1: Map<string, number>,
    m1: number,
    v2: Map<string, number>,
    m2: number
  ): number {
    if (m1 === 0 || m2 === 0) return 0
    let dot = 0
    for (const [term, val] of v1) {
      const val2 = v2.get(term)
      if (val2) dot += val * val2
    }
    return dot / (m1 * m2)
  }

  /* ────────────────────────────────────────────────────────────────────────
   *  搜索：返回按相似度排序的文档 ID 列表
   * ──────────────────────────────────────────────────────────────────────── */
  search(query: string, maxResults = 10): Array<{ id: string; score: number }> {
    const queryTokens = tokenize(query)
    if (queryTokens.length === 0) return []

    const queryVector = this.queryToVector(queryTokens)
    const queryMagnitude = calcMagnitude(queryVector)
    if (queryMagnitude === 0) return []

    const results: Array<{ id: string; score: number }> = []
    for (const doc of this.index.documents.values()) {
      const score = this.cosineSimilarity(
        queryVector, queryMagnitude,
        doc.vector, doc.magnitude
      )
      if (score > 0) {
        results.push({ id: doc.id, score })
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
  }
}
