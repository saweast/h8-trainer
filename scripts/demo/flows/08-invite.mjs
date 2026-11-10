// Марко тренувався з Оленою без акаунта; вона надсилає запрошення, історія переходить до нього.
export default {
  id: '08-invite',
  title: 'Запрошення клієнта',
  subtitle: 'Клієнт без акаунта отримує посилання — і вся історія переходить до нього',
  audience: 'trainer',
  async run(r) {
    const page = await r.open('olena@demo.h8', '/trainer')
    const marko = () => page.locator('a[href*="/trainer/clients/"]', { hasText: 'Марко Ткач' })

    await r.step('Марко тренується з Оленою, але без акаунта — історію веде тренерка', async () => {
      await r.tap(marko())
    }, { hold: 1800 })
    await r.step('Меню клієнта → «Запросити в акаунт»', async () => {
      await r.tap(page.getByRole('button', { name: 'Дії з клієнтом' }))
      await r.tap(page.getByRole('menuitem', { name: 'Запросити в акаунт' }))
    }, { hold: 2200 })
    const url = (await page.locator('output').filter({ hasText: '/invite/' }).textContent()).trim()
    const path = url.slice(url.indexOf('/invite/'))
    await r.step('Посилання одноразове, діє 7 днів — надсилаємо в месенджер', null, { hold: 1800 })

    await r.open(null, path, { title: false })
    await r.step('Клієнт відкриває посилання і входить через Google', null, { hold: 2200 })

    const client = await r.open('marko@demo.h8', path, { title: false })
    await r.step('Запрошення: хто тренер і що станеться з історією', null, { hold: 2200 })
    await r.step('«Прийняти» — Олена тепер тренерка Марка', async () => {
      await r.tap(client.getByRole('button', { name: 'Прийняти запрошення' }))
      await r.wait(1500)
    }, { hold: 1500 })
    await r.step('Усі тренування, записані тренеркою, — тепер у його акаунті', async () => {
      if (!/\/h8-trainer\/?$/.test(new URL(client.url()).pathname)) {
        await r.tap(client.getByRole('link', { name: 'На головну' }).or(client.getByRole('button', { name: 'На головну' })))
      }
      await r.wait(1200)
    }, { hold: 2200 })

    const trainer = await r.open('olena@demo.h8', '/trainer', { title: false })
    await r.step('У тренерки Марко вже з акаунтом: бачить свої тренування, а вона — його прогрес', async () => {
      await r.tap(trainer.locator('a[href*="/trainer/clients/"]', { hasText: 'Марко Ткач' }))
    }, { hold: 2200 })
  },
}
