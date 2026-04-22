import { useEffect, useRef, useState } from 'react'
import {
  createAppendPosition,
  createSequentialPositions,
  deleteBlock,
  moveBlockToConversation,
  reorderBlocks,
  updateBlock,
} from '../../lib/blocks.ts'
import type { Block, BlockSyncStatus, ClientBlock } from '../../lib/blocks.ts'
import {
  blockPreviewCollapseThreshold,
  citationPickerPreviewLength,
} from '../../lib/constants.ts'
import { listConversations } from '../../lib/conversations.ts'
import type { Conversation } from '../../lib/conversations.ts'
import { listFolders } from '../../lib/folders.ts'
import type { Folder } from '../../lib/folders.ts'
import { renderMarkdown } from '../../lib/markdown.ts'
import {
  searchCitationCandidates,
  loadCitationTargetsForBlocks,
  reconcileBlockReferences,
} from '../../lib/references.ts'
import type { CitationCandidate, CitationTarget } from '../../lib/references.ts'
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
  blocks: ClientBlock[]
  userId: string
  conversationId: string
  highlightedBlockId: string | null
  highlightedBlockVersion: number
  onBlocksReordered: (blocks: Block[]) => void
  onBlockUpdated: (block: Block) => void
  onBlockRemoved: (blockId: string) => void
  onRetryBlock: (blockId: string) => void
  onJumpToBlock: (target: CitationTarget) => void
}

type ActionMode = 'menu' | 'edit' | 'move' | 'delete'
type ActionState = { blockId: string; mode: ActionMode } | null
type BusyState = { blockId: string; kind: 'tag' | 'edit' | 'move' | 'delete' } | null
type EditCitationPickerState = { blockId: string; insertionIndex: number } | null
type BulkActionMode = 'move' | 'delete' | null
type DragState = {
  activeBlockId: string
  conversationId: string
  previewBlocks: ClientBlock[]
  ghostLabel: string
} | null
type OptimisticOrderState = {
  conversationId: string
  blocks: ClientBlock[]
} | null
type SelectionState = {
  conversationId: string
  blockIds: string[]
} | null

const pickerTagSource = 'picker' as const
const maxTagSuggestions = 8
const longPressMs = 450

function normalizePreviewBody(body: string): string {
  return body.replace(/\s+/g, ' ').trim()
}

