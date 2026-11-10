// Каталог вправ, гайд з технікою і своя вправа (тренажер свого залу).
export default {
  id: '11-exercises',
  title: 'Каталог вправ',
  subtitle: 'Техніка з фото й відео, власні вправи під тренажери свого залу',
  audience: 'all',
  async run(r) {
    const page = await r.open('sofia@demo.h8', '/')
    const dialog = () => page.getByRole('dialog')

    await r.step('Каталог: понад 80 вправ із фото й технікою', async () => {
      await r.tap(page.getByRole('link', { name: 'Вправи', exact: true }))
    }, { hold: 1600 })
    await r.step('Фільтр за групою м’язів', async () => {
      await r.tap(page.getByRole('button', { name: 'Спина', exact: true }))
    }, { hold: 1500 })
    await r.step('Сторінка вправи: техніка — фото, кроки, на що зважати, відео', async () => {
      await r.tap(page.getByRole('link', { name: /Тяга верхнього блоку$/ }).or(page.getByRole('link', { name: /^Тяга верхнього блоку/ })).first())
      await r.wait(1000)
      await r.scroll(700)
    }, { hold: 2200 })
    await r.step('Тренажера немає в каталозі? Створюємо свою вправу', async () => {
      await page.goBack()
      await r.wait(600)
      await r.tap(page.getByRole('button', { name: 'Створити вправу' }).first())
      await r.wait(600)
      await r.type(page.locator('#exercise-name'), 'Жим ногами Hammer')
      await r.tap(dialog().getByRole('button', { name: 'Тренажер', exact: true }))
      await r.tap(dialog().getByRole('button', { name: 'Ноги', exact: true }))
    }, { hold: 1500 })
    await r.step('Крок ваги, відпочинок, налаштування тренажера й опис', async () => {
      await r.type(page.locator('#exercise-step'), '5')
      await r.type(page.locator('#exercise-setup'), 'Спинка 3, ноги на ширині плечей', { delay: 45 })
      await r.type(page.locator('#exercise-description'), 'Не випрямляй коліна до кінця вгорі', { delay: 45 })
    }, { hold: 1500 })
    await r.step('Зберегли — вправа «своя» в каталозі й у тренуваннях', async () => {
      await r.tap(page.getByRole('button', { name: 'Зберегти вправу' }))
      await r.wait(1200)
      if (!page.url().includes('/exercises/')) await r.type(page.getByRole('searchbox'), 'Hammer')
      await r.wait(800)
    }, { hold: 2500 })
  },
}
