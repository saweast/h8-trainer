import { expect, it } from 'vitest'
import { initials } from './initials'

it('builds initials from one or two words', () => {
  expect(initials('Олена Коваль')).toBe('ОК')
  expect(initials('anna')).toBe('AN')
  expect(initials('  ')).toBe('?')
})
