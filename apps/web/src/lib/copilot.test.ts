import { describe, expect, it } from 'vitest'
import { anchorWorkspaceLinks, parseFileRef } from './copilot'

const id = '0b3f6b2e-6d1a-4e8e-9c1f-3a2b1c4d5e6f'

describe('parseFileRef', () => {
  it('maps staged document paths to the upload', () => {
    expect(parseFileRef(`input/documents/${id}.txt`)).toEqual({ kind: 'document', uploadId: id })
    expect(parseFileRef(`input/documents/${id}.md`)).toEqual({ kind: 'document', uploadId: id })
    expect(parseFileRef(`/work/input/documents/${id}.md`)).toEqual({ kind: 'document', uploadId: id })
    expect(parseFileRef(`/work/input/documents/${id}.txt`)).toEqual({ kind: 'document', uploadId: id })
    expect(parseFileRef(`input/documents/${id.toUpperCase()}`)).toEqual({ kind: 'document', uploadId: id })
  })

  it('maps workspace paths to workspace files', () => {
    expect(parseFileRef('output/draft.md')).toEqual({ kind: 'workspace', path: 'output/draft.md' })
    expect(parseFileRef('/work/output/notes/plan.txt')).toEqual({
      kind: 'workspace',
      path: 'output/notes/plan.txt',
    })
    expect(parseFileRef('./output/a.csv')).toEqual({ kind: 'workspace', path: 'output/a.csv' })
    // What the renderer's sanitizer emits for `./output/a.csv` and `./input/documents/<id>.md`.
    expect(parseFileRef('/output/a.csv')).toEqual({ kind: 'workspace', path: 'output/a.csv' })
    expect(parseFileRef(`/input/documents/${id}.md`)).toEqual({ kind: 'document', uploadId: id })
    expect(parseFileRef('output/r%C3%A9sum%C3%A9.md')).toEqual({
      kind: 'workspace',
      path: 'output/résumé.md',
    })
  })

  it('leaves ordinary links alone', () => {
    expect(parseFileRef('https://example.com/output/x.md')).toBeNull()
    expect(parseFileRef('mailto:a@b.c')).toBeNull()
    expect(parseFileRef('#section')).toBeNull()
    expect(parseFileRef('/etc/passwd')).toBeNull()
    expect(parseFileRef('/outputs/x.md')).toBeNull()
    expect(parseFileRef('output/../input/project.json')).toBeNull()
    expect(parseFileRef('input/project.json')).toBeNull()
    expect(parseFileRef(undefined)).toBeNull()
  })
})

describe('anchorWorkspaceLinks', () => {
  it('anchors bare workspace link targets at the sandbox mount', () => {
    expect(
      anchorWorkspaceLinks(`See [contrat.pdf](input/documents/${id}.md) and [plan](output/plan.md).`),
    ).toBe(`See [contrat.pdf](/work/input/documents/${id}.md) and [plan](/work/output/plan.md).`)
    expect(anchorWorkspaceLinks('[a](./output/a.csv "titre")')).toBe('[a](/work/output/a.csv "titre")')
  })

  it('leaves other links and text alone', () => {
    const text =
      '[site](https://example.com/output/x.md) [w](/work/output/x.md) output/plain.md [m](mailto:a@b.c)'
    expect(anchorWorkspaceLinks(text)).toBe(text)
  })
})
