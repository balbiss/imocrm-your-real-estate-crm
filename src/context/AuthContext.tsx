import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type CadastroPayload = {
  imobiliariaNome: string;
  imobiliariaCnpj?: string;
  imobiliariaTelefone?: string;
  imobiliariaEmail: string;
  nomeCompleto: string;
  email: string;
  senha: string;
};

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  login: (email: string, senha: string) => Promise<void>;
  cadastrar: (data: CadastroPayload) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (novaSenha: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. listener primeiro
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
    });

    // 2. depois pega sessão atual
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const login = async (email: string, senha: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) throw error;
  };

  const cadastrar = async (data: CadastroPayload) => {
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.senha,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: {
          nome_completo: data.nomeCompleto,
          imobiliaria_nome: data.imobiliariaNome,
          imobiliaria_cnpj: data.imobiliariaCnpj ?? null,
          imobiliaria_telefone: data.imobiliariaTelefone ?? null,
          imobiliaria_email: data.imobiliariaEmail,
        },
      },
    });
    if (error) throw error;
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    if (error) throw error;
  };

  const updatePassword = async (novaSenha: string) => {
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, login, cadastrar, logout, resetPassword, updatePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
