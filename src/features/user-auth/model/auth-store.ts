import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  /** int64 十进制字符串, 登录时从 JWT 无损解析; 不持久化 ( 旧版本曾存损坏的 number ) */
  userId: string | null
  account: string | null
  setTokens: (tokens: { accessToken: string; refreshToken: string }) => void
  setUserId: (userId: string) => void
  setAccount: (account: string) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      userId: null,
      account: null,
      setTokens: (tokens) => set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }),
      setUserId: (userId) => set({ userId }),
      setAccount: (account) => set({ account }),
      clear: () => set({ accessToken: null, refreshToken: null, userId: null, account: null })
    }),
    {
      name: 'cadux/auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        account: state.account
      }),
      // 旧版本曾把 int64 userId 以 number 持久化 ( 精度风险 ), 一律丢弃, 由 JWT 无损重析
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<AuthState>),
        userId: null
      })
    }
  )
)
