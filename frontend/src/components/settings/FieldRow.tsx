import { BOOLEAN_KEYS } from './types'

export function FieldRow({
  name,
  label,
  description,
  required,
  placeholder,
  sensitive,
  isBoolean,
  value,
  showValue,
  onToggleShow,
  onChange,
}: {
  name: string
  label: string
  description: string
  required: boolean
  placeholder: string
  sensitive: boolean
  isBoolean: boolean
  value: string
  showValue: boolean
  onToggleShow: () => void
  onChange: (nextValue: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-foreground">
        {label} <code className="text-xs text-muted-foreground">{name}</code>
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}

      {isBoolean ? (
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">未设置</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : (
        <div className="relative">
          <input
            type={sensitive && !showValue ? 'password' : 'text'}
            value={value}
            onChange={event => onChange(event.target.value)}
            placeholder={placeholder}
            className="w-full rounded-md border border-border bg-background px-3 py-2 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {sensitive && (
            <button
              type="button"
              onClick={onToggleShow}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              {showValue ? '隐藏' : '显示'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function renderFields(
  keys: string[],
  opts: {
    template: Record<string, { label?: string; description: string; required: boolean; placeholder: string; sensitive: boolean; dependsOnKey?: string; dependsOnValue?: string }>
    editValues: Record<string, string>
    showValues: Record<string, boolean>
    onToggleShow: (key: string) => void
    onChange: (key: string, value: string) => void
    isFieldVisible: (key: string) => boolean
  },
) {
  const visible = keys.filter(opts.isFieldVisible)
  if (visible.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无可配置项</p>
  }

  return (
    <div className="space-y-4">
      {visible.map(key => {
        const tmpl = opts.template[key]
        const meta = tmpl || {
          label: key,
          description: '',
          required: false,
          placeholder: '',
          sensitive: false,
        }
        const isSensitive = Boolean(
          meta.sensitive || key.toLowerCase().includes('key') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('pass'),
        )
        const value = opts.editValues[key] || ''
        const isBool = BOOLEAN_KEYS.has(key)

        return (
          <FieldRow
            key={key}
            name={key}
            label={meta.label || key}
            description={meta.description || ''}
            required={Boolean(meta.required)}
            placeholder={meta.placeholder || ''}
            sensitive={isSensitive}
            isBoolean={isBool}
            value={value}
            showValue={Boolean(opts.showValues[key])}
            onToggleShow={() => opts.onToggleShow(key)}
            onChange={(nextValue) => opts.onChange(key, nextValue)}
          />
        )
      })}
    </div>
  )
}
