import { useState } from 'react'

interface Props {
  isActive: boolean
  hasSession: boolean
  onStart: (goal: string, model?: string) => void
  onStop: () => void
}

export function SessionControls({ isActive, hasSession, onStart, onStop }: Props) {
  const [goal, setGoal] = useState('')
  const [model, setModel] = useState('claude')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!goal.trim()) return
    onStart(goal.trim(), model)
    setGoal('')
  }

  if (isActive) {
    return (
      <button onClick={onStop} style={styles.stopBtn}>
        Stop Session
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <input
        type="text"
        value={goal}
        onChange={e => setGoal(e.target.value)}
        placeholder="What do you want to research?"
        style={styles.input}
      />
      <select value={model} onChange={e => setModel(e.target.value)} style={styles.select}>
        <option value="claude">Claude</option>
        <option value="gemini">Gemini</option>
        <option value="codex">Codex</option>
      </select>
      <button type="submit" disabled={!goal.trim()} style={{
        ...styles.startBtn,
        opacity: goal.trim() ? 1 : 0.5,
      }}>
        Start
      </button>
    </form>
  )
}

const styles: Record<string, React.CSSProperties> = {
  form: { display: 'flex', gap: 8, alignItems: 'center' },
  input: {
    background: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: 8,
    padding: '8px 14px',
    color: '#1a1a1a',
    fontSize: 14,
    width: 360,
    outline: 'none',
    fontFamily: 'inherit',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  },
  select: {
    background: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: 8,
    padding: '8px 10px',
    color: '#555',
    fontSize: 13,
    outline: 'none',
    fontFamily: 'inherit',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  },
  startBtn: {
    background: '#7c5cbf',
    border: 'none',
    borderRadius: 8,
    padding: '8px 20px',
    color: '#ffffff',
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: 600,
    fontFamily: 'inherit',
    boxShadow: '0 1px 3px rgba(124,92,191,0.3)',
  },
  stopBtn: {
    background: '#fee2e2',
    border: '1px solid #fecaca',
    borderRadius: 8,
    padding: '8px 20px',
    color: '#991b1b',
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: 600,
    fontFamily: 'inherit',
  },
}