function CitationCandidateRow({
  candidate,
  onSelect,
}: {
  candidate: CitationCandidate
  onSelect: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const normalizedBody = normalizePreviewBody(candidate.body)
  const isLongBody = normalizedBody.length > blockPreviewCollapseThreshold
  const visibleBody =
    isLongBody && !expanded
      ? `${normalizedBody.slice(0, citationPickerPreviewLength).trimEnd()}…`
      : normalizedBody || '[empty]'

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-3 py-3 hover:border-zinc-700 hover:bg-zinc-950">
      <button type="button" onClick={onSelect} className="w-full text-left">
        <p className="text-sm leading-6 text-zinc-100">{visibleBody}</p>
        <p className="mt-2 text-xs uppercase tracking-[0.2em] text-zinc-500">
          {candidate.conversationName}
        </p>
      </button>
      {isLongBody && (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setExpanded((current) => !current)
          }}
          className="mt-2 text-xs font-medium text-blue-300 hover:text-blue-200"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

function normalizeTagQuery(value: string): string {
  return value.trim().replace(/^#+/, '').toLowerCase()
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('button, input, textarea, a'))
}

function haveSameBlockOrder(left: Block[], right: Block[]): boolean {
  return (
    left.length === right.length &&
    left.every((block, index) => block.id === right[index]?.id)
  )
}

function moveBlockToIndex(blocks: Block[], blockId: string, targetIndex: number): Block[] {
  const currentIndex = blocks.findIndex((block) => block.id === blockId)
  if (currentIndex === -1) return blocks

  const clampedTargetIndex = Math.max(0, Math.min(targetIndex, blocks.length - 1))
  if (currentIndex === clampedTargetIndex) return blocks

  const nextBlocks = [...blocks]
  const [movedBlock] = nextBlocks.splice(currentIndex, 1)
  nextBlocks.splice(clampedTargetIndex, 0, movedBlock)

  return nextBlocks
}

function BlockItem({
  block,
  tags,
  folders,
  conversations,
  citationTargetsById,
  highlighted,
  actionMode,
  isPickerOpen,
  isEditCitationPickerOpen,
  pickerQuery,
  pickerBusy,
  editValue,
  editCitationQuery,
  editCitationBusy,
  editCitationCandidates,
  editCursorPosition,
  blockBusy,
  syncStatus,
  syncErrorMessage,
  selected,
  selectionDisabled,
  isDragging,
  dragDisabled,
  suggestions,
  canCreateTag,
  onToggleSelected,
  onDragHandlePointerDown,
  onOpenActionMenu,
  onCloseAction,
  onOpenPicker,
  onClosePicker,
  onPickerQueryChange,
  onAddTag,
  onRemovePickerTag,
  onStartEdit,
  onOpenEditCitationPicker,
  onCloseEditCitationPicker,
  onEditCitationQueryChange,
  onInsertEditCitation,
  onEditCursorApplied,
  onEditValueChange,
  onSaveEdit,
  onStartMove,
  onMoveToConversation,
  onStartDelete,
  onConfirmDelete,
  onRetrySync,
  onJumpToBlock,
}: {
  block: ClientBlock
  tags: AppliedTag[]
  folders: Folder[]
  conversations: Conversation[]
  citationTargetsById: Record<string, CitationTarget>
  highlighted: boolean
  actionMode: ActionMode | null
  isPickerOpen: boolean
  isEditCitationPickerOpen: boolean
  pickerQuery: string
  pickerBusy: boolean
  editValue: string
  editCitationQuery: string
  editCitationBusy: boolean
  editCitationCandidates: CitationCandidate[]
  editCursorPosition: number | null
  blockBusy: 'tag' | 'edit' | 'move' | 'delete' | null
  syncStatus: BlockSyncStatus
  syncErrorMessage: string | null | undefined
  selected: boolean
  selectionDisabled: boolean
  isDragging: boolean
  dragDisabled: boolean
  suggestions: Tag[]
  canCreateTag: boolean
  onToggleSelected: () => void
  onDragHandlePointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void
  onOpenActionMenu: () => void
  onCloseAction: () => void
  onOpenPicker: () => void
  onClosePicker: () => void
  onPickerQueryChange: (value: string) => void
  onAddTag: (name: string) => void
  onRemovePickerTag: (tagId: string) => void
  onStartEdit: () => void
  onOpenEditCitationPicker: (insertionIndex: number) => void
  onCloseEditCitationPicker: () => void
  onEditCitationQueryChange: (value: string) => void
  onInsertEditCitation: (candidate: CitationCandidate) => void
  onEditCursorApplied: () => void
  onEditValueChange: (value: string) => void
  onSaveEdit: () => void
  onStartMove: () => void
  onMoveToConversation: (conversationId: string) => void
  onStartDelete: () => void
  onConfirmDelete: () => void
  onRetrySync: () => void
  onJumpToBlock: (target: CitationTarget) => void
}) {
  const itemRef = useRef<HTMLDivElement>(null)
  const longPressTimerRef = useRef<number | null>(null)
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const overlayOpen =
      isPickerOpen ||
      isEditCitationPickerOpen ||
      actionMode === 'menu' ||
      actionMode === 'move' ||
      actionMode === 'delete'
    if (!overlayOpen) return

    function handlePointerDown(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (itemRef.current?.contains(target)) return
      onClosePicker()
      onCloseEditCitationPicker()
      if (actionMode !== 'edit') {
        onCloseAction()
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      onClosePicker()
      onCloseEditCitationPicker()
      if (actionMode !== 'edit') {
        onCloseAction()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [
    actionMode,
    isEditCitationPickerOpen,
    isPickerOpen,
    onCloseAction,
    onCloseEditCitationPicker,
    onClosePicker,
  ])

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (actionMode !== 'edit' || editCursorPosition === null) return

    const textarea = editTextareaRef.current
    if (!textarea) return

    textarea.focus()
    textarea.setSelectionRange(editCursorPosition, editCursorPosition)
    onEditCursorApplied()
  }, [actionMode, editCursorPosition, onEditCursorApplied])

  const otherConversations = conversations.filter(
    (conversation) => conversation.id !== block.conversation_id,
  )
  const trimmedEditValue = editValue.trim()
  const canSaveEdit = trimmedEditValue !== '' && trimmedEditValue !== (block.body ?? '')
  const renderedBody = renderMarkdown(block.body ?? '', citationTargetsById)
  const isSynced = syncStatus === 'synced'

  function clearLongPressTimer() {
    if (longPressTimerRef.current === null) return
    window.clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = null
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!isSynced || actionMode === 'edit' || isInteractiveTarget(event.target)) return
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
    if (!isSynced || actionMode === 'edit' || isInteractiveTarget(event.target)) return
    onOpenActionMenu()
  }

  function handleBodyClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target
    if (!(target instanceof HTMLElement)) return

    const citationButton = target.closest<HTMLElement>('[data-citation-target-id]')
    const targetId = citationButton?.dataset.citationTargetId
    if (!targetId) return

    const citationTarget = citationTargetsById[targetId]
    if (!citationTarget || citationTarget.deleted || !citationTarget.conversationId) return

    event.preventDefault()
    event.stopPropagation()
    onJumpToBlock(citationTarget)
  }

  return (
    <div
      ref={itemRef}
      data-block-id={block.id}
      onDoubleClick={handleDoubleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={`relative scroll-mt-24 rounded-2xl border px-4 py-3 transition ${
        highlighted
          ? 'border-blue-700 bg-blue-950/25 ring-1 ring-blue-500/80'
          : syncStatus === 'failed'
            ? 'border-red-900/70 bg-red-950/15 ring-1 ring-red-900/40'
            : syncStatus === 'syncing'
              ? 'border-blue-900/60 bg-blue-950/10 ring-1 ring-blue-900/30'
          : selected
            ? 'border-zinc-700 bg-zinc-900 ring-1 ring-blue-500/50'
          : 'border-zinc-800 bg-zinc-900/70'
      } ${isDragging ? 'opacity-20 border-dashed border-violet-500/60 bg-violet-950/20' : ''}`}
    >
      <div className="absolute left-3 top-3 flex flex-col gap-2">
        <label
          className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border transition ${
            selected
              ? 'border-blue-500 bg-blue-600 text-white'
              : 'border-zinc-700 bg-zinc-900 text-zinc-500 hover:border-zinc-600 hover:text-zinc-200'
          } ${selectionDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
          aria-label={selected ? 'Deselect block' : 'Select block'}
          title={selected ? 'Deselect block' : 'Select block'}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelected}
            disabled={selectionDisabled || !isSynced}
            className="sr-only"
          />
          <CheckIcon />
        </label>
        <button
          type="button"
          onPointerDown={onDragHandlePointerDown}
          onClick={(event) => event.preventDefault()}
          disabled={dragDisabled || !isSynced}
          className="touch-none rounded-full border border-zinc-700 p-2 text-zinc-400 transition hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Drag block to reorder"
          title="Drag block to reorder"
        >
          <GripIcon />
        </button>
      </div>
      <div className="absolute right-3 top-3 flex items-center gap-2">
        {syncStatus === 'syncing' && (
          <span className="text-[11px] uppercase tracking-wide text-blue-300">
            Sending…
          </span>
        )}
        {syncStatus === 'failed' && (
          <>
            <span className="text-[11px] uppercase tracking-wide text-red-300">
              Send failed
            </span>
            <button
              type="button"
              onClick={onRetrySync}
              className="rounded-full border border-red-800/80 px-2.5 py-1 text-[11px] uppercase tracking-wide text-red-200 hover:bg-red-950/50"
            >
              Retry
            </button>
          </>
        )}
        {blockBusy && (
          <span className="text-[11px] uppercase tracking-wide text-zinc-500">
            Working…
          </span>
        )}
        <button
          type="button"
          onClick={onOpenActionMenu}
          disabled={!isSynced}
          className="rounded-full border border-zinc-700 p-2 text-zinc-400 hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100"
          aria-label="Block actions"
          title="Block actions"
        >
          <DotsIcon />
        </button>
      </div>
      {syncStatus === 'failed' && syncErrorMessage && (
        <p className="mb-3 pl-12 pr-14 text-xs text-red-300/90">
          {syncErrorMessage}
        </p>
      )}

      {actionMode === 'menu' && (
        <div className="absolute right-3 top-14 z-20 w-40 rounded-2xl border border-zinc-700 bg-zinc-900 p-1.5 shadow-2xl shadow-black/40">
          {block.type === 'text' && <ActionMenuButton label="Edit block" onClick={onStartEdit} />}
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
        <div className="py-3 pl-12 pr-14">
          <div className="sr-only" aria-live="polite">
            {selected ? 'Selected' : 'Not selected'}
          </div>
          <hr className="border-zinc-700" />
        </div>
      ) : actionMode === 'edit' ? (
        <div className="pl-12 pr-14">
          <textarea
            ref={editTextareaRef}
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

              if (
                event.key === '@' &&
                !event.altKey &&
                !event.ctrlKey &&
                !event.metaKey
              ) {
                const cursorPosition = event.currentTarget.selectionStart
                const previousCharacter = cursorPosition > 0 ? editValue[cursorPosition - 1] : ''

                if (cursorPosition === 0 || /\s/.test(previousCharacter)) {
                  event.preventDefault()
                  onOpenEditCitationPicker(cursorPosition)
                }
              }
            }}
            rows={4}
            className="w-full resize-y rounded-2xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-zinc-100 outline-none focus:border-blue-500"
          />
          {isEditCitationPickerOpen && (
            <div className="mt-3 rounded-3xl border border-zinc-700 bg-zinc-900 p-3 shadow-2xl shadow-black/40">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-zinc-100">Cite a Block</p>
                <button
                  type="button"
                  onClick={onCloseEditCitationPicker}
                  className="rounded-full p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                  aria-label="Close citation picker"
                >
                  <CloseIcon />
                </button>
              </div>
              <input
                autoFocus
                value={editCitationQuery}
                onChange={(event) => onEditCitationQueryChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    onCloseEditCitationPicker()
                    return
                  }

                  if (event.key === 'Enter' && editCitationCandidates.length > 0) {
                    event.preventDefault()
                    onInsertEditCitation(editCitationCandidates[0])
                  }
                }}
                placeholder="Search blocks by text"
                className="mt-3 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-blue-500"
              />
              <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                {editCitationCandidates.map((candidate) => (
                  <CitationCandidateRow
                    key={candidate.id}
                    candidate={candidate}
                    onSelect={() => onInsertEditCitation(candidate)}
                  />
                ))}
                {!editCitationBusy && editCitationCandidates.length === 0 && (
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-3 py-4 text-sm text-zinc-500">
                    No text Blocks found.
                  </div>
                )}
              </div>
              {editCitationBusy && (
                <p className="mt-3 text-xs uppercase tracking-[0.2em] text-zinc-500">
                  Loading Blocks…
                </p>
              )}
            </div>
          )}
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
            onClick={handleBodyClick}
            className="prose prose-invert prose-sm max-w-none pl-12 pr-14 text-zinc-100 [&_a]:text-blue-400 [&_code]:text-zinc-300 [&_pre]:bg-zinc-800"
            dangerouslySetInnerHTML={{ __html: renderedBody }}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2 pl-12">
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
                disabled={!isSynced}
                className="rounded-full border border-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100"
              >
                + Tag
              </button>
              {isPickerOpen && (
                <div className="absolute left-0 top-[calc(100%+0.5rem)] z-10 w-[min(16rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] rounded-2xl border border-zinc-700 bg-zinc-900 p-3 shadow-2xl shadow-black/40 sm:left-auto sm:right-0">
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
                        <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                          New
                        </span>
                      </button>
                    )}
                    {!canCreateTag && suggestions.length === 0 && (
                      <div className="rounded-xl px-3 py-2 text-sm text-zinc-500">
                        No matching tags.
                      </div>
                    )}
                  </div>
                  {pickerBusy && <p className="mt-2 text-xs text-zinc-500">Updating tags…</p>}
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
  highlightedBlockId,
  highlightedBlockVersion,
  onBlocksReordered,
  onBlockUpdated,
  onBlockRemoved,
  onRetryBlock,
  onJumpToBlock,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevLenRef = useRef(blocks.length)
  const blocksRef = useRef(blocks)
  const dragSessionRef = useRef<{
    activeBlockId: string
    pointerId: number
    previewBlocks: ClientBlock[]
    ghostLabel: string
  } | null>(null)
  const blockGhostRef = useRef<HTMLDivElement>(null)
  const [availableTags, setAvailableTags] = useState<Tag[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [tagsByBlockId, setTagsByBlockId] = useState<Record<string, AppliedTag[]>>({})
  const [citationTargetsById, setCitationTargetsById] = useState<Record<string, CitationTarget>>({})
  const [pickerBlockId, setPickerBlockId] = useState<string | null>(null)
  const [pickerQuery, setPickerQuery] = useState('')
  const [editCitationPicker, setEditCitationPicker] = useState<EditCitationPickerState>(null)
  const [editCitationQuery, setEditCitationQuery] = useState('')
  const [editCitationCandidates, setEditCitationCandidates] = useState<CitationCandidate[]>([])
  const [editCitationBusy, setEditCitationBusy] = useState(false)
  const [editCursorPosition, setEditCursorPosition] = useState<{
    blockId: string
    position: number
  } | null>(null)
  const [actionState, setActionState] = useState<ActionState>(null)
  const [busyState, setBusyState] = useState<BusyState>(null)
  const [editValue, setEditValue] = useState('')
  const [selectionState, setSelectionState] = useState<SelectionState>(null)
  const [bulkActionMode, setBulkActionMode] = useState<BulkActionMode>(null)
  const [bulkBusyKind, setBulkBusyKind] = useState<'move' | 'delete' | null>(null)
  const [dragState, setDragState] = useState<DragState>(null)
  const [optimisticOrder, setOptimisticOrder] = useState<OptimisticOrderState>(null)
  const [reorderBusyBlockId, setReorderBusyBlockId] = useState<string | null>(null)

  useEffect(() => {
    blocksRef.current = blocks
  }, [blocks])

  const syncedBlocks = blocks.filter((block) => block.syncStatus !== 'failed' && block.syncStatus !== 'syncing')

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

    if (syncedBlocks.length === 0) {
      return () => {
        cancelled = true
      }
    }

    listTagsForBlocks(syncedBlocks.map((block) => block.id))
      .then((nextTagsByBlockId) => {
        if (!cancelled) setTagsByBlockId(nextTagsByBlockId)
      })
      .catch((error) => {
        report('error', 'Failed to load block tags', error)
      })

    return () => {
      cancelled = true
    }
  }, [syncedBlocks])

  useEffect(() => {
    let cancelled = false

    if (syncedBlocks.length === 0) {
      return () => {
        cancelled = true
      }
    }

    loadCitationTargetsForBlocks(syncedBlocks)
      .then((nextCitationTargetsById) => {
        if (!cancelled) {
          setCitationTargetsById(nextCitationTargetsById)
        }
      })
      .catch((error) => {
        report('error', 'Failed to load citation targets', error)
      })

    return () => {
      cancelled = true
    }
  }, [syncedBlocks])

  useEffect(() => {
    if (!highlightedBlockId) return

    const targetElement = document.querySelector<HTMLElement>(
      `[data-block-id="${highlightedBlockId}"]`,
    )

    if (!targetElement) return

    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightedBlockId, highlightedBlockVersion])

  useEffect(() => {
    if (!editCitationPicker) return

    let cancelled = false

    searchCitationCandidates(userId, editCitationQuery)
      .then((nextCandidates) => {
        if (!cancelled) {
          setEditCitationCandidates(nextCandidates)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          report('error', 'Failed to load edit citation candidates', error)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setEditCitationBusy(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [editCitationPicker, editCitationQuery, userId])

  const activePickerBlockId =
    pickerBlockId && blocks.some((block) => block.id === pickerBlockId && block.syncStatus === 'synced')
      ? pickerBlockId
      : null
  const activeEditCitationPicker =
    editCitationPicker && blocks.some((block) =>
      block.id === editCitationPicker.blockId && block.syncStatus === 'synced')
      ? editCitationPicker
      : null
  const activeActionState =
    actionState && blocks.some((block) =>
      block.id === actionState.blockId && block.syncStatus === 'synced')
      ? actionState
      : null
  const normalizedPickerQuery = normalizeTagQuery(pickerQuery)
  const suggestions =
    normalizedPickerQuery === ''
      ? availableTags.slice(0, maxTagSuggestions)
      : availableTags
          .filter((tag) => tag.name.includes(normalizedPickerQuery))
          .slice(0, maxTagSuggestions)
  const hasExactSuggestion = availableTags.some((tag) => tag.name === normalizedPickerQuery)
  const canCreateTag = normalizedPickerQuery !== '' && !hasExactSuggestion
  const activeDragBlocks =
    dragState?.conversationId === conversationId ? dragState.previewBlocks : null
  const activeOptimisticBlocks =
    optimisticOrder?.conversationId === conversationId &&
    !haveSameBlockOrder(optimisticOrder.blocks, blocks)
      ? optimisticOrder.blocks
      : null
  const displayBlocks = activeDragBlocks ?? activeOptimisticBlocks ?? blocks
  const activeSelectedBlockIds =
    selectionState?.conversationId === conversationId ? selectionState.blockIds : []
  const selectedBlockIdSet = new Set(activeSelectedBlockIds)
  const selectedBlocks = displayBlocks.filter((block) => selectedBlockIdSet.has(block.id))
  const activeBulkActionMode = selectedBlocks.length > 0 ? bulkActionMode : null
  const bulkMoveDestinations = conversations.filter((conversation) => conversation.id !== conversationId)
  const selectionLocked = Boolean(busyState || reorderBusyBlockId || bulkBusyKind)

  function resetTransientUi() {
    setPickerBlockId(null)
    setPickerQuery('')
    setEditCitationPicker(null)
    setEditCitationQuery('')
    setEditCitationCandidates([])
    setEditCitationBusy(false)
    setEditCursorPosition(null)
    setActionState(null)
    setBulkActionMode(null)
    setEditValue('')
  }

  function clearSelection() {
    setSelectionState(null)
    setBulkActionMode(null)
  }

  function toggleSelectedBlock(blockId: string) {
    if (selectionLocked) return
    const block = displayBlocks.find((item) => item.id === blockId)
    if (!block || block.syncStatus !== 'synced') return

    const currentIds = selectionState?.conversationId === conversationId ? selectionState.blockIds : []
    const nextIds = currentIds.includes(blockId)
      ? currentIds.filter((id) => id !== blockId)
      : [...currentIds, blockId]

    if (nextIds.length === 0) {
      setSelectionState(null)
      setBulkActionMode(null)
      return
    }

    setSelectionState({
      conversationId,
      blockIds: nextIds,
    })
  }

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
    const clientBlock = blocks.find((item) => item.id === block.id)
    if (clientBlock?.syncStatus !== 'synced') return
    resetTransientUi()
    setActionState({ blockId: block.id, mode })
    setEditValue(mode === 'edit' ? block.body ?? '' : '')
  }

  function closeAction(blockId?: string) {
    setActionState((current) => {
      if (!current) return current
      if (blockId && current.blockId !== blockId) return current
      return null
    })
    setEditCitationPicker((current) => {
      if (!current) return current
      if (blockId && current.blockId !== blockId) return current
      return null
    })
    setEditCitationQuery('')
    setEditCitationCandidates([])
    setEditCitationBusy(false)
    setEditCursorPosition((current) => {
      if (!current) return current
      if (blockId && current.blockId !== blockId) return current
      return null
    })
    setEditValue('')
  }

  function openEditCitationPicker(blockId: string, insertionIndex: number) {
    setEditCitationBusy(true)
    setEditCitationQuery('')
    setEditCitationCandidates([])
    setEditCitationPicker({ blockId, insertionIndex })
  }

  function closeEditCitationPicker(blockId?: string) {
    setEditCitationPicker((current) => {
      if (!current) return current
      if (blockId && current.blockId !== blockId) return current
      return null
    })
    setEditCitationQuery('')
    setEditCitationCandidates([])
    setEditCitationBusy(false)
  }

  function insertEditCitation(blockId: string, candidate: CitationCandidate) {
    const pickerState =
      editCitationPicker?.blockId === blockId ? editCitationPicker : null
    if (!pickerState) return

    const token = `{{block:${candidate.id}}}`
    const nextCursorPosition = pickerState.insertionIndex + token.length

    setEditValue((current) =>
      current.slice(0, pickerState.insertionIndex) +
      token +
      current.slice(pickerState.insertionIndex),
    )
    setEditCursorPosition({ blockId, position: nextCursorPosition })
    closeEditCitationPicker(blockId)
  }

  function getDropIndex(pointerY: number, activeBlockId: string): number {
    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[data-block-id]') ?? [],
    ).filter((item) => item.dataset.blockId !== activeBlockId)

    for (const [index, item] of items.entries()) {
      const rect = item.getBoundingClientRect()
      const midpoint = rect.top + rect.height / 2
      if (pointerY < midpoint) return index
    }

    return items.length
  }

  async function persistBlockOrder(nextBlocks: Block[], activeBlockId: string) {
    setReorderBusyBlockId(activeBlockId)
    try {
      const reorderedBlocks = await reorderBlocks(nextBlocks)
      setOptimisticOrder({
        conversationId,
        blocks: reorderedBlocks,
      })
      onBlocksReordered(reorderedBlocks)
    } catch (error) {
      setOptimisticOrder(null)
      report('error', 'Failed to reorder blocks', error)
    } finally {
      setReorderBusyBlockId((current) => (current === activeBlockId ? null : current))
    }
  }

  function handleDragHandlePointerDown(block: Block, event: React.PointerEvent<HTMLButtonElement>) {
    const clientBlock = blocks.find((item) => item.id === block.id)
    if (busyState || reorderBusyBlockId || bulkBusyKind || clientBlock?.syncStatus !== 'synced') return

    event.preventDefault()
    event.stopPropagation()
    listRef.current?.setPointerCapture(event.pointerId)
    resetTransientUi()

    const previewBlocks =
      optimisticOrder?.conversationId === conversationId ? optimisticOrder.blocks : blocksRef.current
    const ghostLabel = block.type === 'divider'
      ? '———'
      : (block.body ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
    dragSessionRef.current = {
      activeBlockId: block.id,
      pointerId: event.pointerId,
      previewBlocks,
      ghostLabel,
    }
    setDragState({
      activeBlockId: block.id,
      conversationId,
      previewBlocks,
      ghostLabel,
    })
    if (blockGhostRef.current) blockGhostRef.current.style.top = `${event.clientY - 20}px`
  }

  function handleDragHandlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const session = dragSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return

    event.preventDefault()
    if (blockGhostRef.current) blockGhostRef.current.style.top = `${event.clientY - 20}px`

    const nextPreviewBlocks = moveBlockToIndex(
      session.previewBlocks,
      session.activeBlockId,
      getDropIndex(event.clientY, session.activeBlockId),
    )

    if (haveSameBlockOrder(nextPreviewBlocks, session.previewBlocks)) return

    session.previewBlocks = nextPreviewBlocks
    setDragState({
      activeBlockId: session.activeBlockId,
      conversationId,
      previewBlocks: nextPreviewBlocks,
      ghostLabel: session.ghostLabel,
    })
  }

  function finishDrag(event: React.PointerEvent<HTMLDivElement>) {
    const session = dragSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return

    dragSessionRef.current = null

    listRef.current?.releasePointerCapture(event.pointerId)
    const nextPreviewBlocks = session.previewBlocks
    const currentBlocks =
      optimisticOrder?.conversationId === conversationId ? optimisticOrder.blocks : blocksRef.current

    setDragState(null)
    if (blockGhostRef.current) blockGhostRef.current.style.top = '-9999px'

    if (haveSameBlockOrder(nextPreviewBlocks, currentBlocks)) return

    setOptimisticOrder({
      conversationId,
      blocks: nextPreviewBlocks,
    })
    void persistBlockOrder(nextPreviewBlocks, session.activeBlockId)
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
          [blockId]: [...currentTags, { ...tag, sources: [pickerTagSource] }].sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
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
      report('error', 'Failed to remove picker tag from block', error)
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
      await Promise.all([
        reconcileInlineTagsForBlock(block.id, nextBody, userId),
        reconcileBlockReferences(block.id, nextBody),
      ])
      onBlockUpdated(updatedBlock)
      await Promise.all([refreshAvailableTags(), refreshBlockTags(block.id)])
      closeAction(block.id)
    } catch (error) {
      if (updatedBlock) {
        onBlockUpdated(updatedBlock)
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

  async function handleMoveSelectedBlocks(destinationConversationId: string) {
    if (selectedBlocks.length === 0 || destinationConversationId === conversationId) {
      setBulkActionMode(null)
      return
    }

    const positions = createSequentialPositions(selectedBlocks.length)

    setBulkBusyKind('move')
    try {
      await Promise.all(
        selectedBlocks.map((block, index) =>
          moveBlockToConversation({
            blockId: block.id,
            conversationId: destinationConversationId,
            position: positions[index],
          }),
        ),
      )

      setTagsByBlockId((prev) => {
        const next = { ...prev }
        for (const block of selectedBlocks) {
          delete next[block.id]
        }
        return next
      })

      for (const block of selectedBlocks) {
        onBlockRemoved(block.id)
      }

      clearSelection()
    } catch (error) {
      report('error', 'Failed to move selected blocks', error)
    } finally {
      setBulkBusyKind(null)
    }
  }

  async function handleDeleteSelectedBlocks() {
    if (selectedBlocks.length === 0) {
      setBulkActionMode(null)
      return
    }

    setBulkBusyKind('delete')
    try {
      await Promise.all(selectedBlocks.map((block) => deleteBlock(block.id)))

      setTagsByBlockId((prev) => {
        const next = { ...prev }
        for (const block of selectedBlocks) {
          delete next[block.id]
        }
        return next
      })

      for (const block of selectedBlocks) {
        onBlockRemoved(block.id)
      }

      clearSelection()
    } catch (error) {
      report('error', 'Failed to delete selected blocks', error)
    } finally {
      setBulkBusyKind(null)
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
    <>
    <div
      ref={blockGhostRef}
      className="pointer-events-none fixed z-50 rounded-xl border border-zinc-600 bg-zinc-800 px-4 py-2.5 text-sm text-zinc-200 shadow-2xl shadow-black/70 truncate"
      style={{ top: -9999, left: '50%', transform: 'translateX(-50%)', width: 'min(600px, calc(100vw - 32px))' }}
    >
      {dragState?.ghostLabel}
    </div>
    <div className={`min-h-0 flex-1 overflow-y-auto px-4 py-4${dragState ? ' touch-none' : ''}`}>
      <div
        ref={listRef}
        className="mx-auto max-w-2xl space-y-3"
        onPointerMove={handleDragHandlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onLostPointerCapture={finishDrag}
      >
        {selectedBlocks.length > 0 && (
          <div className="sticky top-0 z-20 rounded-3xl border border-zinc-700 bg-zinc-900/95 p-3 shadow-2xl shadow-black/30 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-zinc-100">
                  {selectedBlocks.length} {selectedBlocks.length === 1 ? 'block' : 'blocks'} selected
                </p>
                <p className="text-xs text-zinc-500">
                  Move or delete the current selection.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBulkActionMode((current) => (current === 'move' ? null : 'move'))}
                  disabled={selectionLocked}
                  className="rounded-full border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Move
                </button>
                <button
                  type="button"
                  onClick={() => setBulkActionMode((current) => (current === 'delete' ? null : 'delete'))}
                  disabled={selectionLocked}
                  className="rounded-full border border-red-900/70 px-3 py-1.5 text-sm text-red-300 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={selectionLocked}
                  className="rounded-full border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Clear
                </button>
              </div>
            </div>

            {activeBulkActionMode === 'move' && (
              <div className="mt-3 rounded-2xl border border-zinc-700 bg-zinc-950/70 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-zinc-100">Move selected blocks</p>
                  <button
                    type="button"
                    onClick={() => setBulkActionMode(null)}
                    className="rounded-full p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                    aria-label="Close bulk move picker"
                  >
                    <CloseIcon />
                  </button>
                </div>
                {bulkMoveDestinations.length === 0 ? (
                  <p className="rounded-xl bg-zinc-950 px-3 py-2 text-sm text-zinc-500">
                    No other conversations yet.
                  </p>
                ) : (
                  <div className="max-h-64 space-y-3 overflow-y-auto">
                    {folders.map((folder) => {
                      const folderConversations = bulkMoveDestinations.filter(
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
                                onClick={() => void handleMoveSelectedBlocks(conversation.id)}
                                disabled={Boolean(bulkBusyKind)}
                                className="w-full rounded-xl px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
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

            {activeBulkActionMode === 'delete' && (
              <div className="mt-3 rounded-2xl border border-red-900/80 bg-zinc-950/70 p-3">
                <p className="text-sm text-zinc-100">
                  Delete {selectedBlocks.length} {selectedBlocks.length === 1 ? 'selected block' : 'selected blocks'}?
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  This removes the selected blocks from the current conversation.
                </p>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setBulkActionMode(null)}
                    disabled={Boolean(bulkBusyKind)}
                    className="rounded-full border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteSelectedBlocks()}
                    disabled={Boolean(bulkBusyKind)}
                    className="rounded-full bg-red-700 px-3 py-1.5 text-sm text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Delete selected
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {displayBlocks.map((block) => (
          <BlockItem
            key={block.id}
            block={block}
            tags={tagsByBlockId[block.id] ?? []}
            folders={folders}
            conversations={conversations}
            citationTargetsById={citationTargetsById}
            highlighted={highlightedBlockId === block.id}
            actionMode={activeActionState?.blockId === block.id ? activeActionState.mode : null}
            isPickerOpen={activePickerBlockId === block.id}
            isEditCitationPickerOpen={activeEditCitationPicker?.blockId === block.id}
            pickerQuery={pickerQuery}
            pickerBusy={busyState?.blockId === block.id && busyState.kind === 'tag'}
            editValue={activeActionState?.blockId === block.id ? editValue : block.body ?? ''}
            editCitationQuery={activeEditCitationPicker?.blockId === block.id ? editCitationQuery : ''}
            editCitationBusy={activeEditCitationPicker?.blockId === block.id && editCitationBusy}
            editCitationCandidates={
              activeEditCitationPicker?.blockId === block.id ? editCitationCandidates : []
            }
            editCursorPosition={editCursorPosition?.blockId === block.id ? editCursorPosition.position : null}
            blockBusy={
              busyState?.blockId === block.id
                ? busyState.kind
                : selectedBlockIdSet.has(block.id) && bulkBusyKind
                  ? bulkBusyKind
                : reorderBusyBlockId === block.id
                  ? 'move'
                  : null
            }
            syncStatus={block.syncStatus ?? 'synced'}
            syncErrorMessage={block.syncErrorMessage}
            selected={selectedBlockIdSet.has(block.id)}
            selectionDisabled={selectionLocked}
            isDragging={dragState?.activeBlockId === block.id}
            dragDisabled={Boolean(
              busyState ||
              bulkBusyKind ||
              reorderBusyBlockId ||
              (activeActionState?.blockId === block.id && activeActionState.mode === 'edit'),
            )}
            suggestions={suggestions}
            canCreateTag={canCreateTag}
            onToggleSelected={() => toggleSelectedBlock(block.id)}
            onDragHandlePointerDown={(event) => handleDragHandlePointerDown(block, event)}
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
            onOpenEditCitationPicker={(insertionIndex) =>
              openEditCitationPicker(block.id, insertionIndex)}
            onCloseEditCitationPicker={() => closeEditCitationPicker(block.id)}
            onEditCitationQueryChange={(value) => {
              setEditCitationBusy(true)
              setEditCitationQuery(value)
            }}
            onInsertEditCitation={(candidate) => insertEditCitation(block.id, candidate)}
            onEditCursorApplied={() =>
              setEditCursorPosition((current) =>
                current?.blockId === block.id ? null : current,
              )}
            onEditValueChange={setEditValue}
            onSaveEdit={() => void handleSaveEdit(block)}
            onStartMove={() => openAction(block, 'move')}
            onMoveToConversation={(destinationConversationId) =>
              void handleMoveBlock(block, destinationConversationId)}
            onStartDelete={() => openAction(block, 'delete')}
            onConfirmDelete={() => void handleDeleteBlock(block)}
            onRetrySync={() => onRetryBlock(block.id)}
            onJumpToBlock={onJumpToBlock}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
    </>
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
        destructive ? 'text-red-300 hover:bg-red-950/40' : 'text-zinc-200 hover:bg-zinc-800'
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

function GripIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="4" r="1" />
      <circle cx="11" cy="4" r="1" />
      <circle cx="5" cy="8" r="1" />
      <circle cx="11" cy="8" r="1" />
      <circle cx="5" cy="12" r="1" />
      <circle cx="11" cy="12" r="1" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3.5 8.5 6.5 11.5 12.5 5.5" />
    </svg>
  )
}
