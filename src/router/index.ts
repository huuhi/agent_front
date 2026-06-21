import { createRouter, createWebHistory } from 'vue-router'
import AppLayout from '../layouts/AppLayout.vue'

const routes = [
  {
    path: '/auth',
    name: 'auth',
    component: () => import('../pages/AuthPage.vue'),
  },
  {
    path: '/',
    component: AppLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        redirect: { name: 'chat' },
      },
      {
        path: 'chat/:sessionId?',
        name: 'chat',
        component: () => import('../NexusAgent.vue'),
      },
      {
        path: 'files',
        name: 'files',
        component: () => import('../pages/FilesPage.vue'),
      },
      {
        path: 'knowledge',
        name: 'knowledge',
        component: () => import('../pages/KnowledgeBasePage.vue'),
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Navigation guard: redirect to /auth if no token
router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('token')
  if (to.meta.requiresAuth && !token) {
    next({ name: 'auth' })
  } else if (to.name === 'auth' && token) {
    next({ name: 'chat' })
  } else {
    next()
  }
})

export default router
