# Copilot / AI Agent Instructions — wgc-frontend

Purpose: Short, actionable guidance to help an AI coding agent be immediately productive in this repository.

Summary
- Stack: Vue 3 + Vite, single-file components using <script setup>, Element Plus (UI), Leaflet (maps), axios for HTTP.
- Run/dev/build: `npm install` → `npm run dev` (dev), `npm run build` (production), `npm run preview` (serve build).
- Project layout: key folders: `src/components/` (reusable UI), `src/views/` (pages, organized by domain e.g. `driver/`, `admin/`), `src/router/` (lazy-loaded routes).

Important patterns & conventions
- Components use Vue 3 `<script setup>` SFC pattern. Prefer this style when adding new components.
- Routes are lazy-loaded with dynamic imports in `src/router/index.js` (example: `component: () => import('../views/driver/Simulator.vue')`). Add new pages under `src/views/<domain>/` and register them in the router with lazy import.
- UI: Element Plus is registered globally in `src/main.js` (`app.use(ElementPlus)`). Use Element Plus components for forms, buttons, tags, cards to match existing style.
- Maps: Leaflet CSS is imported in `src/main.js` (`import 'leaflet/dist/leaflet.css'`). The driver simulator uses Leaflet in `src/views/driver/Simulator.vue`. Common bug to watch: the call to create the map (`map = L.map('map').setView([...], zoom)`) is currently commented out in `Simulator.vue` — this will make the map fail to render.
- HTTP: axios is used directly (no centralized API client currently). Example: `await axios.post('http://localhost:8080/api/drivers/${driverId}/location', payload)` in `Simulator.vue`. If adding several endpoints, centralize with `src/services/api.js` and use Vite env var `import.meta.env.VITE_API_BASE`.

- i18n: The app uses `vue-i18n` for localization. Locale files live in `src/locales/zh.json` and `src/locales/en.json`. `src/main.js` initializes i18n and uses a saved `localStorage` locale if present; components use `$t` / `useI18n` (see `src/views/driver/Simulator.vue`) for translations.

Integration points
- Backend API: the simulator posts driver locations to `POST http://localhost:8080/api/drivers/:id/location`. Comments mention RabbitMQ/Redis — backend integrations are external to this repo.
- Dev tooling: Vite plugins include `@vitejs/plugin-vue` and `vite-plugin-vue-devtools` (see `vite.config.js`). Alias `@` points to `./src`.

Developer workflow notes
- Node engines: package.json requires Node ^20.19.0 or >=22.12.0. Use a compatible Node version when running scripts.
- Debugging map issues: confirm Leaflet CSS is imported (main.js), ensure `L.map('map')` is executed and the container `#map` has height (CSS is set in `Simulator.vue`). Use Vue DevTools (recommended in README) for inspecting component state.
- No tests or linter configured in repo: be conservative when changing behavior; consider adding a small smoke test or manual QA steps in PR description.

How to modify safely (examples)
- Add a new view:
  1. Create `src/views/<domain>/MyPage.vue` using `<script setup>`.
  2. Add route to `src/router/index.js` with a lazy import.
  3. Use Element Plus components and register any new icons in `src/components/icons` if needed.

- Centralize API calls (recommended):
  1. Create `src/services/api.js`:
     ```js
     import axios from 'axios'
     export default axios.create({ baseURL: import.meta.env.VITE_API_BASE || 'http://localhost:8080' })
     ```
  2. Replace direct `axios.post(url, payload)` with `api.post('/api/drivers/${id}/location', payload)`.

PR reviewer checklist for AI-generated changes
- Ensure Node engine compatibility and that `npm run dev` works locally.
- Element Plus and Leaflet imports remain intact (`src/main.js`).
- New routes are lazy-loaded and follow folder naming conventions.
- No hard-coded backend URLs are accidentally introduced — prefer `import.meta.env` env variables.
- If changing UI language text, preserve (or intentionally update) existing Chinese labels.

Notes / Gotchas
- UI copy and comments contain Chinese; follow existing language when adding new UI unless instructed otherwise.
- The simulator contains a clear TODO where backend status updates should be integrated; search for `TODO` comments when making changes.

If anything here is unclear or you want more examples (e.g., a starter `src/services/api.js` or a minimal smoke test), tell me which section to expand. 

---
Generated/updated by an AI agent at user's request. Please review and tell me any missing project-specific details to iterate.