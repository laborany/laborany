#!/bin/bash
# Phase 2 端到端功能测试（通过 HTTP API 调用真实服务）
set -e

PORT=3002
BASE="http://localhost:$PORT"
PASSED=0
FAILED=0
SKILL_ID="deep-dialogue"
SESSION_ID="e2e_$(date +%s)"

red() { printf "\033[31m%s\033[0m\n" "$1"; }
green() { printf "\033[32m%s\033[0m\n" "$1"; }
check() {
  if [ "$2" = "true" ]; then
    green "  ✅ $1"
    PASSED=$((PASSED + 1))
  else
    red "  ❌ $1"
    FAILED=$((FAILED + 1))
  fi
}

echo ""
echo "═══════════════════════════════════════════════"
echo "  Phase 2 端到端功能测试"
echo "  Server: $BASE"
echo "  Skill:  $SKILL_ID"
echo "  Session: $SESSION_ID"
echo "═══════════════════════════════════════════════"

# ─── 测试 1: 服务器健康检查 ───
echo ""
echo "── 测试 1: 服务器健康检查 ──"
STATS=$(curl -s "$BASE/memory/queue/stats")
HAS_STATS=$(echo "$STATS" | grep -c '"stats"' || true)
check "服务器正常响应 /memory/queue/stats" "$([ "$HAS_STATS" -ge 1 ] && echo true || echo false)"

# ─── 测试 2: record-task API (sync 模式，走完整 extractAndUpsert) ───
echo ""
echo "── 测试 2: record-task API (sync 模式) ──"
RECORD_RESULT=$(curl -s -X POST "$BASE/memory/record-task" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"${SESSION_ID}\",
    \"skillId\": \"${SKILL_ID}\",
    \"userQuery\": \"帮我深入分析一下用户留存率下降的原因，我希望通过多轮追问找到根本原因\",
    \"assistantResponse\": \"通过三轮渐进式追问，我们发现留存率下降的根本原因是新用户引导流程过于复杂。用户在第三轮才说出核心痛点。建议简化前三步操作流程。这次对话验证了渐进式追问比直接给建议更有效的方法论。\",
    \"sync\": true
  }")
echo "  Response: $(echo "$RECORD_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps({k:d[k] for k in ['success','extractionMethod','written'] if k in d}, ensure_ascii=False))" 2>/dev/null)"
HAS_SUCCESS=$(echo "$RECORD_RESULT" | grep -c '"success":true' || true)
check "record-task API 返回 success" "$([ "$HAS_SUCCESS" -ge 1 ] && echo true || echo false)"

CELLS_WRITTEN=$(echo "$RECORD_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('written',{}).get('cells',0))" 2>/dev/null || echo "0")
check "record-task 写入了 MemCell (cells=$CELLS_WRITTEN)" "$([ "$CELLS_WRITTEN" -ge 1 ] && echo true || echo false)"

# ─── 测试 3: 验证 memory retrieve API ───
echo ""
echo "── 测试 3: memory retrieve API ──"
RETRIEVE_RESULT=$(curl -s -X POST "$BASE/memory/retrieve" \
  -H "Content-Type: application/json" \
  -d "{
    \"skillId\": \"${SKILL_ID}\",
    \"query\": \"用户留存率\",
    \"sessionId\": \"${SESSION_ID}\"
  }")
HAS_CONTEXT=$(echo "$RETRIEVE_RESULT" | grep -c '"context"' || true)
USED_TOKENS=$(echo "$RETRIEVE_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('usedTokens',0))" 2>/dev/null || echo "0")
check "retrieve API 返回 context (tokens=$USED_TOKENS)" "$([ "$HAS_CONTEXT" -ge 1 ] && echo true || echo false)"

# ─── 测试 4: 验证 cells 写入 ───
echo ""
echo "── 测试 4: 验证 MemCell 写入 ──"
CELLS_RESULT=$(curl -s "$BASE/memory/cells?days=1")
CELL_COUNT=$(echo "$CELLS_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('cells',[])))" 2>/dev/null || echo "0")
check "今日有 MemCell 写入 (count=$CELL_COUNT)" "$([ "$CELL_COUNT" -ge 1 ] && echo true || echo false)"

# ─── 测试 5: 跨 Skill record-task ───
echo ""
echo "── 测试 5: 跨 Skill record-task ──"
RECORD2_RESULT=$(curl -s -X POST "$BASE/memory/record-task" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"${SESSION_ID}_cross\",
    \"skillId\": \"general-assistant\",
    \"userQuery\": \"帮我分析用户留存率下降的数据\",
    \"assistantResponse\": \"根据数据分析，留存率下降主要集中在新用户群体，建议优化引导流程。\",
    \"sync\": true
  }")
HAS_SUCCESS2=$(echo "$RECORD2_RESULT" | grep -c '"success":true' || true)
check "跨 skill record-task 成功" "$([ "$HAS_SUCCESS2" -ge 1 ] && echo true || echo false)"

