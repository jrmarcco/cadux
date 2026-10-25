import { httpRequest } from '@shared/api/http-client'
import type { ContactItem } from '@shared/types/api'

export function fetchContacts(): Promise<ContactItem[]> {
  return httpRequest<ContactItem[]>('/api/v1/contact/contacts')
}
