import { describe, expect, it } from 'vitest'
import { youtubeId, youtubeWatchUrl } from './youtube'

describe('youtubeId', () => {
  it.each([
    ['https://www.youtube.com/watch?v=rT7DgCr-3pg', 'rT7DgCr-3pg'],
    ['https://youtube.com/watch?v=rT7DgCr-3pg&t=42s', 'rT7DgCr-3pg'],
    ['https://m.youtube.com/watch?v=rT7DgCr-3pg', 'rT7DgCr-3pg'],
    ['https://youtu.be/rT7DgCr-3pg?si=abc', 'rT7DgCr-3pg'],
    ['https://www.youtube.com/shorts/rT7DgCr-3pg', 'rT7DgCr-3pg'],
    ['https://www.youtube.com/embed/rT7DgCr-3pg', 'rT7DgCr-3pg'],
    ['  https://youtu.be/rT7DgCr-3pg  ', 'rT7DgCr-3pg'],
  ])('reads %s', (url, id) => {
    expect(youtubeId(url)).toBe(id)
  })

  it.each([
    null,
    '',
    'not a url',
    'https://example.com/watch?v=rT7DgCr-3pg',
    'https://youtube.com.evil.io/watch?v=rT7DgCr-3pg',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/@ScottHermanFitness',
    'javascript:alert(1)',
  ])('rejects %s', (url) => {
    expect(youtubeId(url)).toBeNull()
  })

  it('builds a link the database accepts', () => {
    expect(youtubeWatchUrl('rT7DgCr-3pg')).toMatch(/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//)
  })
})
