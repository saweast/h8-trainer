// Олена на комп'ютері складає хвилю по тижнях, як у Google-таблиці, і дає її Ірині.
export default {
  id: '05-trainer-plan-weeks',
  title: 'Тренер: план по тижнях',
  subtitle: 'Хвильова періодизація як у таблиці: тижні поруч, копія з кроком ваги',
  audience: 'trainer',
  viewport: 'desktop',
  async run(r) {
    const page = await r.open('olena@demo.h8', '/trainer')
    const btn = (name, exact = false) => page.getByRole('button', { name, exact })
    const td = (exercise, week) => page.locator('tbody tr', { hasText: exercise }).locator('td').nth(week)
    // Enter moves the editor down a row, so the cell may already be in edit mode.
    const fill = async (exercise, week, text, key = 'Enter') => {
      const cell = td(exercise, week)
      const input = cell.locator('input')
      if (!(await input.count())) await r.tap(cell.locator('button').first(), { pause: 350 })
      else await r.tap(input, { pause: 350 })
      await page.keyboard.press('ControlOrMeta+A')
      await page.keyboard.type(text, { delay: 55 })
      await r.wait(500)
      await page.keyboard.press(key)
    }
    const weekMenu = async (week, item) => {
      await r.tap(page.locator('thead').getByRole('button', { name: `Тиж ${week}` }))
      await r.wait(400)
      await r.tap(page.getByRole('menuitem', { name: item }))
    }

    await r.step('Шаблон плану: хвиля на кілька тижнів, яку потім копіюєш клієнтам', async () => {
      await r.tap(page.getByRole('link', { name: 'Шаблони', exact: true }))
      await r.wait(700)
      await r.tap(btn('Шаблон плану'))
      await r.wait(500)
      await r.tap(btn(/^З нуля/))
      await r.wait(800)
      await r.type(page.getByRole('textbox', { name: 'Назва плану' }), 'Хвиля 3 тижні')
    })
    await r.step('Таблиця: рядки — вправи, колонки — тижні', async () => {
      for (const [q, name] of [['присідання зі', 'Присідання зі штангою'], ['жим штанги лежачи', 'Жим штанги лежачи']]) {
        await r.tap(btn('Додати вправу').first())
        await r.wait(500)
        await r.type(page.getByRole('searchbox'), q, { delay: 60 })
        await r.tap(btn(new RegExp(`^${name}`)))
        await r.wait(500)
      }
    })
    await r.step('Вписуємо підходи прямо в клітинку — як у Sheets', async () => {
      await fill('Присідання', 1, '20x10, 60x5, 80x8x3')
      await r.wait(300)
      await fill('Жим штанги', 1, '20x10, 40x5, 60x8x3')
    }, { hold: 1800 })
    await r.step('Тиждень 1 → тиждень 2 з кроком ваги: робочі +2,5 кг, розминка не змінюється', async () => {
      await weekMenu(1, 'Скопіювати в тиж 2 з +кроком ваги')
    }, { hold: 2200 })
    await r.step('Хвиля: на 2-му тижні присідання важче, але менше повторів', async () => {
      await fill('Присідання', 2, '20x10, 60x5, 85x6x3')
    }, { hold: 1800 })
    await r.step('Тиждень 3 — так само; знизу видно тоннаж кожного тижня', async () => {
      await weekMenu(2, 'Скопіювати в тиж 3 з +кроком ваги')
      await r.wait(500)
      await fill('Присідання', 3, '20x10, 60x5, 90x5x3')
    }, { hold: 2200 })
    await r.step('Четвертий тиждень не потрібен — прибираємо', async () => {
      await weekMenu(4, 'Видалити тиждень')
    })
    await r.step('«Продовжити мезоцикл»: ще 3 тижні, ваги +крок', async () => {
      await r.tap(btn('Дії з тренуванням'))
      await r.tap(page.getByRole('menuitem', { name: /Продовжити мезоцикл/ }))
    }, { hold: 2500 })
    await r.step('Зберігаємо шаблон плану', async () => {
      await r.tap(btn('Зберегти', true))
    }, { hold: 1500 })
    await r.step('Копія для клієнтки: картка → «План» → з шаблону плану', async () => {
      await page.goto(page.url().replace(/\/plans\/.*/, '/trainer'))
      await r.tap(page.locator('a[href*="/trainer/clients/"]', { hasText: 'Ірина Бондар' }))
      await r.wait(500)
      await r.tap(page.getByRole('tab', { name: 'План' }))
      await r.wait(400)
      await r.tap(btn('Створити план'))
      await r.wait(500)
    }, { hold: 1500 })
    await r.step('Тепер це власний план Ірини — ваги підганяємо під неї', async () => {
      await r.tap(btn(/^Хвиля 3 тижні/))
      await r.wait(1200)
      await fill('Присідання', 1, '20x10, 40x5, 55x8x3')
      await r.wait(400)
      await r.tap(btn('Зберегти', true))
    }, { hold: 2500 })
  },
}
