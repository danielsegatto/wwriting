import { marked } from 'marked'
import {
  citationPillPreviewLength,
} from './constants.ts'
import { citationTokenSource } from './references.ts'
import type { CitationTarget } from './references.ts'

marked.setOptions({ gfm: true, breaks: true })

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function getPreviewText(body: string, maxLength = citationPillPreviewLength): string {
  const normalized = body.replace(/\s+/g, ' ').trim()

  if (normalized === '') {
    return '[empty]'
  }

  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength).trimEnd()}…`
}

function renderCitationToken(target: CitationTarget | undefined): string {
  if (!target || target.deleted || !target.conversationId) {
    return '<span class="not-prose inline-flex rounded-full border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">[deleted]</span>'
  }

  return [
    '<button',
    ' type="button"',
    ' data-citation-target-id="', escapeHtml(target.id), '"',
    ' class="not-prose inline-flex items-center gap-1 rounded-full border border-blue-900/80 bg-blue-950/80 px-2 py-0.5 text-xs font-medium text-blue-200 align-middle transition hover:border-blue-700 hover:bg-blue-900/70"',
    ' title="Jump to cited block"',
    '>',
    '<span aria-hidden="true">↪</span>',
    '<span>', escapeHtml(getPreviewText(target.body)), '</span>',
    '</button>',
  ].join('')
}

export function renderMarkdown(
  src: string,
  citationTargetsById: Record<string, CitationTarget>,
): string {
  const citationRegex = new RegExp(citationTokenSource, 'gi')
  const markdownWithCitationHtml = src.replace(citationRegex, (_, targetId: string) =>
    renderCitationToken(citationTargetsById[targetId.toLowerCase()]),
  )

  return marked.parse(markdownWithCitationHtml) as string
}
