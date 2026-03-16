import { useState } from 'react'

export function AddConfigItem({
  onAdd,
  existingKeys,
}: {
  onAdd: (key: string) => void
  existingKeys: Set<string>
}) {
  const [isAdding, setIsAdding] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [error, setError] = useState('')

  function handleAdd() {
    const key = newKey.trim().toUpperCase()
    if (!key) {
      setError('请输入配置名')
      return
    }
    if (existingKeys.has(key)) {
      setError('配置项已存在')
      return
    }
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
      setError('配置名只能包含大写字母、数字和下划线')
      return
    }
    onAdd(key)
    setNewKey('')
    setIsAdding(false)
    setError('')
  }

  if (!isAdding) {
    return (
      <button
        onClick={() => setIsAdding(true)}
        className="text-sm text-primary hover:text-primary/80"
      >
        + 添加自定义配置
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={newKey}
          onChange={event => {
            setNewKey(event.target.value.toUpperCase())
            setError('')
          }}
          placeholder="MY_CONFIG"
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          autoFocus
        />
        <button
          onClick={handleAdd}
          className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
        >
          添加
        </button>
        <button
          onClick={() => {
            setIsAdding(false)
            setNewKey('')
            setError('')
          }}
          className="px-3 py-2 bg-muted text-muted-foreground rounded-md text-sm hover:bg-muted/80"
        >
          取消
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
