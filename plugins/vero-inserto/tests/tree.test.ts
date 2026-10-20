import { describe, expect, test } from 'claude-code/testing'

import { DEFAULT_IGNORE, DEFAULT_TRIGGER, chainOf, draftLine, filterRows, ignoredNames, join, listed, mention, parentOf, treeRows, trigger, triggerOf } from '../hooks/tree'
import type { Listed } from '../hooks/tree'
import type { Folders } from '../types'

// The pure rules, as tables: what @@ is, how a folder is listed, which rows the pane
// draws, what a pick pastes.

describe('trigger', () => {
  const edit = (text: string, cursor: number, inputText = '@') => ({ text, start: cursor, end: cursor, inputText })

  test('the second @ right after the first: the draft on either side of the two', () => {
    expect(trigger(edit('@', 1))).toEqual({ before: '', after: '' })
    expect(trigger(edit('see @', 5))).toEqual({ before: 'see ', after: '' })
    expect(trigger(edit('see @ and more', 5))).toEqual({ before: 'see ', after: ' and more' })
  })

  test('anything else is left to the engine', () => {
    expect(trigger(edit('', 0))).toBe(undefined) // the first @
    expect(trigger(edit('see ', 4))).toBe(undefined)
    expect(trigger(edit('@@', 2))).toBe(undefined) // a third @
    expect(trigger(edit('@x', 2))).toBe(undefined)
    expect(trigger(edit('@', 1, 'a'))).toBe(undefined) // another key
    expect(trigger(edit('@', 1, '@@'))).toBe(undefined) // a paste of @@
    expect(trigger({ text: 'a@b', start: 1, end: 2, inputText: '@' })).toBe(undefined) // a replacement
    expect(trigger(edit('a@', 1))).toBe(undefined) // the cursor before the @, not after
  })

  test('another trigger: its last character typed after the rest', () => {
    expect(trigger(edit('see @', 5, '#'), '@#')).toEqual({ before: 'see ', after: '' })
    expect(trigger(edit('see @', 5, '@'), '@#')).toBe(undefined)
    expect(trigger(edit('see #', 5, '#'), '@#')).toBe(undefined)
    expect(trigger(edit('@@', 2, '#'), '@#')).toEqual({ before: '@', after: '' }) // not a run: a @ before is fine
    expect(trigger(edit('x', 1, '#'), '@#')).toBe(undefined)
    expect(trigger(edit('', 0, '#'), '@#')).toBe(undefined)
    expect(trigger(edit('a::', 3, ':'), ':::')).toEqual({ before: 'a', after: '' })
    expect(trigger(edit(':::', 3, ':'), ':::')).toBe(undefined) // a run of four stays typeable
  })

  test('triggerOf: two to four characters, no whitespace, else the default', () => {
    expect(DEFAULT_TRIGGER).toBe('@@')
    expect(triggerOf(undefined)).toBe('@@')
    expect(triggerOf('')).toBe('@@')
    expect(triggerOf('@')).toBe('@@')
    expect(triggerOf('@#')).toBe('@#')
    expect(triggerOf(' :: ')).toBe('::')
    expect(triggerOf('@ @')).toBe('@@')
    expect(triggerOf('@@@@@')).toBe('@@')
    expect(triggerOf(7)).toBe('@@')
  })
})

describe('parentOf and chainOf', () => {
  test('the folder of a path, and the folders down to one', () => {
    expect(parentOf('README.md')).toBe('')
    expect(parentOf('src/lib/util.ts')).toBe('src/lib')
    expect(chainOf('')).toEqual([])
    expect(chainOf('src')).toEqual(['src'])
    expect(chainOf('src/lib/deep')).toEqual(['src', 'src/lib', 'src/lib/deep'])
  })
})

describe('draftLine', () => {
  test('the draft around a mark, cut at the far ends', () => {
    expect(draftLine({ before: 'see ', after: '' }, 40)).toBe('see ▮')
    expect(draftLine({ before: 'see ', after: ' and more' }, 40)).toBe('see ▮ and more')
    expect(draftLine({ before: 'a'.repeat(30), after: 'b'.repeat(30) }, 21)).toBe('…aaaaaaaaa▮bbbbbbbbb…')
    expect(draftLine({ before: '', after: 'b'.repeat(30) }, 21)).toBe('▮bbbbbbbbbbbbbbbbbbb…')
  })
})

describe('ignoredNames', () => {
  test('the default, and a list split on commas and spaces', () => {
    expect([...ignoredNames(undefined)]).toEqual(['.git', 'node_modules'])
    expect([...ignoredNames('')]).toEqual(['.git', 'node_modules'])
    expect([...ignoredNames('   ')]).toEqual(['.git', 'node_modules'])
    expect([...ignoredNames('.git,dist , build  out')]).toEqual(['.git', 'dist', 'build', 'out'])
    expect([...ignoredNames(42)]).toEqual(['.git', 'node_modules'])
    expect(DEFAULT_IGNORE).toBe('.git, node_modules')
  })
})

