import { createApp } from 'vue'
import App from './App.vue'
import router from './router' // 引入路由

// i18n
import { createI18n } from 'vue-i18n'
import zh from './locales/zh.json'
import en from './locales/en.json'

// 1. 引入 Element Plus 及其样式
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

// 2. 引入 Leaflet 的 CSS (否则地图会乱码)
import 'leaflet/dist/leaflet.css'

const messages = { zh, en }

const savedLocale = localStorage.getItem('locale') || (navigator.language && navigator.language.startsWith('en') ? 'en' : 'zh')
const i18n = createI18n({ legacy: false, locale: savedLocale, fallbackLocale: 'en', messages })

const app = createApp(App)

app.use(router)
app.use(ElementPlus) // 注册 UI 组件库
app.use(i18n)

app.mount('#app')