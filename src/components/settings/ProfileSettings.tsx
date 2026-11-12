import React, { useState, useRef } from 'react';
import { Camera, Save, Loader2, Settings } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { uploadToStorage, UPLOAD_LIMITS } from '../../lib/storage';
import { maskPhoneInput, normalizePhoneBR, formatPhoneDisplay } from '../../lib/phone';
import PreferencesModal from '../PreferencesModal';

interface ProfileSettingsProps {
  /** Quando informado, exibe o botão Cancelar e fecha o container após salvar (uso em modal). */
  onClose?: () => void;
}

/** Formulário de perfil do usuário logado — aba "Perfil" das Configurações Gerais. */
export default function ProfileSettings({ onClose }: ProfileSettingsProps) {
  const { currentUser, updateProfile } = useAuth();
  const { addNotification } = useNotifications();

  const [name, setName] = useState(currentUser?.name || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [role, setRole] = useState(currentUser?.role || '');
  const [phone, setPhone] = useState(
    currentUser?.phone ? formatPhoneDisplay(currentUser.phone).replace('+55 ', '') : ''
  );
  const [password, setPassword] = useState('');
  const [avatarPreview, setAvatarPreview] = useState(currentUser?.avatarUrl || '');
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > UPLOAD_LIMITS.avatar) {
      setError(`A imagem deve ter no máximo ${UPLOAD_LIMITS.avatar / (1024 * 1024)}MB.`);
      return;
    }
    setPendingAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setError(null);
  };

  if (!currentUser) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const updates: any = {};
      if (name !== currentUser.name) updates.name = name;
      if (role !== currentUser.role) updates.role = role;

      // Telefone vai para o banco em E.164; vazio limpa o cadastro.
      const trimmedPhone = phone.trim();
      if (trimmedPhone === '') {
        if (currentUser.phone) updates.phone = '';
      } else {
        const normalized = normalizePhoneBR(trimmedPhone);
        if (!normalized) {
          setError('Telefone inválido. Use DDD + número, ex: (11) 99999-9999.');
          setIsSaving(false);
          return;
        }
        if (normalized !== currentUser.phone) updates.phone = normalized;
      }

      if (pendingAvatarFile) {
        const url = await uploadToStorage('avatars', currentUser.id, pendingAvatarFile, UPLOAD_LIMITS.avatar);
        updates.avatarUrl = url;
      }

      const res = await updateProfile(updates, password || undefined);

      if (res.success) {
        addNotification({
          userId: currentUser.id,
          actorId: 'system',
          taskId: 'system',
          type: 'properties_changed',
          message: 'Perfil atualizado',
          details: 'Seus dados foram salvos com sucesso.'
        });
        setPassword('');
        setPendingAvatarFile(null);
        if (onClose) {
          onClose();
        } else {
          setSuccess(true);
          setIsSaving(false);
        }
      } else {
        setError(res.error || 'Erro ao salvar o perfil.');
        setIsSaving(false);
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar imagem.');
      setIsSaving(false);
    }
  };

  const inputClass = 'w-full bg-[#08080a] border border-zinc-800 rounded-md py-1.5 px-3 text-xs text-zinc-200 focus:outline-none focus:border-blue-500/50 transition-colors placeholder:text-zinc-600';
  const labelClass = 'text-[10px] uppercase font-semibold text-zinc-500 tracking-wider';

  return (
    <>
      <form onSubmit={handleSave} className="p-5 flex flex-col gap-4">
        {/* Avatar */}
        <div className="flex items-center gap-4 mb-2">
          <div className="relative group shrink-0">
            {avatarPreview ? (
              <img src={avatarPreview} alt={name} className="w-16 h-16 rounded-full object-cover border border-zinc-700" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-purple-500 to-blue-600 flex items-center justify-center text-white text-xl font-bold border border-zinc-700">
                {currentUser.initials || 'US'}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <label className={`${labelClass} mb-2 block`}>Foto de Perfil</label>
            <div>
              <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-md border border-zinc-700/50 transition-colors shadow-sm"
              >
                <Camera size={13} />
                Escolher Imagem...
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Nome</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Cargo</label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Ex: Designer, Dev..."
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>E-mail</label>
            {/* Somente leitura: o e-mail identifica o login e só o administrador o altera. */}
            <input type="email" value={email} readOnly disabled className={`${inputClass} disabled:opacity-50`} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>WhatsApp</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(maskPhoneInput(e.target.value))}
              placeholder="(11) 99999-9999"
              className={inputClass}
            />
            <span className="text-[9px] text-zinc-600">Recebe os avisos de títulos aguardando sua alçada.</span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClass}>Nova Senha</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Deixe em branco para não alterar"
            className={inputClass}
          />
        </div>

        {error && (
          <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 p-2 rounded-md">{error}</div>
        )}
        {success && (
          <div className="text-emerald-400 text-xs bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-md">
            Perfil salvo com sucesso.
          </div>
        )}

        <div className="flex items-center justify-between gap-2 mt-4 pt-4 border-t border-zinc-800/50">
          <button
            type="button"
            onClick={() => setShowPreferences(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 rounded-md transition-colors"
          >
            <Settings size={13} />
            Preferências
          </button>
          <div className="flex items-center gap-2">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancelar
              </button>
            )}
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md shadow-sm transition-all disabled:opacity-50"
            >
              {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Salvar Alterações
            </button>
          </div>
        </div>
      </form>
      {showPreferences && <PreferencesModal onClose={() => setShowPreferences(false)} />}
    </>
  );
}
