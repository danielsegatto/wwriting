import { useEffect, useRef, useState, useCallback } from 'react'
import { listFolders, createFolder, deleteFolder } from '../../lib/folders.ts'
import { listConversations, createConversation, deleteConversation } from '../../lib/conversations.ts'
import type { Folder } from '../../lib/folders.ts'
import type { Conversation } from '../../lib/conversations.ts'
import { supabase } from '../../lib/supabase.ts'
import { report } from '../../lib/errors.ts'

type CreatingState =
  | { type: 'folder' }
  | { type: 'conversation'; folderId: string }
  | null

type Props = {
  userId: string
  selectedConversationId: string | null
  onSelectConversation: (id: string) => void
  onConversationDeleted: (nextConversationId: string | null) => void
  onClose: () => void
}

export function Sidebar({
  userId,
  selectedConversationId,
  onSelectConversation,
  onConversationDeleted,
  onClose,
}: Props) {
  const [folders, setFolders] = useState<Folder[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState<CreatingState>(null)

  useEffect(() => {
    Promise.all([listFolders(userId), listConversations(userId)]).then(
      ([f, c]) => {
        setFolders(f)
        setConversations(c)
      }
    )
  }, [userId])

  // Realtime sync for folders and conversations
  useEffect(() => {
    const channel = supabase
      .channel(`sidebar:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'folders',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const folder = payload.new as Folder
            setFolders((prev) =>
              prev.some((f) => f.id === folder.id) ? prev : [...prev, folder],
            )
          } else if (payload.eventType === 'UPDATE') {
            const folder = payload.new as Folder
            setFolders((prev) => prev.map((f) => (f.id === folder.id ? folder : f)))
          } else if (payload.eventType === 'DELETE') {
            const folderId = (payload.old as { id: string }).id
            setFolders((prev) => prev.filter((f) => f.id !== folderId))
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const conv = payload.new as Conversation
            setConversations((prev) =>
              prev.some((c) => c.id === conv.id) ? prev : [...prev, conv],
            )
          } else if (payload.eventType === 'UPDATE') {
            const conv = payload.new as Conversation
            setConversations((prev) => prev.map((c) => (c.id === conv.id ? conv : c)))
          } else if (payload.eventType === 'DELETE') {
            const convId = (payload.old as { id: string }).id
            setConversations((prev) => prev.filter((c) => c.id !== convId))
          }
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          report('warn', 'Sidebar realtime subscription error — changes from other devices will not appear live')
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  const toggleCollapse = useCallback((folderId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }, [])

  const handleCreateFolder = useCallback(async (name: string) => {
    setCreating(null)
    try {
      const folder = await createFolder(userId, name)
      setFolders((prev) => [...prev, folder])
    } catch {
      // already reported inside createFolder
    }
  }, [userId])

  const handleCreateConversation = useCallback(async (name: string) => {
    if (creating?.type !== 'conversation') return
    const { folderId } = creating
    setCreating(null)
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.delete(folderId)
      return next
    })
    try {
      const conv = await createConversation(userId, folderId, name)
      setConversations((prev) => [...prev, conv])
      onSelectConversation(conv.id)
    } catch {
      // already reported inside createConversation
    }
  }, [creating, userId, onSelectConversation])

  const handleDeleteConversation = useCallback(async (conversationId: string) => {
    const conversation = conversations.find((item) => item.id === conversationId)
    if (!conversation) return

    const confirmed = window.confirm(`Delete conversation "${conversation.name}"?`)
    if (!confirmed) return

    const nextConversationId = getNextConversationIdAfterConversationDelete(
      conversations,
      conversationId,
      selectedConversationId,
    )

    try {
      await deleteConversation(conversationId)
      setConversations((prev) => prev.filter((conversation) => conversation.id !== conversationId))
      if (selectedConversationId === conversationId) onConversationDeleted(nextConversationId)
    } catch {
      // already reported inside deleteConversation
    }
  }, [conversations, selectedConversationId, onConversationDeleted])

  const handleDeleteFolder = useCallback(async (folderId: string) => {
    const folder = folders.find((item) => item.id === folderId)
    if (!folder) return

    const folderIdsToDelete = getDescendantFolderIds(folders, folderId)
    const conversationsToDelete = conversations.filter((conversation) =>
      folderIdsToDelete.has(conversation.folder_id),
    )
    const conversationLabel = conversationsToDelete.length === 1 ? 'conversation' : 'conversations'
    const confirmed = window.confirm(
      `Delete folder "${folder.name}" and ${conversationsToDelete.length} ${conversationLabel} inside it?`,
    )
    if (!confirmed) return

    const nextConversationId = getNextConversationIdAfterFolderDelete(
      conversations,
      folderIdsToDelete,
      selectedConversationId,
    )

    try {
      await deleteFolder(folderId)
      setFolders((prev) => prev.filter((folder) => !folderIdsToDelete.has(folder.id)))
      setConversations((prev) => prev.filter((conversation) => !folderIdsToDelete.has(conversation.folder_id)))
      setCollapsed((prev) => {
        const next = new Set(prev)
        folderIdsToDelete.forEach((id) => next.delete(id))
        return next
      })
      if (selectedConversationId && conversations.some(
        (conversation) =>
          conversation.id === selectedConversationId && folderIdsToDelete.has(conversation.folder_id),
      )) {
        onConversationDeleted(nextConversationId)
      }
    } catch {
      // already reported inside deleteFolder
    }
  }, [folders, conversations, selectedConversationId, onConversationDeleted])

  return (
    <div className="flex h-full min-h-0 w-56 flex-shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Conversations
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCreating({ type: 'folder' })}
            title="New folder"
            className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          >
            <PlusIcon />
          </button>
          <button
            onClick={onClose}
            title="Hide sidebar"
            className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          >
            <CloseIcon />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-1 pb-4">
        {folders.length === 0 && creating?.type !== 'folder' ? (
          <p className="px-3 py-2 text-xs text-zinc-600">No conversations yet.</p>
        ) : (
          folders.map((folder) => (
            <FolderRow
              key={folder.id}
              folder={folder}
              conversations={conversations.filter((c) => c.folder_id === folder.id)}
              collapsed={collapsed.has(folder.id)}
              selectedConversationId={selectedConversationId}
              onToggle={toggleCollapse}
              onSelectConversation={onSelectConversation}
              onCreateConversation={() => setCreating({ type: 'conversation', folderId: folder.id })}
              onDeleteFolder={handleDeleteFolder}
              creatingConversation={creating?.type === 'conversation' && creating.folderId === folder.id}
              onConversationCreated={handleCreateConversation}
              onDeleteConversation={handleDeleteConversation}
              onCancelCreate={() => setCreating(null)}
            />
          ))
        )}
        {creating?.type === 'folder' && (
          <InlineInput
            placeholder="Folder name"
            onConfirm={handleCreateFolder}
            onCancel={() => setCreating(null)}
          />
        )}
      </div>
    </div>
  )
}

type FolderRowProps = {
  folder: Folder
  conversations: Conversation[]
  collapsed: boolean
  selectedConversationId: string | null
  onToggle: (id: string) => void
  onSelectConversation: (id: string) => void
  onCreateConversation: () => void
  onDeleteFolder: (id: string) => void
  creatingConversation: boolean
  onConversationCreated: (name: string) => void
  onDeleteConversation: (id: string) => void
  onCancelCreate: () => void
}

function FolderRow({
  folder,
  conversations,
  collapsed,
  selectedConversationId,
  onToggle,
  onSelectConversation,
  onCreateConversation,
  onDeleteFolder,
  creatingConversation,
  onConversationCreated,
  onDeleteConversation,
  onCancelCreate,
}: FolderRowProps) {
  return (
    <div>
      <button
        onClick={() => onToggle(folder.id)}
        className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
      >
        <ChevronIcon collapsed={collapsed} />
        <span className="flex-1 truncate">{folder.name}</span>
        <span
          role="button"
          onClick={(e) => { e.stopPropagation(); onCreateConversation() }}
          className="ml-auto rounded p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300"
          title="New conversation"
        >
          <PlusIcon />
        </span>
        <span
          role="button"
          onClick={(e) => { e.stopPropagation(); onDeleteFolder(folder.id) }}
          className="rounded p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300"
          title="Delete folder"
        >
          <TrashIcon />
        </span>
      </button>
      {!collapsed &&
        conversations.map((conv) => (
          <ConversationRow
            key={conv.id}
            conversation={conv}
            selected={conv.id === selectedConversationId}
            onSelect={onSelectConversation}
            onDelete={onDeleteConversation}
          />
        ))}
      {!collapsed && creatingConversation && (
        <InlineInput
          placeholder="Conversation name"
          onConfirm={onConversationCreated}
          onCancel={onCancelCreate}
          indent
        />
      )}
    </div>
  )
}

function ConversationRow({
  conversation,
  selected,
  onSelect,
  onDelete,
}: {
  conversation: Conversation
  selected: boolean
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}) {
  return (
    <div
      className={`flex w-full items-center rounded py-1.5 pl-6 pr-2 text-sm ${
        selected
          ? 'bg-zinc-800 text-zinc-100'
          : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
      }`}
    >
      <button
        onClick={() => onSelect(conversation.id)}
        className="min-w-0 flex-1 truncate text-left"
      >
        {conversation.name}
      </button>
      <button
        onClick={() => onDelete(conversation.id)}
        className="ml-2 rounded p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300"
        title="Delete conversation"
      >
        <TrashIcon />
      </button>
    </div>
  )
}

function getDescendantFolderIds(folders: Folder[], rootFolderId: string): Set<string> {
  const folderIds = new Set<string>([rootFolderId])
  let changed = true

  while (changed) {
    changed = false
    for (const folder of folders) {
      if (folder.parent_id && folderIds.has(folder.parent_id) && !folderIds.has(folder.id)) {
        folderIds.add(folder.id)
        changed = true
      }
    }
  }

  return folderIds
}

function getNextConversationIdAfterConversationDelete(
  conversations: Conversation[],
  conversationId: string,
  selectedConversationId: string | null,
): string | null {
  if (selectedConversationId !== conversationId) return selectedConversationId

  const remaining = conversations.filter((conversation) => conversation.id !== conversationId)
  return remaining[0]?.id ?? null
}

function getNextConversationIdAfterFolderDelete(
  conversations: Conversation[],
  folderIdsToDelete: Set<string>,
  selectedConversationId: string | null,
): string | null {
  if (!selectedConversationId) return null

  const selectedConversation = conversations.find((conversation) => conversation.id === selectedConversationId)
  if (!selectedConversation || !folderIdsToDelete.has(selectedConversation.folder_id)) {
    return selectedConversationId
  }

  const remaining = conversations.filter((conversation) => !folderIdsToDelete.has(conversation.folder_id))
  return remaining[0]?.id ?? null
}

function InlineInput({
  placeholder,
  onConfirm,
  onCancel,
  indent = false,
}: {
  placeholder: string
  onConfirm: (name: string) => void
  onCancel: () => void
  indent?: boolean
}) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  const confirm = useCallback(() => {
    const trimmed = value.trim()
    if (trimmed) onConfirm(trimmed)
  }, [value, onConfirm])

  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') confirm()
        if (e.key === 'Escape') onCancel()
      }}
      onBlur={onCancel}
      placeholder={placeholder}
      className={`w-full rounded bg-zinc-800 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none ring-1 ring-zinc-700 focus:ring-zinc-500 ${
        indent ? 'pl-6 pr-2' : 'px-2'
      }`}
    />
  )
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      className="h-3 w-3 flex-shrink-0 text-zinc-500"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {collapsed ? (
        <polyline points="4,2 8,6 4,10" />
      ) : (
        <polyline points="2,4 6,8 10,4" />
      )}
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="2" y1="2" x2="10" y2="10" />
      <line x1="10" y1="2" x2="2" y2="10" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg
      className="h-3 w-3"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <line x1="6" y1="2" x2="6" y2="10" />
      <line x1="2" y1="6" x2="10" y2="6" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg
      className="h-3 w-3"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 3.5h7" />
      <path d="M4.5 2h3" />
      <path d="M4 5v3.5" />
      <path d="M6 5v3.5" />
      <path d="M8 5v3.5" />
      <path d="M3.5 3.5v5.5a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1V3.5" />
    </svg>
  )
}
