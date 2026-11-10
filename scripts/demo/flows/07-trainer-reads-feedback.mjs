// Олена бачить відгуки Андрія і коригує наступний тиждень плану.
export default {
  id: '07-trainer-reads-feedback',
  title: 'Тренер: відгуки клієнтів',
  subtitle: 'Стрічка відгуків, план vs факт, відповідь і корекція наступного тижня',
  audience: 'trainer',
  async run(r) {
    const page = await r.open('olena@demo.h8', '/trainer')
    const btn = (name, exact = false) => page.getByRole('button', { name, exact })
    const weekCard = (exercise, week) =>
      page.locator('div.rounded-2xl', { hasText: exercise }).getByRole('button', { name: new RegExp(`^Тиж ${week}`) }).first()

    await r.step('Цифра на «Клієнти» — нові відгуки; стрічка — прямо над списком', null, { hold: 2000 })
    await r.step('Усі відгуки: оцінки вправ, коментарі до плану й тренувань', async () => {
      await r.tap(btn('Усі відгуки'))
      await r.wait(800)
      await r.scroll(400)
    }, { hold: 2200 })
    await r.step('Тап по відгуку — одразу в план клієнта', async () => {
      await r.tap(page.getByRole('dialog').getByRole('link', { name: /Станова тяга · Тиж 3/ }).first())
      await r.wait(1200)
    }, { hold: 1500 })
    await r.step('Станова, тиж 2: ▼ — недобрав, маркер — є відгук', async () => {
      await r.tap(btn('2 тренування'))
      await r.wait(800)
    }, { hold: 2200 })
    await r.step('Клітинка: план, що зроблено, оцінка «Важко» і нотатка клієнта', async () => {
      await r.tap(weekCard('Станова тяга', 2))
      await r.wait(800)
    }, { hold: 2600 })
    await r.step('Тиж 3: знижуємо 100 → 95 кг', async () => {
      await page.keyboard.press('Escape')
      await r.wait(500)
      await r.tap(weekCard('Станова тяга', 3))
      await r.wait(700)
      await r.type(page.getByPlaceholder('20x10, 50x5, 80x8x3'), '20x10, 50x6, 80x4, 95x3x4', { delay: 60 })
    }, { hold: 1800 })
    await r.step('…і відповідаємо клієнту в тому ж треді', async () => {
      const box = page.getByPlaceholder('Питання чи відгук до цієї вправи')
      await r.type(box, 'Так, 95. Якщо піде легко — додамо на наступній хвилі', { delay: 40 })
      await r.tap(page.getByRole('dialog').getByRole('button', { name: 'Надіслати' }))
      await r.wait(800)
    }, { hold: 2000 })
    await r.step('«Готово» і «Зберегти» — клієнт одразу бачить новий план', async () => {
      await r.tap(btn('Готово'))
      await r.wait(500)
      await r.tap(btn('Зберегти', true))
    }, { hold: 2500 })
  },
}
