import type { TimelineEntry } from '../App.js'
import { useRef, useEffect, useState } from 'react'

interface Props {
  timeline: TimelineEntry[]
}

export function MessageFlow({ timeline }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [followOutput, setFollowOutput] = useState(true)

  const scrollToBottom = (behavior: ScrollBehavior) => {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' })
  }

  const handleScroll = () => {
    const container = containerRef.current
    if (!container) return
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    setFollowOutput(distanceFromBottom < 96)
  }

  useEffect(() => {
    if (!followOutput) return
    scrollToBottom('smooth')
  }, [timeline.length, followOutput])

  if (timeline.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-on-surface-variant/30">
        <span className="material-symbols-outlined text-4xl">chat_bubble_outline</span>
        <span className="text-sm font-body">Start a conversation below</span>
      </div>
    )
  }

  return (
    <div className="relative flex h-full min-h-0 flex-1 overflow-hidden">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-2"
      >
        <div className="sticky top-0 z-10 -mb-1 bg-gradient-to-b from-surface-container-low via-surface-container-low/95 to-transparent pt-1 pb-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-surface-container-high/80 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant/80 shadow-lg shadow-surface/20 backdrop-blur-sm font-label">
            <span className="material-symbols-outlined text-xs">forum</span>
            Live Timeline
          </div>
        </div>

        {timeline.map((entry, i) => (
          <TimelineItem key={getTimelineKey(entry, i)} entry={entry} />
        ))}
        <div ref={bottomRef} />
      </div>

      {!followOutput && (
        <button
          type="button"
          onClick={() => {
            setFollowOutput(true)
            scrollToBottom('smooth')
          }}
          className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full bg-primary-container px-4 py-2 text-xs font-semibold text-on-primary-container shadow-xl shadow-primary-container/30 transition-transform active:scale-95"
        >
          <span className="material-symbols-outlined text-sm">south</span>
          Jump to latest
        </button>
      )}
    </div>
  )
}

function getTimelineKey(entry: TimelineEntry, index: number): string {
  switch (entry.type) {
    case 'message':
      return `message:${entry.data.id}`
    case 'log':
      return `log:${entry.data.agentId}:${entry.timestamp}:${index}`
    case 'thought':
      return `thought:${entry.timestamp}:${entry.text}`
    case 'user':
      return `user:${entry.timestamp}:${entry.text}`
  }
}

function TimelineItem({ entry }: { entry: TimelineEntry }) {
  const timestamp = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  switch (entry.type) {
    case 'user':
      return (
        <div className="flex w-full justify-end animate-fade-slide-up">
          <div className="ml-auto max-w-[78%]">
            <div className="rounded-[24px] rounded-br-md bg-linear-to-br from-primary-container to-primary-container/80 px-4 py-3 text-on-primary-container shadow-lg shadow-primary-container/15">
              <div className="mb-1 flex items-center justify-end gap-2">
                <div className="text-[10px] text-on-primary-container/55 font-label">{timestamp}</div>
                <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-on-primary-container/70 font-label">You</div>
              </div>
              <div className="text-sm text-on-primary-container leading-relaxed whitespace-pre-wrap font-body">{entry.text}</div>
            </div>
          </div>
        </div>
      )
    case 'thought':
      return (
        <div className="flex w-full justify-start animate-fade-slide-up">
          <div className="max-w-[88%]">
            <div className="rounded-[24px] rounded-bl-md border border-primary/10 bg-surface-container-highest/55 px-4 py-3 backdrop-blur-sm">
              <div className="mb-1 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-primary text-xs">psychology</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary font-label">Coordinator</span>
                <span className="text-[10px] text-on-surface-variant/45 font-label">{timestamp}</span>
              </div>
              <div className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap font-body">{entry.text}</div>
            </div>
          </div>
        </div>
      )
    case 'message':
      return (
        <div className="flex w-full justify-start animate-fade-slide-up">
          <div className="ml-3 max-w-[88%]">
            <div className="rounded-[24px] rounded-bl-md border border-outline-variant/20 bg-surface-container/85 px-4 py-3 shadow-lg shadow-surface/20">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-full bg-secondary/12 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-secondary font-label">
                  {entry.data.from}
                </span>
                <span className="material-symbols-outlined text-outline text-[12px]">arrow_forward</span>
                <span className="rounded-full bg-surface-container-high px-2 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-on-surface-variant font-label">
                  {entry.data.to}
                </span>
                <span className="ml-auto text-[10px] text-on-surface-variant/45 font-label">{timestamp}</span>
              </div>
              <div className="text-sm text-on-surface leading-7 whitespace-pre-wrap font-body">
                {entry.data.summary ?? entry.data.text}
              </div>
            </div>
          </div>
        </div>
      )
    case 'log':
      return (
        <div className="flex w-full justify-start animate-fade-slide-up">
          <div className={`max-w-[92%] rounded-xl px-3 py-2 font-mono text-[11px] leading-relaxed ${
            entry.data.level === 'error'
              ? 'bg-error/8 text-error'
              : 'bg-surface-container-lowest/60 text-on-surface-variant/65'
          }`}>
            <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em]">
              <span>{entry.data.agentId}</span>
              <span className="text-on-surface-variant/35">{timestamp}</span>
            </div>
            <div>{entry.data.text}</div>
          </div>
        </div>
      )
  }
}
