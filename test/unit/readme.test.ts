import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** The README broke the guidelines link on two version bumps running (v1.0 → v1.1 → v1.2).
 *  This pins every repo-relative link — the next bump goes red here instead of shipping. */

const root = fileURLToPath(new URL('../..', import.meta.url))
const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8')

function relativeLinks(md: string): string[] {
  const links: string[] = []
  for (const m of md.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = m[1]!
    if (/^(https?:|mailto:|#)/.test(target)) continue
    links.push(target.replace(/#.*$/, ''))
  }
  for (const m of md.matchAll(/<img\s[^>]*src="([^"]+)"/g)) {
    if (!/^https?:/.test(m[1]!)) links.push(m[1]!)
  }
  return links
}

describe('README integrity', () => {
  it('every repo-relative link and image resolves to a file that exists', () => {
    const links = relativeLinks(readme)
    expect(links.length).toBeGreaterThan(0) // the extractor found something — no silent pass
    const missing = links.filter(l => !existsSync(root + l))
    expect(missing).toEqual([])
  })

  it('the version badge tracks package.json, not a hand-edited number', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }
    const badge = /badge\/version-([\d.]+)-/.exec(readme)
    expect(badge?.[1]).toBe(pkg.version)
  })
})