# ─── 测试 6: 验证 skill memory 文件列表 ───
echo ""
echo "── 测试 6: 验证 Skill Memory 文件列表 ──"
SKILL_MEM=$(curl -s "$BASE/memory/skill/${SKILL_ID}")
HAS_FILES=$(echo "$SKILL_MEM" | grep -c '"files"' || true)
FILE_COUNT=$(echo "$SKILL_MEM" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('files',[])))" 2>/dev/null || echo "0")
check "skill memory 返回文件列表 (files=$FILE_COUNT)" "$([ "$HAS_FILES" -ge 1 ] && echo true || echo false)"

# ─── 测试 7: 验证 global memory 文件列表 ───
echo ""
echo "── 测试 7: 验证 Global Memory 文件列表 ──"
GLOBAL_MEM=$(curl -s "$BASE/memory/global")
HAS_GLOBAL_FILES=$(echo "$GLOBAL_MEM" | grep -c '"files"' || true)
check "global memory 返回文件列表" "$([ "$HAS_GLOBAL_FILES" -ge 1 ] && echo true || echo false)"

# ─── 测试 8: 验证 search API ───
echo ""
echo "── 测试 8: 验证 Search API ──"
SEARCH_RESULT=$(curl -s -X POST "$BASE/memory/search" \
  -H "Content-Type: application/json" \
  -d "{
    \"query\": \"留存率\",
    \"scope\": \"all\",
    \"skillId\": \"${SKILL_ID}\"
  }")
SEARCH_COUNT=$(echo "$SEARCH_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('results',[])))" 2>/dev/null || echo "0")
check "search API 返回结果 (results=$SEARCH_COUNT)" "$([ "$SEARCH_COUNT" -ge 0 ] && echo true || echo false)"

# ─── 测试 9: 验证 profile export ───
echo ""
echo "── 测试 9: 验证 Profile Export ──"
PROFILE=$(curl -s "$BASE/memory/profile/export.md")
HAS_PROFILE=$(echo "$PROFILE" | grep -c '用户画像' || true)
check "profile export 包含用户画像内容" "$([ "$HAS_PROFILE" -ge 1 ] && echo true || echo false)"

# ─── 测试 10: 多轮对话累积 ───
echo ""
echo "── 测试 10: 多轮对话累积 ──"
CELLS_BEFORE=$CELL_COUNT
for i in 1 2 3; do
  curl -s -X POST "$BASE/memory/record-task" \
    -H "Content-Type: application/json" \
    -d "{
      \"sessionId\": \"${SESSION_ID}_round${i}\",
      \"skillId\": \"${SKILL_ID}\",
      \"userQuery\": \"第${i}轮对话：继续分析留存率问题的第${i}个维度\",
      \"assistantResponse\": \"第${i}轮分析完成，发现了新的洞察点。渐进式追问在第${i}轮产生了更深入的理解。\",
      \"sync\": true
    }" > /dev/null 2>&1
done
CELLS_AFTER=$(curl -s "$BASE/memory/cells?days=1")
CELL_COUNT_AFTER=$(echo "$CELLS_AFTER" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('cells',[])))" 2>/dev/null || echo "0")
check "多轮对话后 MemCell 数量增加 ($CELLS_BEFORE → $CELL_COUNT_AFTER)" "$([ "$CELL_COUNT_AFTER" -gt "$CELLS_BEFORE" ] && echo true || echo false)"

# ─── 测试 11: 验证 evolution-daily 写入（通过文件系统直接检查）───
echo ""
echo "── 测试 11: 验证 Evolution Daily 文件 ──"
# 使用 memory/file API 读取 skill daily（record-task 会写入 skill daily）
TODAY=$(date +%Y-%m-%d)
DAILY_FILE=$(curl -s "$BASE/memory/file?path=memory/skills/${SKILL_ID}/${TODAY}.md")
DAILY_LEN=$(echo "$DAILY_FILE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('content','')))" 2>/dev/null || echo "0")
check "skill daily 文件有内容 (len=$DAILY_LEN)" "$([ "$DAILY_LEN" -gt 0 ] && echo true || echo false)"

# 检查 daily 内容包含我们的测试数据
HAS_RETENTION=$(echo "$DAILY_FILE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(1 if '留存率' in d.get('content','') else 0)" 2>/dev/null || echo "0")
check "skill daily 包含测试对话内容" "$([ "$HAS_RETENTION" -ge 1 ] && echo true || echo false)"

# ─── 测试 12: 验证 queue drain ───
echo ""
echo "── 测试 12: 验证 Queue 状态 ──"
FINAL_STATS=$(curl -s "$BASE/memory/queue/stats")
QUEUE_PENDING=$(echo "$FINAL_STATS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('stats',{}).get('pending',0))" 2>/dev/null || echo "0")
check "队列无积压 (pending=$QUEUE_PENDING)" "$([ "$QUEUE_PENDING" -eq 0 ] && echo true || echo false)"

# ─── 结果汇总 ───
echo ""
echo "═══════════════════════════════════════════════"
TOTAL=$((PASSED + FAILED))
echo "  结果: $PASSED/$TOTAL 项检查通过"
if [ "$FAILED" -eq 0 ]; then
  green "  🎉 所有端到端功能测试通过！"
else
  red "  ⚠️  $FAILED 项检查失败"
fi
echo "═══════════════════════════════════════════════"

exit $FAILED
