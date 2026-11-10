// Олена веде заняття з Андрієм: вправи обирає по ходу, заняття списується з пакета.
export default {
  id: '03-trainer-live-session',
  title: 'Тренер: заняття з клієнтом',
  subtitle: 'Вправи обираються під час заняття, сесія списується з пакета',
  audience: 'trainer',
  async run(r) {
    const page = await r.open('olena@demo.h8', '/trainer')
    const btn = (name, exact = false) => page.getByRole('button', { name, exact })
    const kg = (i) => page.getByRole('textbox', { name: 'кг' }).nth(i)
    const reps = (i) => page.getByRole('textbox', { name: 'Повт' }).nth(i)
    const nextDone = () => btn('Сет виконано').first()

    await r.step('Режим тренера: клієнти, залишок пакета, хто давно не був', null, { hold: 1800 })
    await r.step('Картка клієнта: пакет, абонемент, останнє заняття', async () => {
      await r.tap(page.locator('a[href*="/trainer/clients/"]', { hasText: 'Андрій Мельник' }))
    }, { hold: 1800 })
    await r.step('«Почати тренування» — запис за клієнта, сесія спишеться з пакета', async () => {
      await r.tap(btn('Почати тренування').first())
    }, { hold: 2000 })
    await r.step('Порожнє тренування: вправи — по ходу заняття', async () => {
      await r.tap(btn(/^Порожнє тренування/))
    })
    await r.step('Додаємо вправу, яку клієнт ще не робив', async () => {
      await r.tap(btn('Додати вправу').first())
      await r.wait(500)
      await r.type(page.getByRole('searchbox'), 'жим ногами', { delay: 80 })
      await r.tap(btn(/^Жим ногами/))
    })
    await r.step('Вписуємо вагу й повтори — і відмічаємо підхід', async () => {
      await r.type(kg(0), '100')
      await r.type(reps(0), '12')
      await r.tap(nextDone())
      await r.wait(600)
      for (let i = 1; i < 3; i++) {
        await r.type(kg(i), '110', { delay: 50 })
        await r.type(reps(i), '10', { delay: 50 })
        await r.tap(nextDone(), { pause: 300 })
        await r.wait(400)
      }
      await r.tap(btn('Далі', true))
    })
    await r.step('Знайома вправа — підставляється минулий раз клієнта', async () => {
      await r.tap(btn('Додати вправу').last())
      await r.wait(500)
      await r.type(page.getByRole('searchbox'), 'тяга верхнього', { delay: 80 })
      await r.tap(btn(/^Тяга верхнього блоку вузьким хватом/))
      await r.wait(1200)
    }, { hold: 1800 })
    await r.step('Підходи — одним тапом', async () => {
      for (let i = 0; i < 3; i++) {
        await r.tap(nextDone(), { pause: 250 })
        await r.wait(350)
      }
      await r.tap(btn('Далі', true))
    })
    await r.step('Завершуємо — заняття записане в історію клієнта', async () => {
      await r.tap(btn('Завершити', true))
      await r.wait(700)
      await r.tap(btn('Завершити тренування'))
      await r.wait(1200)
    }, { hold: 2000 })
    await r.step('Коментар для клієнта під тренуванням', async () => {
      const box = page.getByPlaceholder('Напиши коментар…')
      await box.scrollIntoViewIfNeeded()
      await r.type(box, 'Молодець! Наступного разу +10 кг на жимі ногами', { delay: 45 })
      await r.tap(btn('Надіслати'))
    }, { hold: 2000 })
    await r.step('У картці клієнта: у пакеті на одне заняття менше', async () => {
      // the workout was started from the client page, so "back" lands there
      await page.goBack()
      await page.waitForURL(/\/trainer\/clients\//)
      await r.wait(800)
    }, { hold: 2500 })
  },
}
