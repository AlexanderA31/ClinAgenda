'use client';

import { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Role, SessionUser } from '@clinagenda/schemas';
import { api } from './api';

const SessionContext = createContext<SessionUser | null>(null);

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api<SessionUser>('/auth/me'), staleTime: 5 * 60_000, retry: false });
}

export function SessionProvider({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionUser {
  const user = useContext(SessionContext);
  if (!user) throw new Error('useSession fuera de SessionProvider');
  return user;
}

export function useCan(...roles: Role[]) {
  return roles.includes(useSession().role);
}
