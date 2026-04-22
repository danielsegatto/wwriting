import { useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import type { Block } from '../../lib/blocks.ts'
import {
  attachPickerTagToBlock,
  findOrCreateTag,
  listTags,
  listTagsForBlocks,
  removePickerTagFromBlock,
} from '../../lib/tags.ts'
import type { AppliedTag, Tag } from '../../lib/tags.ts'
import { report } from '../../lib/errors.ts'

type Props = {
  blocks: Block[]
  userId: string
}

marked.setOptions({ gfm: true, breaks: true })

const pickerTagSource = 'picker' as const
const maxTagSuggestions = 8

function renderMarkdown(src: string): string {
  return marked.parse(src) as string
}

function normalizeTagQuery(value: string): string {
  return value.trim().replace(/^#+/, '').toLowerCase()
}

function BlockItem({
  block,
  tags,
  isPickerOpen,
  pickerQuery,
  pickerBusy,
  suggestions,
  canCreateTag,
  onOpenPicker,
  onClosePicker,
  onPickerQueryChange,
  onAddTag,
  onRemovePickerTag,
}: {
  block: Block
  tags: AppliedTag[]
  isPickerOpen: boolean
  pickerQuery: string
  pickerBusy: boolean
  suggestions: Tag[]
  canCreateTag: boolean
  onOpenPicker: () => void
  onClosePicker: () => void
  onPickerQueryChange: (value: string) => void
  onAddTag: (name: string) => void
  onRemovePickerTag: (tagId: string) => void
}) {
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isPickerOpen) return

    function handlePointerDown(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (pickerRef.current?.contains(target)) return
      onClosePicker()
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClosePicker()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isPickerOpen, onClosePicker])

  if (block.type === 'divider') {
    return (
      <div className="py-2">
        <hr className="border-zinc-700" />
      </div>
    )
  }

  return (
    <div className="relative rounded-2xl border border-zinc-800 bg-zinc-900/70 px-4 py-3">
      <div
        className="prose prose-invert prose-sm max-w-none text-zinc-100 [&_a]:text-blue-400 [&_code]:text-zinc-300 [&_pre]:bg-zinc-800"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(block.body ?? '') }}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {tags.map((tag) => {
          const pickerApplied = tag.sources.includes(pickerTagSource)

          return (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 rounded-full bg-blue-950/80 px-2.5 py-1 text-xs font-medium text-blue-200"
            >
              <span>#{tag.name}</span>
              {pickerApplied && (
                <button
                  type="button"
                  onClick={() => onRemovePickerTag(tag.id)}
                  className="rounded-full px-1 text-[10px] leading-none text-blue-200/80 hover:bg-blue-900 hover:text-blue-100"
                  aria-label={`Remove tag ${tag.name}`}
                  title={`Remove tag ${tag.name}`}
                >
                  ×
                </button>
              )}
            </span>
          )
        })}
        <div className="relative">
          <button
            type="button"
            onClick={onOpenPicker}
            className="rounded-full border border-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100"
          >
            + Tag
          </button>
          {isPickerOpen && (
            <div
              ref={pickerRef}
              className="absolute left-0 top-[calc(100%+0.5rem)] z-10 w-[min(16rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] rounded-2xl border border-zinc-700 bg-zinc-900 p-3 shadow-2xl shadow-black/40 sm:left-auto sm:right-0"
            >
              <input
                autoFocus
                value={pickerQuery}
                onChange={(event) => onPickerQueryChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    if (suggestions.length > 0) {
                      onAddTag(suggestions[0].name)
                      return
                    }
                    if (canCreateTag) onAddTag(pickerQuery)
                  }
                }}
                placeholder="Add or search tags"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-blue-500"
              />
              <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                {suggestions.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => onAddTag(tag.name)}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                  >
                    <span>#{tag.name}</span>
                    <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                      {tags.some((appliedTag) => appliedTag.id === tag.id) ? 'Applied' : 'Add'}
                    </span>
                  </button>
                ))}
                {canCreateTag && (
                  <button
                    type="button"
                    onClick={() => onAddTag(pickerQuery)}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                  >
                    <span>Create #{normalizeTagQuery(pickerQuery)}</span>
                    <span className="text-[11px] uppercase tracking-wide text-zinc-500">New</span>
                  </button>
                )}
                {!canCreateTag && suggestions.length === 0 && (
                  <div className="rounded-xl px-3 py-2 text-sm text-zinc-500">
                    No matching tags.
                  </div>
                )}
              </div>
              {pickerBusy && (
                <p className="mt-2 text-xs text-zinc-500">Updating tags…</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function BlockFeed({ blocks, userId }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevLenRef = useRef(blocks.length)
  const [availableTags, setAvailableTags] = useState<Tag[]>([])
  const [tagsByBlockId, setTagsByBlockId] = useState<Record<string, AppliedTag[]>>({})
  const [pickerBlockId, setPickerBlockId] = useState<string | null>(null)
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerBusy, setPickerBusy] = useState(false)

  useEffect(() => {
    if (blocks.length > prevLenRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevLenRef.current = blocks.length
  }, [blocks.length])

  useEffect(() => {
    let cancelled = false

    listTags(userId)
      .then((tags) => {
        if (!cancelled) setAvailableTags(tags)
      })
      .catch((error) => {
        report('error', 'Failed to load tags for picker', error)
      })

    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    let cancelled = false

    if (blocks.length === 0) {
      return () => {
        cancelled = true
      }
    }

    listTagsForBlocks(blocks.map((block) => block.id))
      .then((nextTagsByBlockId) => {
        if (!cancelled) setTagsByBlockId(nextTagsByBlockId)
      })
      .catch((error) => {
        report('error', 'Failed to load block tags', error)
      })

    return () => {
      cancelled = true
    }
  }, [blocks])

  const normalizedPickerQuery = normalizeTagQuery(pickerQuery)
  const suggestions = normalizedPickerQuery === ''
    ? availableTags.slice(0, maxTagSuggestions)
    : availableTags
      .filter((tag) => tag.name.includes(normalizedPickerQuery))
      .slice(0, maxTagSuggestions)
  const hasExactSuggestion = availableTags.some((tag) => tag.name === normalizedPickerQuery)
  const canCreateTag = normalizedPickerQuery !== '' && !hasExactSuggestion

  async function handleAddTag(blockId: string, rawName: string) {
    const normalizedName = normalizeTagQuery(rawName)
    if (normalizedName === '') return

    setPickerBusy(true)
    try {
      const tag = await findOrCreateTag(normalizedName, userId)
      await attachPickerTagToBlock(blockId, tag.id)

      setAvailableTags((prev) => {
        const existing = prev.find((item) => item.id === tag.id)
        if (existing) return prev
        return [...prev, tag].sort((a, b) => a.name.localeCompare(b.name))
      })
      setTagsByBlockId((prev) => {
        const currentTags = prev[blockId] ?? []
        const existing = currentTags.find((item) => item.id === tag.id)
        if (existing) {
          if (!existing.sources.includes(pickerTagSource)) {
            return {
              ...prev,
              [blockId]: currentTags.map((item) =>
                item.id === tag.id
                  ? { ...item, sources: [...item.sources, pickerTagSource] }
                  : item,
              ),
            }
          }

          return prev
        }

        return {
          ...prev,
          [blockId]: [...currentTags, { ...tag, sources: [pickerTagSource] }]
            .sort((a, b) => a.name.localeCompare(b.name)),
        }
      })
      setPickerQuery('')
    } catch (error) {
      report('error', 'Failed to add picker tag', error)
    } finally {
      setPickerBusy(false)
    }
  }

  async function handleRemovePickerTag(blockId: string, tagId: string) {
    setPickerBusy(true)
    try {
      await removePickerTagFromBlock(blockId, tagId)
      setTagsByBlockId((prev) => {
        const currentTags = prev[blockId] ?? []
        const nextTags = currentTags
          .map((tag) =>
            tag.id === tagId
              ? { ...tag, sources: tag.sources.filter((source) => source !== pickerTagSource) }
              : tag,
          )
          .filter((tag) => tag.sources.length > 0)

        return {
          ...prev,
          [blockId]: nextTags,
        }
      })
    } catch (error) {
      report('error', 'Failed to remove picker tag', error)
    } finally {
      setPickerBusy(false)
    }
  }

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
          <BlockItem
            key={block.id}
            block={block}
            tags={tagsByBlockId[block.id] ?? []}
            isPickerOpen={pickerBlockId === block.id}
            pickerQuery={pickerQuery}
            pickerBusy={pickerBusy && pickerBlockId === block.id}
            suggestions={suggestions}
            canCreateTag={canCreateTag}
            onOpenPicker={() => {
              setPickerBlockId(block.id)
              setPickerQuery('')
            }}
            onClosePicker={() => {
              setPickerBlockId((current) => (current === block.id ? null : current))
              setPickerQuery('')
            }}
            onPickerQueryChange={setPickerQuery}
            onAddTag={(name) => void handleAddTag(block.id, name)}
            onRemovePickerTag={(tagId) => void handleRemovePickerTag(block.id, tagId)}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
