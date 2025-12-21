import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // 1. 默认首页 -> 跳转到司机端
    {
      path: '/',
      redirect: '/driver'
    },
    // 2. 司机模拟器模块
    {
      path: '/driver',
      name: 'DriverSimulator',
      // 懒加载：只有访问这个页面时才加载代码
      component: () => import('../views/driver/Simulator.vue')
    },
    // 3. 后台管理模块
    {
      path: '/admin',
      name: 'AdminDashboard',
      component: () => import('../views/admin/Dashboard.vue')
    }
  ]
})

export default router