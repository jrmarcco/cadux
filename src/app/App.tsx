import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { registerAuthBridge } from '@shared/api/auth-bridge'
import { useAuthStore } from '@features/user-auth'
import { useMessagingLifecycle } from '@features/messaging'
import { LoginPage } from '@pages/login'
import { MainPage } from '@pages/main'
import { QueryProvider } from './providers/query-provider'

export default function App() {
  return (
    <QueryProvider>
      <HashRouter>
        <Bootstrap />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/main" element={<MainPage />} />
          <Route path="*" element={<AuthRedirect />} />
        </Routes>
      </HashRouter>
    </QueryProvider>
  )
}

function AuthRedirect() {
  const authenticated = useAuthStore((state) => state.accessToken !== null)
  return <Navigate to={authenticated ? '/main' : '/login'} replace />
}

/** 装配: 鉴权桥接、通信引擎生命周期、登录态 → 窗口形态与路由联动 */
function Bootstrap() {
  useMessagingLifecycle()
  const navigate = useNavigate()
  const authenticated = useAuthStore((state) => state.accessToken !== null)

  useEffect(() => {
    registerAuthBridge({
      getAccessToken: () => useAuthStore.getState().accessToken,
      getRefreshToken: () => useAuthStore.getState().refreshToken,
      updateTokens: (tokens) => useAuthStore.getState().setTokens(tokens),
      onAuthLost: () => {
        // 触发 auth store 订阅链: messaging 数据重置 + 路由回登录页
        useAuthStore.getState().clear()
      }
    })
  }, [])

  useEffect(() => {
    if (authenticated) {
      void window.desktop.enterMain()
      void navigate('/main', { replace: true })
    } else {
      void window.desktop.enterLogin()
      void navigate('/login', { replace: true })
    }
  }, [authenticated, navigate])

  return null
}
