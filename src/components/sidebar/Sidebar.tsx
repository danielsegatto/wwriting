import { useEffect, useState, useCallback } from 'react'
import { listFolders } from '../../lib/folders.ts'
import { listConversations } from '../../lib/conversations.ts'
import type { Folder } from '../../lib/folders.ts'
import type { Conversation } from '../../lib/conversations.ts'

type Props = {
  userId: string
  selectedConversationId: string | null
  onSelectConversation: (id: string) => void
}

export function Sidebar({ userId, selectedConversationId, onSelectConversation }: Props) {
  const [folders, setFolders] = useState<Folder[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

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

  return (
    <div className="flex h-screen w-56 flex-shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
      <div className="px-3 py-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Conversations
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-1 pb-4">
        {folders.length === 0 ? (
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
            />
          ))
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
}

function FolderRow({
  folder,
  conversations,
  collapsed,
  selectedConversationId,
  onToggle,
  onSelectConversation,
}: FolderRowProps) {
  return (
    <div>
      <button
        onClick={() => onToggle(folder.id)}
        className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
      >
        <ChevronIcon collapsed={collapsed} />
        <span className="truncate">{folder.name}</span>
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
