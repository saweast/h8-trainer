// Андрій тренується за планом Олени і лишає відгук.
export default {
  id: '06-client-plan-feedback',
  title: 'Клієнт: тренування за планом',
  subtitle: 'План тренера, розминка з плану, оцінка вправ і питання тренеру',
  audience: 'client',
  async run(r) {
    const page = await r.open('andrii@demo.h8', '/')
    const btn = (name, exact = false) => page.getByRole('button', { name, exact })
    const nextDone = () => btn('Сет виконано').first()
    const weekCard = (exercise, week) =>
      page.locator('div.rounded-2xl', { hasText: exercise }).getByRole('button', { name: new RegExp(`^Тиж ${week}`) }).first()

    await r.step('Головна: пакет у тренера, абонемент, останні заняття', null, { hold: 1500 })
    await r.step('«Почати тренування» — першим іде наступне за планом тренера', async () => {
      await r.tap(btn('Почати тренування'))
    }, { hold: 2000 })
    await r.step('«Відкрити план»: тижні поруч, виконане позначене ✓', async () => {
      await r.tap(page.getByRole('link', { name: 'Відкрити план' }))
      await r.wait(1000)
    }, { hold: 2000 })
    await r.step('Тиж 2: ▼ — не все виконано, маркер — є відгук', async () => {
      await r.tap(page.getByRole('button', { name: '2 тренування' }))
      await r.wait(800)
    }, { hold: 2200 })
    await r.step('Тап по тижню 3 — план і обговорення з тренером', async () => {
      await r.tap(weekCard('Станова тяга', 3))
      await r.wait(800)
    }, { hold: 1500 })
    await r.step('Питання тренеру прямо в клітинці плану', async () => {
      const box = page.getByPlaceholder('Питання чи відгук до цієї вправи')
      await r.type(box, 'Якщо спина не відпустить — можна 95?', { delay: 45 })
      await r.tap(page.getByRole('dialog').getByRole('button', { name: 'Надіслати' }))
    }, { hold: 2000 })
    await r.step('Старт наступного тренування з плану', async () => {
      await page.keyboard.press('Escape')
      await r.wait(500)
      await r.tap(btn('Почати', true))
      await r.wait(1200)
    }, { hold: 2000 })
    await r.step('Підходи вже з плану тренера: розминка «Р» і робочі ваги', null, { hold: 1500 })
    await r.step('Виконуємо — відмічаємо кожен підхід', async () => {
      for (let i = 0; i < 6; i++) {
        await r.tap(nextDone(), { pause: 250 })
        await r.wait(350)
      }
      await r.tap(btn('Далі', true))
    })
    await r.step('«Як пішло?» — «Важко» і пара слів для тренера', async () => {
      await r.tap(btn('Важко', true).first())
      await r.wait(400)
      await r.type(page.getByPlaceholder(/Що відчув/).first(), 'Останній повтор на 90 — через силу', { delay: 45 })
      await page.keyboard.press('Enter')
    }, { hold: 1800 })
    await r.step('Наступна вправа — так само за планом', async () => {
      await r.scroll(500)
      for (let i = 0; i < 4; i++) {
        await r.tap(nextDone(), { pause: 250 })
        await r.wait(350)
      }
      await r.tap(btn('Далі', true))
      await r.tap(btn('Норм', true).nth(1))
    })
    await r.step('Завершуємо — план сам перейде на наступний день', async () => {
      await r.tap(btn('Завершити', true))
      await r.wait(600)
      await r.tap(btn('Завершити тренування'))
      await r.wait(1200)
    }, { hold: 1800 })
    await r.step('Коментар до всього тренування — тренер побачить у стрічці', async () => {
      const box = page.getByPlaceholder('Напиши коментар…')
      await box.scrollIntoViewIfNeeded()
      await r.type(box, 'Тяга верхнього і розгинання не встиг — забігав на роботу', { delay: 40 })
      await r.tap(btn('Надіслати'))
    }, { hold: 2200 })
  },
}
