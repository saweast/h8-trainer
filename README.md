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

Каталог вправ: `src/data/exercise-catalog.json` — єдине джерело (назви uk/en у застосунку + seed у БД).
Після зміни запусти `npm run gen:seed`.

## Деплой

`.github/workflows/deploy.yml` на кожен push у `main`: lint → test → build → GitHub Pages.
У репозиторії: Settings → Pages → Source: **GitHub Actions**; Settings → Secrets → Actions:
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
