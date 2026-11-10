# h8 trainer

Mobile-first журнал тренувань для залу і тренерів: тренажер → вага → повтори, прогрес і рекорди,
шаблони й програми, клієнти тренера з пакетами тренувань і абонементами.

**Стек:** Vite + React 19 + TypeScript · Tailwind CSS v4 + shadcn/ui (Radix) · Supabase (Postgres, Google Auth, RLS) · GitHub Pages.

## Локальний запуск

```bash
npm install
npm run dev        # http://localhost:5173/h8-trainer/
```

Без `.env.local` застосунок відкривається в **демо-режимі** (інтерфейс без бази даних).
Щоб підключити Supabase, скопіюй `.env.example` у `.env.local` і заповни:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

## Скрипти

| Команда | Що робить |
| --- | --- |
| `npm run dev` | dev-сервер |
| `npm run build` | type-check + збірка в `dist/` (+ `404.html` для deep links на Pages) |
| `npm test` | Vitest: утиліти + міграції й RLS у PGlite (Postgres у WASM, без Docker) |
| `npm run lint` | oxlint |
| `npm run gen:seed` | перегенерувати seed вправ із `src/data/exercise-catalog.json` |
| `npm run db:push` | застосувати нові міграції до підключеного проєкту Supabase |
| `npm run gen:types` | оновити `src/lib/db.types.ts` зі схеми БД |

## База даних

Міграції — у `supabase/migrations/`, усі права доступу — політики RLS (браузер ходить у Postgres напряму).
`supabase/tests/db.test.ts` проганяє міграції та перевіряє ізоляцію даних, тренерський доступ,
перенесення історії через запрошення і захист списаних тренувань.

Застосувати міграції до свого проєкту:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npm run db:push        # = supabase db push --remote (CLI v3 без --remote цілиться в локальну БД)
npm run gen:types
```

### Ролі

- **Тренер.** Режим тренера користувач вмикає сам («Я тренер» у профілі), але тільки з дозволом
  адміністратора (`profiles.can_be_trainer`). Якщо дозвіл забрати, режим тренера вимикається і
  доступ до клієнтів закривається. Зв'язки зберігаються і повертаються разом із дозволом.
- **Адміністратор** (`profiles.is_admin`) бачить у профілі сторінку «Користувачі»: усі акаунти,
  перемикач «Може бути тренером», клієнтів кожного тренера та їхні тренування (лише читання,
  через `admin_*` RPC). Із застосунку адміна не призначити. Першого адміна задають у SQL editor Supabase:

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = '<email>');
```

Каталог вправ: `src/data/exercise-catalog.json` — єдине джерело (назви uk/en у застосунку + seed у БД).
Після зміни запусти `npm run gen:seed`.

## Демо-відео флов

`scripts/demo/` записує відео кожного сценарію (звичайне тренування, заняття тренера з клієнтом,
шаблони й план по тижнях, відгуки, запрошення, пакети…) на **локальній** копії бази з демо-акаунтами —
прод не чіпається. Потрібен запущений Docker Desktop.

```bash
npm run demo:up                 # локальний Supabase + .env.demo.local
npm run demo:record             # усі флови: reset БД → seed → запис → demo/videos/*.mp4
npm run demo:record -- 05 07    # лише флови, чиї id містять 05 або 07
npm run demo:guide              # сторінка-гайд demo/guide/index.html з відео й скрінами кроків
```

Кожен флов — файл у `scripts/demo/flows/` з кроками «підпис + дія»; підписи малюються під екраном
телефона, тапи підсвічуються. Демо-персонажі та їхня історія — у `scripts/demo/seed.mjs`.
Під час запису Chromium відкривається у вікні за межами екрана (headless пише відео лише в 1×).

## Деплой

`.github/workflows/deploy.yml` на кожен push у `main`: lint → test → build → GitHub Pages.
У репозиторії: Settings → Pages → Source: **GitHub Actions**; Settings → Secrets → Actions:
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
