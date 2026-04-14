/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     调度配置输入组件                                       ║
 * ║                                                                          ║
 * ║  支持三种调度类型：一次性、周期性、Cron 表达式                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

import { useState } from 'react'
import type { Schedule, ScheduleKind } from '../../hooks/useCron'

interface Props {
  value: Schedule
  onChange: (schedule: Schedule) => void
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           常用 Cron 预设                                  │
 * └──────────────────────────────────────────────────────────────────────────┘ */

const CRON_PRESETS = [
  { label: '每小时', expr: '0 * * * *' },
  { label: '每天 9 点', expr: '0 9 * * *' },
  { label: '工作日 9 点', expr: '0 9 * * 1-5' },
  { label: '每周一 9 点', expr: '0 9 * * 1' },
  { label: '每月 1 号', expr: '0 0 1 * *' },
]

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │                           周期预设                                        │
 * └──────────────────────────────────────────────────────────────────────────┘ */

const EVERY_PRESETS = [
  { label: '5 分钟', ms: 5 * 60 * 1000 },
  { label: '15 分钟', ms: 15 * 60 * 1000 },
  { label: '30 分钟', ms: 30 * 60 * 1000 },
  { label: '1 小时', ms: 60 * 60 * 1000 },
  { label: '6 小时', ms: 6 * 60 * 60 * 1000 },
  { label: '12 小时', ms: 12 * 60 * 60 * 1000 },
  { label: '24 小时', ms: 24 * 60 * 60 * 1000 },
]

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function formatDateTimeLocal(ms: number): string {
  const date = new Date(ms)
  return [
    date.getFullYear(),
    '-',
    pad2(date.getMonth() + 1),
    '-',
    pad2(date.getDate()),
    'T',
    pad2(date.getHours()),
    ':',
    pad2(date.getMinutes()),
  ].join('')
}

function parseDateTimeLocal(value: string): number {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!match) return Number.NaN

  const [, year, month, day, hour, minute] = match
  return new Date(
    Number.parseInt(year, 10),
    Number.parseInt(month, 10) - 1,
    Number.parseInt(day, 10),
    Number.parseInt(hour, 10),
    Number.parseInt(minute, 10),
    0,
    0,
  ).getTime()
}

function getNextFiveMinuteSlot(nowMs = Date.now()): number {
  const slotMs = 5 * 60 * 1000
  return Math.ceil(nowMs / slotMs) * slotMs
}

export function ScheduleInput({ value, onChange }: Props) {
  const [kind, setKind] = useState<ScheduleKind>(value.kind)

  function handleKindChange(newKind: ScheduleKind) {
    setKind(newKind)

    if (newKind === 'at') {
      onChange({ kind: 'at', atMs: getNextFiveMinuteSlot() })
    } else if (newKind === 'every') {
      onChange({ kind: 'every', everyMs: 3600000 })
    } else {
      onChange({ kind: 'cron', expr: '0 9 * * *' })
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-foreground">
        调度规则 <span className="text-red-500">*</span>
      </label>

      {/* 类型选择 */}
      <div className="flex gap-2">
        {[
          { kind: 'at' as const, label: '一次性' },
          { kind: 'every' as const, label: '周期性' },
          { kind: 'cron' as const, label: 'Cron' },
        ].map((opt) => (
          <button
            key={opt.kind}
            type="button"
            onClick={() => handleKindChange(opt.kind)}
            className={`rounded-2xl px-4 py-2 text-sm font-medium transition-colors ${
              kind === opt.kind
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 一次性：日期时间选择 */}
      {kind === 'at' && value.kind === 'at' && (
        <div>
          <input
            type="datetime-local"
            value={formatDateTimeLocal(value.atMs)}
            onChange={(e) => {
              const ms = parseDateTimeLocal(e.target.value)
              onChange({ kind: 'at', atMs: ms })
            }}
            className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      )}

      {/* 周期性：间隔选择 */}
      {kind === 'every' && value.kind === 'every' && (
        <div className="flex flex-wrap gap-2">
          {EVERY_PRESETS.map((preset) => (
            <button
            key={preset.ms}
            type="button"
            onClick={() => onChange({ kind: 'every', everyMs: preset.ms })}
            className={`rounded-2xl px-4 py-2 text-sm transition-colors ${
              value.everyMs === preset.ms
                ? 'bg-primary/20 text-primary border border-primary'
                : 'bg-muted text-muted-foreground hover:bg-accent border border-transparent'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}

      {/* Cron：表达式输入 */}
      {kind === 'cron' && value.kind === 'cron' && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {CRON_PRESETS.map((preset) => (
              <button
                key={preset.expr}
                type="button"
                onClick={() => onChange({ kind: 'cron', expr: preset.expr })}
                className={`rounded-2xl px-4 py-2 text-sm transition-colors ${
                  value.expr === preset.expr
                    ? 'bg-primary/20 text-primary border border-primary'
                    : 'bg-muted text-muted-foreground hover:bg-accent border border-transparent'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={value.expr}
            onChange={(e) => onChange({ kind: 'cron', expr: e.target.value })}
            placeholder="Cron 表达式，如 0 9 * * 1-5"
            className="w-full rounded-2xl border border-border bg-background px-4 py-3 font-mono text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <p className="text-sm text-muted-foreground">
            格式：分 时 日 月 周（例如 0 9 * * 1-5 表示工作日 9 点）
          </p>
        </div>
      )}
    </div>
  )
}
