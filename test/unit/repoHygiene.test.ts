import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'

// Unresolved merge-conflict markers were committed into CHANGELOG.md and every gate stayed green
// — eslint, typecheck, 481 tests, coverage and 16 e2e — because no test reads that file. A repo
// only needs one place that looks at everything.

function tracked(): string[] {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean)
}

describe('repository hygiene', () => {
  it('no tracked file carries a merge-conflict marker', () => {
    // grep exits 1 when nothing matches, which is the passing case
    let hits: string
    try {
      hits = execFileSync(
        'git',
        ['grep', '-nE', '^(<<<<<<< |=======$|>>>>>>> )', '--', ...tracked().filter(f => !f.includes('repoHygiene'))],
        { encoding: 'utf8' })
    } catch {
      hits = ''
    }
    expect(hits.trim(), `conflict markers still committed:\n${hits}`).toBe('')
  })
})
