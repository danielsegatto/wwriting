import { useEffect, useRef, useState, useCallback } from 'react'
import { listFolders, createFolder } from '../../lib/folders.ts'
import { listConversations, createConversation } from '../../lib/conversations.ts'
import type { Folder } from '../../lib/folders.ts'
import type { Conversation } from '../../lib/conversations.ts'

type CreatingState =
  | { type: 'folder' }
  | { type: 'conversation'; folderId: string }
  | null

type Props = {
  userId: string
  selectedConversationId: string | null
  onSelectConversation: (id: string) => void
}

export function Sidebar({ userId, selectedConversationId, onSelectConversation }: Props) {
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

  return (
    <div className="flex h-screen w-56 flex-shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Conversations
        </span>
        <button
          onClick={() => setCreating({ type: 'folder' })}
          title="New folder"
          className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
        >
          <PlusIcon />
        </button>
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
              creatingConversation={creating?.type === 'conversation' && creating.folderId === folder.id}
              onConversationCreated={handleCreateConversation}
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
  creatingConversation: boolean
  onConversationCreated: (name: string) => void
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
  creatingConversation,
  onConversationCreated,
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
      </button>
      {!collapsed &&
        conversations.map((conv) => (
          <ConversationRow
            key={conv.id}
            conversation={conv}
            selected={conv.id === selectedConversationId}
            onSelect={onSelectConversation}
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
}: {
  conversation: Conversation
  selected: boolean
  onSelect: (id: string) => void
}) {
  return (
    <button
      onClick={() => onSelect(conversation.id)}
      className={`flex w-full items-center rounded py-1.5 pl-6 pr-2 text-left text-sm truncate ${
        selected
          ? 'bg-zinc-800 text-zinc-100'
          : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
      }`}
    >
      {conversation.name}
    </button>
  )
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
