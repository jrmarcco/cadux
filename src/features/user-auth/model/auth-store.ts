import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  userId: number | null
  account: string | null
  setTokens: (tokens: { accessToken: string; refreshToken: string }) => void
  setUserId: (userId: number) => void
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
      name: 'cadux/auth'
    }
  )
)