describe('listed', () => {
  const raw: Listed[] = [
    { name: 'zeta.txt', kind: 'file' },
    { name: 'src', kind: 'dir' },
    { name: 'node_modules', kind: 'dir' },
    { name: 'README.md', kind: 'file' },
    { name: '.git', kind: 'dir' },
    { name: 'Alpha.md', kind: 'file' },
    { name: 'link', kind: 'other' },
    { name: 'b', kind: 'dir' },
    { name: 'A', kind: 'dir' },
  ]

  test('folders first, then files, A to Z regardless of case; links and ignored names out', () => {
    expect(listed(raw, ignoredNames(undefined))).toEqual([
      { name: 'A', kind: 'dir' },
      { name: 'b', kind: 'dir' },
      { name: 'src', kind: 'dir' },
      { name: 'Alpha.md', kind: 'file' },
      { name: 'README.md', kind: 'file' },
      { name: 'zeta.txt', kind: 'file' },
    ])
  })

  test('the ignore option decides what is left out', () => {
    expect(listed(raw, ignoredNames('src, zeta.txt')).map(entry => entry.name)).toEqual(['.git', 'A', 'b', 'node_modules', 'Alpha.md', 'README.md'])
  })

  test('join', () => {
    expect(join('', 'src')).toBe('src')
    expect(join('src', 'lib')).toBe('src/lib')
  })
})

const FOLDERS: Folders = {
  '': [
    { name: 'src', kind: 'dir' },
    { name: 'Alpha.md', kind: 'file' },
    { name: 'README.md', kind: 'file' },
  ],
  src: [
    { name: 'lib', kind: 'dir' },
    { name: 'app.ts', kind: 'file' },
  ],
  'src/lib': [{ name: 'util.ts', kind: 'file' }],
}

describe('treeRows', () => {
  test('the root closed: its rows alone, folders marked', () => {
    expect(treeRows(FOLDERS, [], 400)).toEqual({
      rows: [
        { kind: 'dir', path: 'src', label: '▸ src/', depth: 0, indent: 0, isExpanded: false },
        { kind: 'file', path: 'Alpha.md', label: 'Alpha.md', depth: 0, indent: 2 },
        { kind: 'file', path: 'README.md', label: 'README.md', depth: 0, indent: 2 },
      ],
      hidden: 0,
    })
  })

  test('an open folder: the paste row first, then its entries, one level in', () => {
    expect(treeRows(FOLDERS, ['src', 'src/lib'], 400).rows).toEqual([
      { kind: 'dir', path: 'src', label: '▾ src/', depth: 0, indent: 0, isExpanded: true },
      { kind: 'paste', path: 'src', label: '@ src/', depth: 1, indent: 2 },
      { kind: 'dir', path: 'src/lib', label: '▾ lib/', depth: 1, indent: 2, isExpanded: true },
      { kind: 'paste', path: 'src/lib', label: '@ lib/', depth: 2, indent: 4 },
      { kind: 'file', path: 'src/lib/util.ts', label: 'util.ts', depth: 2, indent: 6 },
      { kind: 'file', path: 'src/app.ts', label: 'app.ts', depth: 1, indent: 4 },
      { kind: 'file', path: 'Alpha.md', label: 'Alpha.md', depth: 0, indent: 2 },
      { kind: 'file', path: 'README.md', label: 'README.md', depth: 0, indent: 2 },
    ])
  })

  test('an open folder not read yet draws as open and empty', () => {
    expect(treeRows({ '': [{ name: 'src', kind: 'dir' }] }, ['src'], 400).rows.map(row => row.kind)).toEqual(['dir', 'paste'])
  })

  test('the cap: the first rows, the rest counted', () => {
    expect(treeRows(FOLDERS, ['src'], 2)).toEqual({
      rows: [
        { kind: 'dir', path: 'src', label: '▾ src/', depth: 0, indent: 0, isExpanded: true },
        { kind: 'paste', path: 'src', label: '@ src/', depth: 1, indent: 2 },
      ],
      hidden: 4,
    })
  })
})

describe('filterRows', () => {
  test('every path holding the words, flat, A to Z, folders with a slash, each a paste', () => {
    expect(filterRows(FOLDERS, 'lib', 400)).toEqual({
      rows: [
        { kind: 'paste', path: 'src/lib', label: 'src/lib/', depth: 0, indent: 0 },
        { kind: 'file', path: 'src/lib/util.ts', label: 'src/lib/util.ts', depth: 0, indent: 0 },
      ],
      hidden: 0,
    })
    expect(filterRows(FOLDERS, 'MD', 400).rows.map(row => row.path)).toEqual(['Alpha.md', 'README.md'])
    expect(filterRows(FOLDERS, 'src ts', 400).rows.map(row => row.path)).toEqual(['src/app.ts', 'src/lib/util.ts'])
    expect(filterRows(FOLDERS, 'nothing', 400)).toEqual({ rows: [], hidden: 0 })
  })

  test('the cap', () => {
    expect(filterRows(FOLDERS, 's', 1)).toEqual({ rows: [{ kind: 'paste', path: 'src', label: 'src/', depth: 0, indent: 0 }], hidden: 3 })
  })
})

describe('mention', () => {
  test('a file, a folder with its slash, a space after each', () => {
    expect(mention('src/app.ts', false)).toBe('@src/app.ts ')
    expect(mention('src/lib', true)).toBe('@src/lib/ ')
  })
})
