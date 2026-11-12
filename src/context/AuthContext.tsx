import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '../lib/users';

export interface UserProfile extends User {
  email: string;
  role: string;
  /** E.164 sem símbolos (ex.: 5511999999999) — usado pela integração WhatsApp. */
  phone?: string;
  preferences?: any;
  /** Perfil de acesso (users_profile.perfil). Ver src/lib/permissoes.ts. */
  perfil?: string;
  /**
   * Legado: 1 = administrador ou master, 2 = demais. Derivado do perfil — as
   * telas antigas ainda checam `permissionLevel === 1`.
   */
  permissionLevel?: number;
}

const PROFILE_COLUMNS = 'id, name, email, role, phone, preferences, avatar_url, perfil';

interface AuthContextType {
  currentUser: UserProfile | null;
  allUsers: UserProfile[];
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>, newPassword?: string) => Promise<{ success: boolean; error?: string }>;
  /** Recarrega `allUsers` — usado pela tela de administração após criar/remover contas. */
  refreshUsers: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function formatUser(u: any): UserProfile {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    phone: u.phone || undefined,
    preferences: u.preferences || {},
    avatarUrl: u.avatar_url,
    perfil: u.perfil || 'assistente',
    permissionLevel: u.perfil === 'administrador' || u.perfil === 'master' ? 1 : 2,
    initials: u.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase(),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId: string): Promise<void> {
    const { data } = await supabase
      .from('users_profile')
      .select(PROFILE_COLUMNS)
      .eq('id', userId)
      .single();
    if (data) setCurrentUser(formatUser(data));
  }

  async function loadAllUsers(): Promise<void> {
    const { data } = await supabase
      .from('users_profile')
      .select(PROFILE_COLUMNS);
    if (data) setAllUsers(data.map(formatUser));
  }

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await loadProfile(session.user.id);
      }
      await loadAllUsers();
      setLoading(false);
    }

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          setCurrentUser(null);
        } else if (event === 'SIGNED_IN' && session?.user) {
          await loadProfile(session.user.id);
          await loadAllUsers();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email: string, pass: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: pass.trim(),
      });

      if (error) {
        console.error('[Auth] signInWithPassword error:', error);
        const msg = (error.message || error.code || '').toLowerCase();
        if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials')) {
          return { success: false, error: 'E-mail ou senha incorretos.' };
        }
        if (msg.includes('email not confirmed')) {
          return { success: false, error: 'E-mail não confirmado. Contate o administrador.' };
        }
        return { success: false, error: error.message || error.code || 'Erro de autenticação.' };
      }

      return { success: true };
    } catch (e: any) {
      console.error('[Auth] login exception:', e);
      return { success: false, error: e?.message || 'Erro ao conectar com o servidor.' };
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
  };

  const updateProfile = async (updates: Partial<UserProfile>, newPassword?: string) => {
    if (!currentUser) return { success: false, error: 'Not logged in' };

    if (newPassword) {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) return { success: false, error: error.message };
    }

    const payload: any = {};
    // E-mail e perfil não passam por aqui: o banco recusa a troca feita pelo
    // próprio usuário (trigger protege_campos_perfil).
    if (updates.name        !== undefined) payload.name       = updates.name;
    if (updates.role       !== undefined) payload.role       = updates.role;
    if (updates.phone       !== undefined) payload.phone      = updates.phone || null;
    if (updates.preferences !== undefined) payload.preferences = updates.preferences;
    if (updates.avatarUrl   !== undefined) payload.avatar_url = updates.avatarUrl;

    if (Object.keys(payload).length > 0) {
      const { error } = await supabase
        .from('users_profile')
        .update(payload)
        .eq('id', currentUser.id);
      if (error) return { success: false, error: error.message };
    }

    const updatedProfile: UserProfile = { ...currentUser, ...updates };
    if (updates.name) {
      updatedProfile.initials = updates.name
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase();
    }

    setCurrentUser(updatedProfile);
    setAllUsers(prev => prev.map(u => u.id === updatedProfile.id ? updatedProfile : u));

    return { success: true };
  };

  return (
    <AuthContext.Provider value={{ currentUser, allUsers, login, logout, updateProfile, refreshUsers: loadAllUsers, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
