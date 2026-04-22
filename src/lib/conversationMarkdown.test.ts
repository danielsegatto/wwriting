/// <reference types="node" />

import assert from 'node:assert/strict'
import test from 'node:test'
import { createConversationMarkdownFilename, serializeConversationToMarkdown } from './conversationMarkdown.ts'
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

test('serializeConversationToMarkdown exports a titled conversation with dividers and citations', () => {
  const markdown = serializeConversationToMarkdown({
    conversationName: 'My Notes',
    appBaseUrl: 'https://example.com',
    citationTargetsById: {
      [citedBlockId]: makeCitationTarget(),
    },
    blocks: [
      {
        id: 'block-1',
        type: 'text',
        body: 'Alpha block',
      },
      {
        id: 'block-2',
        type: 'divider',
        body: '---',
      },
      {
        id: 'block-3',
        type: 'text',
        body: `See {{block:${citedBlockId}}}`,
      },
    ],
  })

  assert.equal(
    markdown,
    [
      '# My Notes',
      '',
      'Alpha block',
      '',
      '---',
      '',
      `See [Referenced block body](https://example.com/b/${citedBlockId})`,
      '',
    ].join('\n'),
  )
})

test('serializeConversationToMarkdown leaves deleted citations as plain placeholders', () => {
  const markdown = serializeConversationToMarkdown({
    conversationName: 'My Notes',
    appBaseUrl: 'https://example.com',
    citationTargetsById: {},
    blocks: [
      {
        id: 'block-1',
        type: 'text',
        body: `See {{block:${citedBlockId}}}`,
      },
    ],
  })

  assert.equal(markdown, ['# My Notes', '', 'See [deleted]', ''].join('\n'))
})

test('createConversationMarkdownFilename strips unsafe filename characters', () => {
  assert.equal(createConversationMarkdownFilename('  Notes: 4/22?  '), 'Notes- 4-22.md')
  assert.equal(createConversationMarkdownFilename('...'), 'conversation.md')
})
