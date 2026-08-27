import { createElement, Fragment, type ReactNode } from 'react'
import Link from 'next/link'

/**
 * A tiny, dependency-free renderer for announcement bodies. Supports exactly
 * five constructs: **bold**, *italic*, [label](url) links, "- " prefixed list
 * items, and blank-line-separated paragraphs. Nothing else is special.
 *
 * Safety model — read this before touching the file: this function never
 * builds an HTML string. It walks the source character-by-character and
 * builds a tree of React elements directly via `createElement`. Every run of
 * text that is not part of a recognised token becomes a plain JS string
 * placed as a React child; React renders string children as escaped DOM text
 * nodes, not as markup, so something like `<img src=x onerror=alert(1)>`
 * typed into an announcement body shows up as inert, visible text rather than
 * executing. There is no `dangerouslySetInnerHTML` anywhere in this file, and
 * one must never be added here — that is the one change that would turn this
 * safe-by-construction design into a stored-XSS hole the moment any admin's
 * pasted text happened to contain a tag.
 *
 * This file is `.ts`, not `.tsx`, on purpose (see the module's callers) — so
 * every element is built with `createElement` rather than JSX syntax, which
 * a `.ts` file cannot parse.
 */

type Block = { type: 'list'; items: string[] } | { type: 'para'; lines: string[] }

/** Blank-line-separated blocks; a run of "- " lines becomes one list block. */
function splitBlocks(text: string): Block[] {
  const lines = text.split('\n')
  const blocks: Block[] = []
  let current: Block | null = null

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line === '') {
      current = null
      continue
    }

    if (line.startsWith('- ')) {
      const item = line.slice(2).trim()
      if (current && current.type === 'list') {
        current.items.push(item)
      } else {
        current = { type: 'list', items: [item] }
        blocks.push(current)
      }
    } else if (current && current.type === 'para') {
      current.lines.push(line)
    } else {
      current = { type: 'para', lines: [line] }
      blocks.push(current)
    }
  }

  return blocks
}

/** http(s) only — the one shape that gets a real target=_blank anchor. */
function isSafeExternal(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

/** A site-relative path — the one shape that gets a next/link. `//host` is a
 *  protocol-relative URL, not an internal path, so it is excluded. */
function isInternalPath(url: string): boolean {
  return url.startsWith('/') && !url.startsWith('//')
}

/**
 * [label](url) → an external anchor, an internal next/link, or — for any
 * other scheme (javascript:, data:, mailto:, a bare domain with no protocol,
 * a malformed URL) — plain text. We render nothing clickable rather than
 * guess at a link for a shape we don't recognise as safe.
 */
function renderLink(label: string, url: string, key: string): ReactNode {
  const content = label || url

  if (isSafeExternal(url)) {
    return createElement(
      'a',
      { key, href: url, target: '_blank', rel: 'noopener noreferrer' },
      content
    )
  }

  if (isInternalPath(url)) {
    return createElement(Link, { key, href: url }, content)
  }

  return content
}

/**
 * Inline parse of one run of text: bold, italic, links, everything else as
 * literal text. A single left-to-right scan — at each position, try bold,
 * then italic, then a link; if none match, the character is literal.
 *
 * Bold/italic delimiters only open when the content between them is
 * non-empty and doesn't start or end with whitespace — without that guard,
 * ordinary text like "2 * 3 * 4" would get swallowed into a giant, wrong
 * italic span. This is a "tiny" parser, not a CommonMark implementation.
 */
function parseInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let buffer = ''
  let i = 0
  let key = 0

  const flush = () => {
    if (buffer) {
      nodes.push(buffer)
      buffer = ''
    }
  }

  while (i < text.length) {
    const ch = text[i]

    if (ch === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2)
      const inner = end !== -1 ? text.slice(i + 2, end) : ''
      if (end !== -1 && inner.length > 0 && !/^\s|\s$/.test(inner)) {
        flush()
        const childKey = `${keyPrefix}-strong-${key}`
        key += 1
        nodes.push(createElement('strong', { key: childKey }, parseInline(inner, childKey)))
        i = end + 2
        continue
      }
    }

    if (ch === '*') {
      const end = text.indexOf('*', i + 1)
      const inner = end !== -1 ? text.slice(i + 1, end) : ''
      if (end !== -1 && inner.length > 0 && !/^\s|\s$/.test(inner)) {
        flush()
        const childKey = `${keyPrefix}-em-${key}`
        key += 1
        nodes.push(createElement('em', { key: childKey }, parseInline(inner, childKey)))
        i = end + 1
        continue
      }
    }

    if (ch === '[') {
      const closeBracket = text.indexOf(']', i + 1)
      if (closeBracket !== -1 && text[closeBracket + 1] === '(') {
        const closeParen = text.indexOf(')', closeBracket + 2)
        if (closeParen !== -1) {
          const label = text.slice(i + 1, closeBracket)
          const url = text.slice(closeBracket + 2, closeParen).trim()
          flush()
          const childKey = `${keyPrefix}-link-${key}`
          key += 1
          nodes.push(renderLink(label, url, childKey))
          i = closeParen + 1
          continue
        }
      }
    }

    buffer += ch
    i += 1
  }

  flush()
  return nodes
}

/**
 * Render an announcement's `body_md` to React elements. Blank lines start a
 * new block; a run of "- " lines becomes a `<ul>`; anything else becomes a
 * `<p>` with manual line breaks preserved as `<br />` between the typed
 * lines (announcement authors are not expected to know the
 * blank-line-for-a-new-paragraph convention, so a single Enter still shows
 * up as a break rather than silently collapsing into the next line).
 */
export function renderMarkdownLite(source: string): ReactNode {
  const normalized = source.replace(/\r\n/g, '\n')
  const blocks = splitBlocks(normalized)

  return createElement(
    Fragment,
    null,
    blocks.map((block, blockIdx) => {
      if (block.type === 'list') {
        return createElement(
          'ul',
          { key: `block-${blockIdx}`, className: 'list-disc space-y-1 pl-5' },
          block.items.map((item, itemIdx) =>
            createElement(
              'li',
              { key: `item-${blockIdx}-${itemIdx}` },
              parseInline(item, `b${blockIdx}i${itemIdx}`)
            )
          )
        )
      }

      return createElement(
        'p',
        { key: `block-${blockIdx}` },
        block.lines.map((line, lineIdx) =>
          createElement(
            Fragment,
            { key: `line-${blockIdx}-${lineIdx}` },
            lineIdx > 0 ? createElement('br') : null,
            parseInline(line, `b${blockIdx}l${lineIdx}`)
          )
        )
      )
    })
  )
}
