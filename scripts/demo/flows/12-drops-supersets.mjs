// Софія: дроп-сет на махах (з минулого разу) і суперсет біцепс + трицепс (кнопка «Суперсет»).
export default {
  id: '12-drops-supersets',
  title: 'Дроп-сети і суперсети',
  subtitle: 'Знижуєш вагу без відпочинку, дві вправи по колу — застосунок веде таймер',
  audience: 'client',
  async run(r) {
    const page = await r.open('sofia@demo.h8', '/')
    const btn = (name, exact = false) => page.getByRole('button', { name, exact })
    const item = (name) => page.getByRole('menuitem', { name })
    // the innermost card with that exercise (a superset card holds its exercises' cards)
    const card = (name) => page.locator('section').filter({ hasText: name }).last()
    // "Сет виконано" turns into "Скасувати виконання" once done, so .first() is the next open set
    const nextDone = (scope = page) => scope.getByRole('button', { name: 'Сет виконано' }).first()
    const addExercise = async (query, name) => {
      await r.tap(btn('Додати вправу').last())
      await r.wait(500)
      await r.type(page.getByRole('searchbox'), query, { delay: 80 })
      await r.tap(btn(name))
      await r.wait(900)
    }
    const raises = card('Махи гантелями в сторони')
    const curl = card('Згинання рук зі штангою')
    const pushdown = card('Розгинання рук на блоці')

    await r.step('Порожнє тренування — вправи додаємо по ходу', async () => {
      await r.tap(btn('Почати тренування'))
      await r.wait(700)
      await r.tap(btn(/^Порожнє тренування/))
    })
    await r.step('Махи в сторони: минулого разу останній сет був з дропами — вони вже тут (↳)', async () => {
      await addExercise('махи', /^Махи гантелями в сторони/)
    }, { hold: 2500 })
    await r.step('Ще одне зниження — «Додати дроп» у меню сету: вага на 20% менша, повтори «макс»', async () => {
      await r.tap(raises.getByRole('button', { name: 'Дії із сетом' }).nth(2))
      await r.tap(item('Додати дроп'))
    }, { hold: 2200 })
    await r.step('Звичайні сети — з відпочинком', async () => {
      await r.tap(nextDone(raises))
      await r.wait(600)
      await r.tap(btn('Далі', true))
      await r.tap(nextDone(raises))
      await r.wait(600)
      await r.tap(btn('Далі', true))
    })
    await r.step('Сет перед дропом: замість відпочинку 10 секунд на зміну ваги', async () => {
      await r.tap(nextDone(raises))
    }, { hold: 2500 })
    await r.step('Дропи один за одним — до відмови; після останнього відпочинок', async () => {
      for (let i = 0; i < 2; i++) {
        await r.tap(nextDone(raises), { pause: 300 })
        await r.wait(700)
      }
      // the drop added by hand: reps are typed once it's done
      await r.type(raises.getByRole('textbox', { name: 'Повт' }).nth(5), '8')
      await r.tap(nextDone(raises), { pause: 300 })
    }, { hold: 1800 })
    await r.step('«Суперсет» — біцепс і трицепс, у порядку виконання', async () => {
      await r.tap(btn('Далі', true))
      await r.tap(btn('Додати суперсет'))
      await r.wait(500)
      await r.type(page.getByRole('searchbox'), 'згинання рук зі штангою', { delay: 80 })
      await r.tap(btn(/^Згинання рук зі штангою/))
      await r.type(page.getByRole('searchbox'), 'розгинання рук на блоці', { delay: 80 })
      await r.tap(btn(/^Розгинання рук на блоці/))
    })
    await r.step('Одна картка «Суперсет A»: A1, A2 і лічильник кіл', async () => {
      await r.tap(btn(/^Створити/))
      await r.wait(1000)
    }, { hold: 2500 })
    await r.step('Сет A1 — без відпочинку: «Далі A2», екран переходить до нього', async () => {
      await r.type(curl.getByRole('textbox', { name: 'кг' }).first(), '20')
      await r.type(curl.getByRole('textbox', { name: 'Повт' }).first(), '12')
      await r.tap(nextDone(curl))
    }, { hold: 2200 })
    await r.step('Сет A2 закриває коло — тепер відпочинок, «коло 2 з 3»', async () => {
      await r.type(pushdown.getByRole('textbox', { name: 'кг' }).first(), '15')
      await r.type(pushdown.getByRole('textbox', { name: 'Повт' }).first(), '15')
      await r.tap(nextDone(pushdown))
    }, { hold: 2500 })
    await r.step('Підсумок: дроп-сет — один ланцюжок, обсяг рахує всі дропи', async () => {
      await r.tap(btn('Далі', true))
      await r.tap(btn('Завершити', true))
      await r.wait(600)
      await r.tap(btn('Завершити тренування'))
      await r.wait(1200)
    }, { hold: 2500 })
  },
}
