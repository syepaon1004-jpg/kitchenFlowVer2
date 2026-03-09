import { create } from 'zustand';
import type { User, Session } from '@supabase/supabase-js';
import type { Store, StoreUser } from '../types/db';
import { supabase } from '../lib/supabase';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  selectedStore: Store | null;
  selectedUser: StoreUser | null;
  isAdmin: boolean;

  setAuth: (session: Session | null) => void;
  setSelectedStore: (store: Store | null) => void;
  setSelectedUser: (user: StoreUser | null) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,
  selectedStore: null,
  selectedUser: null,
  isAdmin: false,

  setAuth: (session) =>
    set({
      session,
      user: session?.user ?? null,
    }),

  setSelectedStore: (store) => set({ selectedStore: store }),

  setSelectedUser: (user) =>
    set({
      selectedUser: user,
      isAdmin: user?.role === 'admin',
    }),

  clear: () =>
    set({
      user: null,
      session: null,
      selectedStore: null,
      selectedUser: null,
      isAdmin: false,
    }),
}));

export function initAuthListener() {
  const { setAuth } = useAuthStore.getState();

  supabase.auth.getSession().then(({ data: { session } }) => {
    setAuth(session);
    useAuthStore.setState({ loading: false });
  });

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    setAuth(session);
  });

  return () => subscription.unsubscribe();
}
