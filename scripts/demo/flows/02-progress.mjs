// Софія дивиться історію, прогрес по вправах і заміри тіла.
export default {
  id: '02-progress',
  title: 'Історія і прогрес',
  subtitle: 'Календар тренувань, рекорди, графіки й заміри тіла',
  audience: 'client',
  async run(r) {
    const page = await r.open('sofia@demo.h8', '/')
    const nav = (name) => page.getByRole('link', { name, exact: true })

    await r.step('Історія: календар — дні з тренуваннями позначені', async () => {
      await r.tap(nav('Історія'))
    })
    await r.step('Тап по дню — тренування цього дня', async () => {
      await r.tap(page.getByRole('gridcell', { name: /Є тренування/ }).last())
    })
    await r.step('Деталі: кожен підхід, рекорди, коментарі тренера', async () => {
      await r.tap(page.locator('main a[href*="/workout/"]').first())
      await r.wait(800)
      await r.scroll(400)
    }, { hold: 2000 })
    await r.step('Прогрес: тренування й обсяг за 30 днів, рекорди по вправах', async () => {
      await page.goBack()
      await r.wait(600)
      await r.tap(nav('Прогрес'))
    }, { hold: 2000 })
    await r.step('Вправа: макс. вага, розрахунковий 1ПМ і графік', async () => {
      await r.tap(page.getByRole('link', { name: /Присідання зі штангою/ }))
      await r.wait(800)
    }, { hold: 2200 })
    await r.step('Графік можна перемкнути: вага, обсяг', async () => {
      await r.tap(page.getByRole('radio', { name: 'Вага' }))
      await r.wait(1200)
      await r.tap(page.getByRole('radio', { name: 'Обсяг' }))
      await r.wait(600)
      await r.scroll(500)
    }, { hold: 2000 })
    await r.step('Заміри тіла: останні значення й динаміка', async () => {
      await page.goBack()
      await r.wait(600)
      await r.wait(500)
      await r.tap(page.getByRole('link', { name: /Заміри тіла/ }))
      await r.wait(800)
    }, { hold: 2000 })
    await r.step('Новий замір: вага і талія', async () => {
      await r.tap(page.getByRole('button', { name: 'Додати замір' }))
      await r.wait(600)
      await r.type(page.locator('#m-weightKg'), '61,8')
      await r.type(page.locator('#m-waistCm'), '68,5')
    })
    await r.step('Зберегли — графік одразу оновився', async () => {
      await r.tap(page.getByRole('button', { name: 'Зберегти', exact: true }))
      await r.wait(1200)
    }, { hold: 2500 })
  },
}
