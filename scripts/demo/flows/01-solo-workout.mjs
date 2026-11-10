// Софія тренується сама: порожнє тренування, вправи по ходу.
export default {
  id: '01-solo-workout',
  title: 'Звичайне тренування',
  subtitle: 'Сам обираєш вправи по ходу, застосунок пам’ятає минулий раз',
  audience: 'client',
  async run(r) {
    const page = await r.open('sofia@demo.h8', '/')
    const btn = (name, exact = false) => page.getByRole('button', { name, exact })
    const kg = (i) => page.getByRole('textbox', { name: 'кг' }).nth(i)
    const reps = (i) => page.getByRole('textbox', { name: 'Повт' }).nth(i)
    // "Сет виконано" turns into "Скасувати виконання" once done, so .first() is the next open set
    const nextDone = () => btn('Сет виконано').first()

    await r.step('Головна: абонемент у зал і останні тренування', null, { hold: 1200 })
    await r.step('«Почати тренування» → порожнє: вправи додаєш по ходу', async () => {
      await r.tap(btn('Почати тренування'))
      await r.wait(700)
      await r.tap(btn(/^Порожнє тренування/))
    })
    await r.step('Додаємо вправу: пошук по каталогу', async () => {
      await r.tap(btn('Додати вправу').first())
      await r.wait(500)
      await r.type(page.getByRole('searchbox'), 'жим штанги', { delay: 90 })
    })
    await r.step('Кнопка «?» — техніка: фото, як виконувати, відео', async () => {
      await r.tap(btn('Підказка: Жим штанги лежачи'))
      await r.wait(1500)
      await r.scroll(500)
    }, { hold: 2000 })
    await r.step('Обираємо вправу — підходи підставились з минулого разу', async () => {
      await page.keyboard.press('Escape')
      await r.wait(600)
      await r.tap(btn(/^Жим штанги лежачи/))
    }, { hold: 2200 })
    await r.step('Перший підхід робимо розминочним — позначка «Р»', async () => {
      await r.tap(btn('Дії із сетом').first())
      await r.tap(page.getByRole('menuitem', { name: 'Позначити як розминку' }))
      await r.wait(300)
      await r.type(kg(0), '20')
      await r.type(reps(0), '12')
    })
    await r.step('Відмічаємо ✓ — стартує таймер відпочинку', async () => {
      await r.tap(nextDone())
    }, { hold: 2200 })
    await r.step('Робочий підхід: минулого разу 47,5 × 8 — ставимо 50', async () => {
      await r.type(kg(1), '50')
    })
    await r.step('Більше, ніж будь-коли — новий рекорд', async () => {
      await r.tap(nextDone())
    }, { hold: 2500 })
    await r.step('Решта підходів — одним тапом; «+ Сет» копіює попередній', async () => {
      await r.tap(btn('Далі', true))
      await r.type(kg(2), '50', { delay: 50 })
      await r.tap(nextDone(), { pause: 300 })
      await r.wait(500)
      await r.tap(btn('Сет', true).first())
      await r.wait(400)
      await r.tap(nextDone(), { pause: 300 })
      await r.wait(500)
      await r.tap(btn('Далі', true))
    })
    await r.step('Друга вправа — з тими самими підказками', async () => {
      await r.tap(btn('Додати вправу').last())
      await r.wait(500)
      await r.type(page.getByRole('searchbox'), 'тяга гантелі', { delay: 80 })
      await r.tap(btn(/^Тяга гантелі однією рукою/))
      await r.wait(900)
      for (let i = 0; i < 3; i++) {
        await r.tap(nextDone(), { pause: 250 })
        await r.wait(350)
      }
      await r.tap(btn('Далі', true))
    })
    await r.step('«Завершити» — незавершені підходи не збережуться', async () => {
      await r.tap(btn('Завершити', true))
    }, { hold: 1300 })
    await r.step('Підсумок: тривалість, обсяг, сети, рекорди', async () => {
      await r.tap(btn('Завершити тренування'))
      await r.wait(1200)
    }, { hold: 2200 })
    await r.step('«Як пішло?» — оцінка вправи й нотатка. Тренер їх побачить', async () => {
      await r.tap(btn('Норм', true).first())
      await r.wait(500)
      await r.type(page.getByPlaceholder(/Що відчув/).first(), 'Наступного разу можна 52,5', { delay: 55 })
      await page.keyboard.press('Enter')
    })
    await r.step('Тренування можна зберегти як шаблон і повторювати', async () => {
      await r.tap(btn('Зберегти як шаблон'))
      await r.wait(1500)
    }, { hold: 2200 })
  },
}
