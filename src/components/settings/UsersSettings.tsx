import React, { useState, useEffect, useCallback } from 'react';
import { UserPlus, Trash2, Pencil, Loader2, X, Save, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { maskPhoneInput, formatPhoneDisplay } from '../../lib/phone';
import ConfirmModal from '../ConfirmModal';
import { PERFIS, PERFIS_CONFIGURAVEIS, rotuloPerfil } from '../../lib/permissoes';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role?: string;
  phone?: string;
  preferences?: any;
  perfil?: string;
}

interface FormState {
  id?: string;
  name: string;
  email: string;
  role: string;
  phone: string;
  password: string;
  perfil: string;
}

const EMPTY_FORM: FormState = { name: '', email: '', role: '', phone: '', password: '', perfil: 'assistente' };

/**
 * Chama a Edge Function `admin-users`, que roda com service role e revalida
 * do lado do servidor se quem chamou é mesmo administrador.
 */
async function callAdminUsers(action: string, payload?: unknown) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sessão expirada. Faça login novamente.');

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, payload }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Erro ${res.status}`);
  return body;
}

export default function UsersSettings() {
  const { currentUser, refreshUsers } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { users: list } = await callAdminUsers('list');
      setUsers(list || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setIsSaving(true);
    setError(null);

    try {
      if (form.id) {
        await callAdminUsers('update', {
          id: form.id,
          name: form.name,
          role: form.role,
          phone: form.phone,
          perfil: form.perfil,
          password: form.password || undefined,
        });
      } else {
        await callAdminUsers('create', {
          name: form.name,
          email: form.email,
          role: form.role,
          phone: form.phone,
          perfil: form.perfil,
          password: form.password,
        });
      }
      setForm(null);
      await load();
      await refreshUsers();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (user: AdminUser) => {
    setConfirmDelete(null);
    setError(null);
    try {
      await callAdminUsers('delete', { id: user.id });
      await load();
      await refreshUsers();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const inputClass = 'w-full bg-[#08080a] border border-zinc-800 rounded-md py-1.5 px-3 text-xs text-zinc-200 focus:outline-none focus:border-blue-500/50 transition-colors placeholder:text-zinc-600';
  const labelClass = 'text-[10px] uppercase font-semibold text-zinc-500 tracking-wider';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">Usuários</h3>
          <p className="text-[11px] text-zinc-500">Cadastre, edite ou remova quem tem acesso ao Orbit.</p>
        </div>
        <button
          onClick={() => setForm({ ...EMPTY_FORM })}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md transition-colors"
        >
          <UserPlus size={13} />
          Novo Usuário
        </button>
      </div>

      {error && (
        <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 p-2.5 rounded-md">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-zinc-500 py-8 justify-center">
          <Loader2 size={14} className="animate-spin" /> Carregando usuários...
        </div>
      ) : (
        <div className="border border-zinc-900 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-zinc-950/50 text-zinc-500">
              <tr>
                <th className="text-left font-medium px-3 py-2">Nome</th>
                <th className="text-left font-medium px-3 py-2">E-mail</th>
                <th className="text-left font-medium px-3 py-2">Cargo</th>
                <th className="text-left font-medium px-3 py-2">WhatsApp</th>
                <th className="text-left font-medium px-3 py-2">Perfil</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-t border-zinc-900 text-zinc-300 hover:bg-zinc-900/30">
                  <td className="px-3 py-2 font-medium flex items-center gap-1.5">
                    {u.perfil === 'administrador' && (
                      <ShieldCheck size={12} className="text-blue-400 shrink-0" />
                    )}
                    {u.name}
                  </td>
                  <td className="px-3 py-2 text-zinc-500">{u.email}</td>
                  <td className="px-3 py-2 text-zinc-500">{u.role || '—'}</td>
                  <td className={`px-3 py-2 ${u.phone ? 'text-zinc-500' : 'text-amber-500/70'}`}>
                    {u.phone ? formatPhoneDisplay(u.phone) : 'não cadastrado'}
                  </td>
                  <td className="px-3 py-2 text-zinc-500">
                    {rotuloPerfil(u.perfil)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => setForm({
                          id: u.id,
                          name: u.name,
                          email: u.email,
                          role: u.role || '',
                          phone: u.phone ? formatPhoneDisplay(u.phone).replace('+55 ', '') : '',
                          password: '',
                          perfil: u.perfil || 'assistente',
                        })}
                        className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
                        title="Editar"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(u)}
                        disabled={u.id === currentUser?.id}
                        className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors disabled:opacity-30 disabled:hover:text-zinc-500 disabled:hover:bg-transparent"
                        title={u.id === currentUser?.id ? 'Você não pode remover a própria conta' : 'Remover'}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-zinc-600">Nenhum usuário encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Formulário de criação/edição */}
      {form && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#121214] border border-zinc-800 rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800/50">
              <h2 className="text-sm font-semibold text-zinc-200">
                {form.id ? 'Editar Usuário' : 'Novo Usuário'}
              </h2>
              <button
                onClick={() => setForm(null)}
                className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 rounded-md transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>Nome</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    className={inputClass}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>Cargo</label>
                  <input
                    type="text"
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    placeholder="Ex: Financeiro"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className={labelClass}>E-mail</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  disabled={!!form.id}
                  className={`${inputClass} disabled:opacity-50`}
                />
                {form.id && <span className="text-[9px] text-zinc-600">O e-mail de login não pode ser alterado por aqui.</span>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>WhatsApp</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: maskPhoneInput(e.target.value) })}
                    placeholder="(11) 99999-9999"
                    className={inputClass}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>Perfil de acesso</label>
                  {/* O administrador é único e não é trocado por aqui. */}
                  {form.perfil === 'administrador' ? (
                    <input value="Administrador" disabled className={`${inputClass} disabled:opacity-50`} />
                  ) : (
                    <select
                      value={form.perfil}
                      onChange={(e) => setForm({ ...form, perfil: e.target.value })}
                      className={inputClass}
                    >
                      {PERFIS.filter(p => (PERFIS_CONFIGURAVEIS as string[]).includes(p.id)).map(p => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className={labelClass}>{form.id ? 'Nova Senha' : 'Senha'}</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required={!form.id}
                  minLength={6}
                  placeholder={form.id ? 'Deixe em branco para não alterar' : 'Mínimo 6 caracteres'}
                  className={inputClass}
                />
              </div>

              <div className="flex items-center justify-end gap-2 mt-2 pt-4 border-t border-zinc-800/50">
                <button
                  type="button"
                  onClick={() => setForm(null)}
                  className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md transition-all disabled:opacity-50"
                >
                  {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  {form.id ? 'Salvar' : 'Criar Usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!confirmDelete}
        title="Remover usuário"
        message={`Remover "${confirmDelete?.name}"? A conta perde o acesso imediatamente e esta ação não pode ser desfeita.`}
        confirmText="Remover"
        cancelText="Cancelar"
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
