import type { Block } from './blocks.ts'
import { getPreviewText } from './markdown.ts'
import { citationTokenSource } from './references.ts'
import type { CitationTarget } from './references.ts'

type ExportableBlock = Pick<Block, 'id' | 'type' | 'body'>

type SerializeConversationToMarkdownParams = {
  conversationName: string
  blocks: ExportableBlock[]
  citationTargetsById: Record<string, CitationTarget>
  appBaseUrl: string
}

const repeatedDashPattern = /-{2,}/g
const repeatedWhitespacePattern = /\s+/g

export function serializeConversationToMarkdown({
  conversationName,
  blocks,
  citationTargetsById,
  appBaseUrl,
}: SerializeConversationToMarkdownParams): string {
  const lines = [`# ${conversationName}`, '']

  for (const block of blocks) {
    if (block.type === 'divider') {
      lines.push('---', '')
      continue
    }

    lines.push(
      replaceCitationTokensWithMarkdownLinks(
        block.body ?? '',
        citationTargetsById,
        appBaseUrl,
      ),
      '',
    )
  }

  return lines.join('\n')
}

export function createConversationMarkdownFilename(conversationName: string): string {
  const sanitized = conversationName
    .trim()
    .split('')
    .map((character) => (isInvalidFilenameCharacter(character) ? '-' : character))
    .join('')
    .replace(repeatedWhitespacePattern, ' ')
    .replace(repeatedDashPattern, '-')
    .replace(/^[-.\s]+|[-.\s]+$/g, '')

  return `${sanitized || 'conversation'}.md`
}

function replaceCitationTokensWithMarkdownLinks(
  body: string,
  citationTargetsById: Record<string, CitationTarget>,
  appBaseUrl: string,
): string {
  return body.replace(new RegExp(citationTokenSource, 'gi'), (_, targetId: string) => {
    const target = citationTargetsById[targetId.toLowerCase()]

    if (!target || target.deleted || !target.conversationId) {
      return '[deleted]'
    }

    const previewText = escapeMarkdownLinkText(getPreviewText(target.body))
    const href = new URL(`/b/${target.id}`, appBaseUrl).toString()

    return `[${previewText}](${href})`
  })
}

function escapeMarkdownLinkText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')
}

function isInvalidFilenameCharacter(character: string): boolean {
  const code = character.charCodeAt(0)

  return (
    code < 32 ||
    character === '<' ||
    character === '>' ||
    character === ':' ||
    character === '"' ||
    character === '/' ||
    character === '\\' ||
    character === '|' ||
    character === '?' ||
    character === '*'
  )
}
