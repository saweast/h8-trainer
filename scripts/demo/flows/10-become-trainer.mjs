// Тарас хоче вести клієнтів: адмін дає дозвіл, він вмикає режим тренера і додає першого клієнта.
export default {
  id: '10-become-trainer',
  title: 'Як стати тренером',
  subtitle: 'Дозвіл адміністратора, режим тренера і перший клієнт',
  audience: 'internal',
  async run(r) {
    await r.open('taras@demo.h8', '/profile')
    await r.step('Режим тренера вмикається лише з дозволу адміністратора', null, { hold: 2200 })

    const admin = await r.open('admin@demo.h8', '/profile', { title: false })
    await r.step('Адмін: Профіль → «Користувачі»', async () => {
      await r.tap(admin.getByRole('link', { name: /Користувачі/ }))
    }, { hold: 1600 })
    await r.step('Знаходимо Тараса і вмикаємо «Може бути тренером»', async () => {
      await r.type(admin.getByRole('searchbox'), 'Тарас')
      await r.wait(500)
      await r.tap(admin.getByRole('switch', { name: 'Тарас Шевчук: може бути тренером' }))
    }, { hold: 2000 })

    const page = await r.open('taras@demo.h8', '/profile', { title: false })
    await r.step('У Тараса з’явився перемикач «Я тренер»', async () => {
      await r.tap(page.getByRole('switch', { name: 'Я тренер' }))
    }, { hold: 1800 })
    await r.step('У шапці — режими «Я» і «Тренер»: власні тренування і клієнти', async () => {
      await r.tap(page.getByRole('radio', { name: 'Тренер' }).or(page.getByRole('button', { name: 'Тренер', exact: true })).first())
      await r.wait(800)
    }, { hold: 1800 })
    await r.step('Перший клієнт: без акаунта — або одразу запрошенням', async () => {
      await r.tap(page.getByRole('button', { name: 'Клієнт без акаунта' }))
      await r.wait(500)
      await r.type(page.getByRole('dialog').getByRole('textbox'), 'Олег Сидоренко')
    })
    await r.step('Готово — можна записувати заняття, продавати пакети, складати план', async () => {
      await r.tap(page.getByRole('button', { name: 'Створити клієнта' }))
      await r.wait(1200)
    }, { hold: 2500 })
  },
}
