import { useMutation } from '@tanstack/react-query'
import { extractUserId } from '@shared/lib/jwt'
import { signInApi } from '../api/auth.api'
import { useAuthStore } from '../model/auth-store'

export interface SignInVariables {
  account: string
  credential: string
}

export function useSignIn() {
  return useMutation({
    mutationFn: async ({ account, credential }: SignInVariables) => {
      const tokens = await signInApi({ account, accountType: 'email', credential })
      useAuthStore.getState().setTokens(tokens)
      useAuthStore.getState().setAccount(account)
      const userId = extractUserId(tokens.accessToken)
      if (userId !== null) useAuthStore.getState().setUserId(userId)
      return tokens
    }
  })
}
