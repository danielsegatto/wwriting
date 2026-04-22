/// <reference types="node" />

import assert from 'node:assert/strict'
import test from 'node:test'
import { renderMarkdown } from './markdown.ts'
import type { CitationTarget } from './references.ts'

const citedBlockId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

function makeCitationTarget(overrides?: Partial<CitationTarget>): CitationTarget {
  return {
    id: citedBlockId,
    body: 'Referenced block body',
    conversationId: 'conversation-1',
    conversationName: 'My Notes',
    deleted: false,
    ...overrides,
  }
}

test('renderMarkdown renders live citations as clickable pills', () => {
  const html = renderMarkdown(
    `See {{block:${citedBlockId}}}`,
    { [citedBlockId]: makeCitationTarget() },
  )

  assert.match(html, /data-citation-target-id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"/)
  assert.match(html, /Referenced block body/)
})

test('renderMarkdown renders deleted citations without click metadata', () => {
  const html = renderMarkdown(`See {{block:${citedBlockId}}}`, {})

  assert.match(html, /\[deleted\]/)
  assert.doesNotMatch(html, /data-citation-target-id=/)
})

test('renderMarkdown preserves regular markdown around citation pills', () => {
  const html = renderMarkdown(
    `**Bold** then {{block:${citedBlockId}}}`,
    { [citedBlockId]: makeCitationTarget() },
  )

  assert.match(html, /<strong>Bold<\/strong>/)
  assert.match(html, /data-citation-target-id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"/)
})
