import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@features/user-auth'
import { fetchContacts } from '../api/contacts.api'

export function useContacts() {
  const authenticated = useAuthStore((state) => state.accessToken !== null)
  return useQuery({
    queryKey: ['contacts'],
    queryFn: fetchContacts,
    enabled: authenticated,
    staleTime: 60_000,
    retry: 1
  })
}
