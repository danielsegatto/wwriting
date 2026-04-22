/// <reference types="node" />

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  diffReferenceTargetIds,
  extractReferenceTargetIds,
} from './references.ts'

const firstId = '11111111-1111-1111-1111-111111111111'
const secondId = '22222222-2222-2222-2222-222222222222'

test('extractReferenceTargetIds returns unique ids in encounter order', () => {
  const body = [
    `Alpha {{block:${firstId}}}`,
    `Beta {{block:${secondId}}}`,
    `Again {{block:${firstId}}}`,
  ].join('\n')

  assert.deepEqual(extractReferenceTargetIds(body), [firstId, secondId])
})

test('extractReferenceTargetIds ignores malformed tokens', () => {
  const body = [
    '{{block:not-a-uuid}}',
    '{{block:33333333-3333-3333-3333-33333333333}}',
    `{{block:${secondId}}}`,
  ].join(' ')

  assert.deepEqual(extractReferenceTargetIds(body), [secondId])
})

test('diffReferenceTargetIds computes add and remove sets', () => {
  assert.deepEqual(
    diffReferenceTargetIds([firstId], [secondId, firstId]),
    {
      idsToAdd: [secondId],
      idsToRemove: [],
    },
  )

  assert.deepEqual(
    diffReferenceTargetIds([firstId, secondId], [secondId]),
    {
      idsToAdd: [],
      idsToRemove: [firstId],
    },
  )
})
