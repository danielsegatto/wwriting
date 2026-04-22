import { useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import {
  createAppendPosition,
  deleteBlock,
  moveBlockToConversation,
  updateBlock,
} from '../../lib/blocks.ts'
import type { Block } from '../../lib/blocks.ts'
import { listConversations } from '../../lib/conversations.ts'
import type { Conversation } from '../../lib/conversations.ts'
import { listFolders } from '../../lib/folders.ts'
import type { Folder } from '../../lib/folders.ts'
import {
  attachPickerTagToBlock,
  findOrCreateTag,
  listTags,
  listTagsForBlock,
  listTagsForBlocks,
  reconcileInlineTagsForBlock,
  removePickerTagFromBlock,
} from '../../lib/tags.ts'
import type { AppliedTag, Tag } from '../../lib/tags.ts'
import { report } from '../../lib/errors.ts'

type Props = {
  blocks: Block[]
  userId: string
  conversationId: string
  onBlockUpdated: (block: Block) => void
  onBlockRemoved: (blockId: string) => void
}

type ActionMode = 'menu' | 'edit' | 'move' | 'delete'
type ActionState = { blockId: string; mode: ActionMode } | null
type BusyState = { blockId: string; kind: 'tag' | 'edit' | 'move' | 'delete' } | null

marked.setOptions({ gfm: true, breaks: true })

const pickerTagSource = 'picker' as const
const maxTagSuggestions = 8
const longPressMs = 450

function renderMarkdown(src: string): string {
  return marked.parse(src) as string
}

function normalizeTagQuery(value: string): string {
  return value.trim().replace(/^#+/, '').toLowerCase()
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('button, input, textarea, a'))
}

function BlockItem({
  block,
  tags,
  folders,
  conversations,
  actionMode,
  isPickerOpen,
  pickerQuery,
  pickerBusy,
  editValue,
  blockBusy,
  suggestions,
  canCreateTag,
  onOpenActionMenu,
  onCloseAction,
  onOpenPicker,
  onClosePicker,
  onPickerQueryChange,
  onAddTag,
  onRemovePickerTag,
  onStartEdit,
  onEditValueChange,
  onSaveEdit,
  onStartMove,
  onMoveToConversation,
  onStartDelete,
  onConfirmDelete,
}: {
  block: Block
  tags: AppliedTag[]
  folders: Folder[]
  conversations: Conversation[]
  actionMode: ActionMode | null
  isPickerOpen: boolean
  pickerQuery: string
  pickerBusy: boolean
  editValue: string
  blockBusy: 'tag' | 'edit' | 'move' | 'delete' | null
  suggestions: Tag[]
  canCreateTag: boolean
  onOpenActionMenu: () => void
  onCloseAction: () => void
  onOpenPicker: () => void
  onClosePicker: () => void
  onPickerQueryChange: (value: string) => void
  onAddTag: (name: string) => void
  onRemovePickerTag: (tagId: string) => void
  onStartEdit: () => void
  onEditValueChange: (value: string) => void
  onSaveEdit: () => void
  onStartMove: () => void
  onMoveToConversation: (conversationId: string) => void
  onStartDelete: () => void
  onConfirmDelete: () => void
}) {
  const itemRef = useRef<HTMLDivElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const longPressTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const overlayOpen = isPickerOpen || actionMode === 'menu' || actionMode === 'move' || actionMode === 'delete'
    if (!overlayOpen) return

    function handlePointerDown(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (itemRef.current?.contains(target)) return
      onClosePicker()
      onCloseAction()
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      onClosePicker()
      onCloseAction()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [actionMode, isPickerOpen, onCloseAction, onClosePicker])

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current)
      }
    }
  }, [])

  const otherConversations = conversations.filter((conversation) => conversation.id !== block.conversation_id)
  const trimmedEditValue = editValue.trim()
  const canSaveEdit = trimmedEditValue !== '' && trimmedEditValue !== (block.body ?? '')

  function clearLongPressTimer() {
    if (longPressTimerRef.current === null) return
    window.clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = null
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (actionMode === 'edit' || isInteractiveTarget(event.target)) return
    if (event.pointerType === 'mouse') return

    clearLongPressTimer()
    longPressTimerRef.current = window.setTimeout(() => {
      onOpenActionMenu()
      longPressTimerRef.current = null
    }, longPressMs)
  }

  function handlePointerUp() {
    clearLongPressTimer()
  }

  function handleDoubleClick(event: React.MouseEvent<HTMLDivElement>) {
    if (actionMode === 'edit' || isInteractiveTarget(event.target)) return
    onOpenActionMenu()
  }

  return (
    <div
      ref={itemRef}
      onDoubleClick={handleDoubleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="relative rounded-2xl border border-zinc-800 bg-zinc-900/70 px-4 py-3"
    >
      <div className="absolute right-3 top-3 flex items-center gap-2">
        {blockBusy && (
          <span className="text-[11px] uppercase tracking-wide text-zinc-500">
            Working…
          </span>
        )}
        <button
          type="button"
          onClick={onOpenActionMenu}
          className="rounded-full border border-zinc-700 p-2 text-zinc-400 hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100"
          aria-label="Block actions"
          title="Block actions"
        >
          <DotsIcon />
        </button>
      </div>

      {actionMode === 'menu' && (
        <div className="absolute right-3 top-14 z-20 w-40 rounded-2xl border border-zinc-700 bg-zinc-900 p-1.5 shadow-2xl shadow-black/40">
          {block.type === 'text' && (
            <ActionMenuButton label="Edit block" onClick={onStartEdit} />
          )}
          <ActionMenuButton label="Move block" onClick={onStartMove} />
          <ActionMenuButton label="Delete block" destructive onClick={onStartDelete} />
        </div>
      )}

      {actionMode === 'move' && (
        <div className="absolute right-3 top-14 z-20 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-zinc-700 bg-zinc-900 p-3 shadow-2xl shadow-black/40">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-zinc-100">Move to conversation</p>
            <button
              type="button"
              onClick={onCloseAction}
              className="rounded-full p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              aria-label="Close move picker"
            >
              <CloseIcon />
            </button>
          </div>
          {otherConversations.length === 0 ? (
            <p className="rounded-xl bg-zinc-950 px-3 py-2 text-sm text-zinc-500">
              No other conversations yet.
            </p>
          ) : (
            <div className="max-h-64 space-y-3 overflow-y-auto">
              {folders.map((folder) => {
                const folderConversations = otherConversations.filter(
                  (conversation) => conversation.folder_id === folder.id,
                )
                if (folderConversations.length === 0) return null

                return (
                  <div key={folder.id}>
                    <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                      {folder.name}
                    </p>
                    <div className="space-y-1">
                      {folderConversations.map((conversation) => (
                        <button
                          key={conversation.id}
                          type="button"
                          onClick={() => onMoveToConversation(conversation.id)}
                          className="w-full rounded-xl px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                        >
                          {conversation.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {actionMode === 'delete' && (
        <div className="absolute right-3 top-14 z-20 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-red-900/80 bg-zinc-900 p-3 shadow-2xl shadow-black/40">
          <p className="text-sm text-zinc-100">Delete this block?</p>
          <p className="mt-1 text-xs text-zinc-500">
            This removes the block from the current conversation.
          </p>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCloseAction}
              className="rounded-full border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirmDelete}
              className="rounded-full bg-red-700 px-3 py-1.5 text-sm text-white hover:bg-red-600"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {block.type === 'divider' ? (
        <div className="py-3 pr-14">
          <hr className="border-zinc-700" />
        </div>
      ) : actionMode === 'edit' ? (
        <div className="pr-14">
          <textarea
            autoFocus
            value={editValue}
            onChange={(event) => onEditValueChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                onCloseAction()
              }
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault()
                if (canSaveEdit) onSaveEdit()
              }
            }}
            rows={4}
            className="w-full resize-y rounded-2xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-zinc-100 outline-none focus:border-blue-500"
          />
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCloseAction}
              className="rounded-full border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSaveEdit}
              disabled={!canSaveEdit}
              className="rounded-full bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <>
          <div
            className="pr-14 prose prose-invert prose-sm max-w-none text-zinc-100 [&_a]:text-blue-400 [&_code]:text-zinc-300 [&_pre]:bg-zinc-800"
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
        </>
      )}
    </div>
  )
}

export function BlockFeed({
  blocks,
  userId,
  conversationId,
  onBlockUpdated,
  onBlockRemoved,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevLenRef = useRef(blocks.length)
  const [availableTags, setAvailableTags] = useState<Tag[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [tagsByBlockId, setTagsByBlockId] = useState<Record<string, AppliedTag[]>>({})
  const [pickerBlockId, setPickerBlockId] = useState<string | null>(null)
  const [pickerQuery, setPickerQuery] = useState('')
  const [actionState, setActionState] = useState<ActionState>(null)
  const [busyState, setBusyState] = useState<BusyState>(null)
  const [editValue, setEditValue] = useState('')

  useEffect(() => {
    if (blocks.length > prevLenRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevLenRef.current = blocks.length
  }, [blocks.length])

  useEffect(() => {
    let cancelled = false

    async function loadContext() {
      try {
        const [nextTags, nextFolders, nextConversations] = await Promise.all([
          listTags(userId),
          listFolders(userId),
          listConversations(userId),
        ])

        if (cancelled) return
        setAvailableTags(nextTags)
        setFolders(nextFolders)
        setConversations(nextConversations)
      } catch (error) {
        report('error', 'Failed to load block feed helpers', error)
      }
    }

    void loadContext()

    return () => {
      cancelled = true
    }
  }, [conversationId, userId])

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

  const activePickerBlockId = pickerBlockId && blocks.some((block) => block.id === pickerBlockId)
    ? pickerBlockId
    : null
  const activeActionState = actionState && blocks.some((block) => block.id === actionState.blockId)
    ? actionState
    : null
  const normalizedPickerQuery = normalizeTagQuery(pickerQuery)
  const suggestions = normalizedPickerQuery === ''
    ? availableTags.slice(0, maxTagSuggestions)
    : availableTags
      .filter((tag) => tag.name.includes(normalizedPickerQuery))
      .slice(0, maxTagSuggestions)
  const hasExactSuggestion = availableTags.some((tag) => tag.name === normalizedPickerQuery)
  const canCreateTag = normalizedPickerQuery !== '' && !hasExactSuggestion

  async function refreshAvailableTags() {
    const nextTags = await listTags(userId)
    setAvailableTags(nextTags)
  }

  async function refreshBlockTags(blockId: string) {
    const nextTags = await listTagsForBlock(blockId)
    setTagsByBlockId((prev) => ({
      ...prev,
      [blockId]: nextTags,
    }))
  }

  function openAction(block: Block, mode: ActionMode) {
    setPickerBlockId(null)
    setPickerQuery('')
    setActionState({ blockId: block.id, mode })
    if (mode === 'edit') {
      setEditValue(block.body ?? '')
    } else {
      setEditValue('')
    }
  }

  function closeAction(blockId?: string) {
    setActionState((current) => {
      if (!current) return current
      if (blockId && current.blockId !== blockId) return current
      return null
    })
    if (!blockId || actionState?.blockId === blockId) {
      setEditValue('')
    }
  }

  async function handleAddTag(blockId: string, rawName: string) {
    const normalizedName = normalizeTagQuery(rawName)
    if (normalizedName === '') return

    setBusyState({ blockId, kind: 'tag' })
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
      setBusyState((current) =>
        current?.blockId === blockId && current.kind === 'tag' ? null : current,
      )
    }
  }

  async function handleRemovePickerTag(blockId: string, tagId: string) {
    setBusyState({ blockId, kind: 'tag' })
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
      setBusyState((current) =>
        current?.blockId === blockId && current.kind === 'tag' ? null : current,
      )
    }
  }

  async function handleSaveEdit(block: Block) {
    const nextBody = editValue.trim()
    if (nextBody === '' || nextBody === (block.body ?? '')) {
      closeAction(block.id)
      return
    }

    setBusyState({ blockId: block.id, kind: 'edit' })
    let updatedBlock: Block | null = null

    try {
      updatedBlock = await updateBlock({
        blockId: block.id,
        body: nextBody,
      })
      onBlockUpdated(updatedBlock)
      await reconcileInlineTagsForBlock(block.id, nextBody, userId)
      await Promise.all([
        refreshAvailableTags(),
        refreshBlockTags(block.id),
      ])
      closeAction(block.id)
    } catch (error) {
      if (updatedBlock) {
        closeAction(block.id)
      }
      report('error', 'Failed to save block edit', error)
    } finally {
      setBusyState((current) =>
        current?.blockId === block.id && current.kind === 'edit' ? null : current,
      )
    }
  }

  async function handleDeleteBlock(block: Block) {
    setBusyState({ blockId: block.id, kind: 'delete' })
    try {
      await deleteBlock(block.id)
      setTagsByBlockId((prev) => {
        const next = { ...prev }
        delete next[block.id]
        return next
      })
      onBlockRemoved(block.id)
      closeAction(block.id)
    } catch (error) {
      report('error', 'Failed to delete block', error)
    } finally {
      setBusyState((current) =>
        current?.blockId === block.id && current.kind === 'delete' ? null : current,
      )
    }
  }

  async function handleMoveBlock(block: Block, destinationConversationId: string) {
    if (destinationConversationId === conversationId) {
      closeAction(block.id)
      return
    }

    setBusyState({ blockId: block.id, kind: 'move' })
    try {
      await moveBlockToConversation({
        blockId: block.id,
        conversationId: destinationConversationId,
        position: createAppendPosition(),
      })
      setTagsByBlockId((prev) => {
        const next = { ...prev }
        delete next[block.id]
        return next
      })
      onBlockRemoved(block.id)
      closeAction(block.id)
    } catch (error) {
      report('error', 'Failed to move block', error)
    } finally {
      setBusyState((current) =>
        current?.blockId === block.id && current.kind === 'move' ? null : current,
      )
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
            folders={folders}
            conversations={conversations}
            actionMode={activeActionState?.blockId === block.id ? activeActionState.mode : null}
            isPickerOpen={activePickerBlockId === block.id}
            pickerQuery={pickerQuery}
            pickerBusy={busyState?.blockId === block.id && busyState.kind === 'tag'}
            editValue={activeActionState?.blockId === block.id ? editValue : block.body ?? ''}
            blockBusy={busyState?.blockId === block.id ? busyState.kind : null}
            suggestions={suggestions}
            canCreateTag={canCreateTag}
            onOpenActionMenu={() => openAction(block, 'menu')}
            onCloseAction={() => closeAction(block.id)}
            onOpenPicker={() => {
              setActionState(null)
              setEditValue('')
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
            onStartEdit={() => openAction(block, 'edit')}
            onEditValueChange={setEditValue}
            onSaveEdit={() => void handleSaveEdit(block)}
            onStartMove={() => openAction(block, 'move')}
            onMoveToConversation={(destinationConversationId) =>
              void handleMoveBlock(block, destinationConversationId)}
            onStartDelete={() => openAction(block, 'delete')}
            onConfirmDelete={() => void handleDeleteBlock(block)}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

function ActionMenuButton({
  label,
  destructive = false,
  onClick,
}: {
  label: string
  destructive?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl px-3 py-2 text-left text-sm ${
        destructive
          ? 'text-red-300 hover:bg-red-950/40'
          : 'text-zinc-200 hover:bg-zinc-800'
      }`}
    >
      {label}
    </button>
  )
}

function DotsIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="3" cy="8" r="1.25" />
      <circle cx="8" cy="8" r="1.25" />
      <circle cx="13" cy="8" r="1.25" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="2" y1="2" x2="10" y2="10" />
      <line x1="10" y1="2" x2="2" y2="10" />
    </svg>
  )
}
