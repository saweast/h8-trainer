// Олена продовжує Ірині пакет тренувань і додає абонемент у зал.
export default {
  id: '09-memberships',
  title: 'Пакет тренувань і абонемент',
  subtitle: 'Скільки занять лишилось, продовження, абонемент у зал',
  audience: 'trainer',
  async run(r) {
    const page = await r.open('olena@demo.h8', '/trainer')
    const dialog = () => page.getByRole('dialog')
    const chip = (name) => dialog().getByRole('button', { name, exact: true })

    await r.step('У списку видно, скільки занять лишилось у пакеті', null, { hold: 1800 })
    await r.step('Фільтр «Закінчується» — кому скоро продовжувати', async () => {
      await r.tap(page.getByRole('button', { name: /^Закінчується/ }))
    }, { hold: 1800 })
    await r.step('Ірина: лишилось 1 заняття з 8', async () => {
      await r.tap(page.locator('a[href*="/trainer/clients/"]', { hasText: 'Ірина Бондар' }))
    }, { hold: 2000 })
    await r.step('«Додати пакет»: 12 тренувань на місяць', async () => {
      await r.tap(page.getByRole('button', { name: 'Додати пакет' }))
      await r.wait(600)
      await r.tap(chip('12'))
      await r.tap(chip('+1 міс'))
      await r.type(page.locator('#ms-title'), '12 тренувань')
    }, { hold: 1800 })
    await r.step('Зберегли. Заняття списуються по черзі: спершу останнє зі старого пакета, потім — з нового', async () => {
      await r.tap(dialog().getByRole('button', { name: 'Зберегти', exact: true }))
      await r.wait(1000)
    }, { hold: 2000 })
    await r.step('Абонемент у зал — окремо: безліміт на місяць', async () => {
      await r.tap(page.getByRole('button', { name: /Абонемент у зал/ }).first())
      await r.wait(600)
      await r.tap(chip('Без ліміту'))
      await r.tap(chip('+1 міс'))
      await r.type(page.locator('#ms-title'), 'Sport Life')
      await r.tap(dialog().getByRole('button', { name: 'Зберегти', exact: true }))
      await r.wait(1000)
    }, { hold: 2000 })
    await r.step('Коли тренер записує заняття, воно саме списується з пакета', async () => {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
      await r.wait(600)
      await r.tap(page.getByRole('button', { name: 'Почати тренування' }).first())
    }, { hold: 2400 })

    await r.open('iryna@demo.h8', '/', { title: false })
    await r.step('Клієнтка бачить пакет і абонемент у себе на головній', null, { hold: 2500 })
  },
}
