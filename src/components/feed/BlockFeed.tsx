import { useEffect, useRef } from 'react'
import { marked } from 'marked'
import type { Block } from '../../lib/blocks.ts'

type Props = {
  blocks: Block[]
}

marked.setOptions({ gfm: true, breaks: true })

function renderMarkdown(src: string): string {
  return marked.parse(src) as string
}

function BlockItem({ block }: { block: Block }) {
  if (block.type === 'divider') {
    return (
      <div className="py-2">
        <hr className="border-zinc-700" />
      </div>
    )
  }

  return (
    <div
      className="prose prose-invert prose-sm max-w-none text-zinc-100 [&_a]:text-blue-400 [&_code]:text-zinc-300 [&_pre]:bg-zinc-800"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(block.body ?? '') }}
    />
  )
}

export function BlockFeed({ blocks }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevLenRef = useRef(blocks.length)

  useEffect(() => {
    if (blocks.length > prevLenRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevLenRef.current = blocks.length
  }, [blocks.length])

  if (blocks.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-zinc-600">Nothing here yet.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <div className="mx-auto max-w-2xl space-y-3">
        {blocks.map((block) => (
          <BlockItem key={block.id} block={block} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
