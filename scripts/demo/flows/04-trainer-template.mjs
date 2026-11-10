// Олена створює шаблон із розминкою, збирає програму і призначає її Ірині.
export default {
  id: '04-trainer-template',
  title: 'Тренер: шаблон і програма',
  subtitle: 'Підходи як у таблиці, розминка, програма по колу й призначення клієнту',
  audience: 'trainer',
  async run(r) {
    const page = await r.open('olena@demo.h8', '/trainer')
    const btn = (name, exact = false) => page.getByRole('button', { name, exact })

    const addExercise = async (query, name) => {
      await r.tap(btn('Додати вправу'))
      await r.wait(500)
      await r.type(page.getByRole('searchbox'), query, { delay: 75 })
      await r.tap(btn(new RegExp(`^${name}`)))
      await r.wait(600)
    }

    await r.step('Шаблони тренера: набори вправ, які можна давати клієнтам', async () => {
      await r.tap(page.getByRole('link', { name: 'Шаблони', exact: true }))
    }, { hold: 1600 })
    await r.step('Новий шаблон — назва і вправи', async () => {
      await r.tap(btn('Новий шаблон'))
      await r.wait(500)
      await r.type(page.getByRole('textbox', { name: 'Назва шаблону' }), 'Низ Б')
      await addExercise('присідання зі', 'Присідання зі штангою')
    })
    await r.step('Тап по вправі — налаштування підходів', async () => {
      await r.tap(btn(/^Присідання зі штангою/))
    })
    await r.step('Підходи як у таблиці: вага × повтори × підходи', async () => {
      await r.type(page.getByPlaceholder('20x10, 50x5, 80x8x3'), '20x10, 50x5, 70x3x8', { delay: 85 })
    }, { hold: 1800 })
    await r.step('Застосунок помічає переплутані повтори й підходи — виправляє одним тапом', async () => {
      await r.tap(page.getByRole('button', { name: '70x8x3' }))
    }, { hold: 2200 })
    await r.step('Розминку визначено автоматично; додаємо відпочинок і нотатку', async () => {
      await r.type(page.locator('#rest'), '150')
      await r.type(page.locator('#item-notes'), 'Глибина — стегна паралельно підлозі', { delay: 45 })
      await r.tap(btn('Готово'))
    })
    await r.step('Друга вправа — так само', async () => {
      await addExercise('румунська', 'Румунська тяга')
      await r.tap(btn(/^Румунська тяга/))
      await r.type(page.getByPlaceholder('20x10, 50x5, 80x8x3'), '40x10, 60x10x3', { delay: 70 })
      await r.tap(btn('Готово'))
      await r.wait(400)
      await r.tap(btn('Зберегти', true))
    }, { hold: 1800 })
    await r.step('Програма: шаблони чергуються по колу — День A, День B…', async () => {
      await page.goBack()
      await r.wait(600)
      await r.tap(btn('Нова програма'))
      await r.wait(500)
      await r.type(page.getByRole('textbox', { name: 'Назва програми' }), 'Верх / Низ')
      for (const name of ['Верх А', 'Низ Б']) {
        await r.tap(btn('Додати день'))
        await r.wait(500)
        await r.tap(btn(new RegExp(`^${name}`)))
        await r.wait(400)
      }
    }, { hold: 1800 })
    await r.step('Зберігаємо і призначаємо клієнтці: картка → вкладка «План»', async () => {
      await r.tap(btn('Зберегти', true))
      await r.wait(800)
      await page.goto(page.url().replace(/\/programs\/.*/, '/trainer'))
      await r.tap(page.locator('a[href*="/trainer/clients/"]', { hasText: 'Ірина Бондар' }))
      await r.wait(600)
      await r.tap(page.getByRole('tab', { name: 'План' }))
      await r.wait(500)
      await r.scroll(500)
    })
    await r.step('«Призначити» — програма з’явиться в клієнтки', async () => {
      await r.tap(page.locator('li', { hasText: 'Верх / Низ' }).getByRole('button', { name: 'Призначити' }))
    }, { hold: 1800 })

    const client = await r.open('iryna@demo.h8', '/', { title: false })
    await r.step('Ірина: «Почати тренування» → наступний день програми тренера', async () => {
      await r.tap(client.getByRole('button', { name: 'Почати тренування' }))
    }, { hold: 2500 })
  },
}
