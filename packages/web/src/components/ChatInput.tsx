import { useEffect, useRef, useState } from 'react'

interface Props {
  isActive: boolean
  onSend: (text: string, model?: string) => void
  onStop: () => void
}

export function ChatInput({ isActive, onSend, onStop }: Props) {
  const [text, setText] = useState('')
  const [model, setModel] = useState('codex')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = '0px'
    const nextHeight = Math.min(textarea.scrollHeight, 220)
    textarea.style.height = `${Math.max(nextHeight, 44)}px`
    textarea.style.overflowY = textarea.scrollHeight > 220 ? 'auto' : 'hidden'
  }, [text])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    onSend(text.trim(), model)
    setText('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit}>
        {/* Input row — sunken feel using surface-container-lowest, no borders */}
        <div className="flex items-end gap-2 bg-surface-container-lowest rounded-xl p-2">
          {/* Model selector */}
          <select
            value={model}
            onChange={e => setModel(e.target.value)}
            className="bg-surface-container rounded-lg px-3 py-2.5 text-primary text-sm font-semibold font-body border-none outline-none cursor-pointer appearance-none shrink-0 min-w-[100px] focus:ring-1 focus:ring-primary/30"
          >
            <option value="codex">Codex</option>
            <option value="gemini">Gemini</option>
            <option value="claude">Claude</option>
          </select>

          {/* Text input */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isActive ? 'Send a follow-up...' : 'What do you want to research?'}
            rows={1}
            className="flex-1 bg-transparent border-none outline-none text-on-surface text-sm font-body resize-none leading-relaxed px-2 py-2 min-h-[44px] max-h-[220px] placeholder:text-outline/50"
          />

          {/* Stop button */}
          {isActive && (
            <button
              type="button"
              onClick={onStop}
              title="Stop session"
              className="w-9 h-9 rounded-lg bg-error-container/20 text-error flex items-center justify-center shrink-0 hover:bg-error-container/30 transition-colors"
            >
              <span className="material-symbols-outlined text-lg">stop</span>
            </button>
          )}

          {/* Send button */}
          <button
            type="submit"
            disabled={!text.trim()}
            title="Send"
            className="w-9 h-9 rounded-lg bg-primary-container text-on-primary-container flex items-center justify-center shrink-0 transition-all active:scale-95 disabled:opacity-30 shadow-lg shadow-primary-container/20"
          >
            <span className="material-symbols-outlined text-lg">send</span>
          </button>
        </div>
      </form>
    </div>
  )
}
