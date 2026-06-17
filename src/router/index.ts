import { createRouter, createWebHistory } from 'vue-router'
import AppLayout from '../layouts/AppLayout.vue'

const routes = [
  {
    path: '/',
    component: AppLayout,
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

export default router
