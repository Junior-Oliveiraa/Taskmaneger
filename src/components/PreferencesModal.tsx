import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { NOTIFICATION_GROUPS, DEADLINE_MILESTONES, isNotificationTypeEnabled } from '../lib/notificationTypes';

interface PreferencesModalProps {
  onClose: () => void;
  /** Chamado depois de gravar com sucesso (antes de fechar). */
  onSaved?: () => void;
}

const FOCO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60';

type Marcas = Record<string, boolean>;

/** Quais notificações o usuário recebe. Aberto pela engrenagem da Caixa de entrada. */
export default function PreferencesModal({ onClose, onSaved }: PreferencesModalProps) {
  const { currentUser, updateProfile } = useAuth();
  const [prefs, setPrefs] = useState<Marcas>(() => {
    const initial: Marcas = {};
    NOTIFICATION_GROUPS.forEach(group => {
      group.types.forEach(({ type }) => {
        initial[type] = isNotificationTypeEnabled(currentUser?.preferences, type);
      });
    });
    return initial;
  });
  const [deadlinePrefs, setDeadlinePrefs] = useState<Marcas>(() => {
    const initial: Marcas = {};
    DEADLINE_MILESTONES.forEach(({ key }) => {
      initial[key] = isNotificationTypeEnabled(currentUser?.preferences, 'deadline', key);
    });
    return initial;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const painel = useRef<HTMLDivElement | null>(null);

  // Foco entra no diálogo ao abrir e volta para quem o abriu ao fechar.
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    painel.current?.focus();
    return () => anterior?.focus();
  }, []);

  if (!currentUser) return null;

  const handleSave = async () => {
    setIsSaving(true);
    setErro(null);
    const atuais = currentUser.preferences?.notifications;
    const prazosAtuais = atuais?.deadline && typeof atuais.deadline === 'object' ? atuais.deadline : {};
    try {
      const res = await updateProfile({
        preferences: {
          ...currentUser.preferences,
          // Mescla para não apagar chaves que esta tela não mostra.
          notifications: { ...atuais, ...prefs, deadline: { ...prazosAtuais, ...deadlinePrefs } },
        },
      });
      if (!res.success) throw new Error(res.error);
      onSaved?.();
      onClose();
    } catch (e) {
      console.error('Erro ao salvar preferências de notificação', e);
      setErro('Não foi possível salvar. Tente novamente.');
      setIsSaving(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !isSaving) { e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab') return;
    const focaveis = Array.from(painel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])') || []);
    if (focaveis.length === 0) return;
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    if (e.shiftKey && (document.activeElement === primeiro || document.activeElement === painel.current)) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" onKeyDown={onKeyDown}>
      <div
        ref={painel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="preferencias-titulo"
        className="bg-[#121214] border border-zinc-800 rounded-xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[85vh] outline-none animate-slide-up"
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-zinc-800 shrink-0">
          <div>
            <h2 id="preferencias-titulo" className="text-heading font-semibold text-zinc-100">Preferências de notificação</h2>
            <p className="mt-0.5 text-body text-zinc-400">
              O que você desligar deixa de chegar na Caixa de entrada. As notificações já recebidas continuam lá.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className={`size-8 shrink-0 inline-flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-[#1f1f23] rounded-lg transition-colors ${FOCO}`}
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-5 overflow-y-auto scrollbar-minimal">
          {NOTIFICATION_GROUPS.map(group => (
            <Grupo
              key={group.label}
              titulo={group.label}
              opcoes={group.types.map(({ type, label }) => ({
                chave: type,
                rotulo: label,
                // O aviso de WhatsApp nasce da notificação gravada (trigger no banco).
                ajuda: type === 'alcada_pending' ? 'Desligar também interrompe o aviso por WhatsApp.' : undefined,
              }))}
              marcas={prefs}
              onMudar={mudancas => setPrefs(prev => ({ ...prev, ...mudancas }))}
            />
          ))}
          {/* Cada marco de prazo dispara o próprio alerta, então cada um tem o seu controle. */}
          <Grupo
            titulo="Prazos"
            opcoes={DEADLINE_MILESTONES.map(({ key, label }) => ({ chave: key, rotulo: label }))}
            marcas={deadlinePrefs}
            onMudar={mudancas => setDeadlinePrefs(prev => ({ ...prev, ...mudancas }))}
          />
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-zinc-800 shrink-0">
          {erro && <p role="alert" className="mr-auto text-body text-red-400">{erro}</p>}
          <button type="button" onClick={onClose} disabled={isSaving} className={`h-8 px-3 rounded-lg text-body text-zinc-300 hover:text-zinc-100 ${FOCO}`}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className={`h-8 px-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-body font-medium disabled:opacity-50 ${FOCO}`}
          >
            {isSaving && <Loader2 size={14} className="animate-spin" aria-hidden />}
            Salvar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Grupo({ titulo, opcoes, marcas, onMudar }: {
  titulo: string;
  opcoes: { chave: string; rotulo: string; ajuda?: string }[];
  marcas: Marcas;
  onMudar: (mudancas: Marcas) => void;
}) {
  const ligadas = opcoes.filter(o => marcas[o.chave]).length;
  const todas = ligadas === opcoes.length;
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="sr-only">{titulo}</legend>
      <div className="flex items-center justify-between gap-3 px-2">
        <span className="text-body font-semibold text-zinc-200" aria-hidden>{titulo}</span>
        {opcoes.length > 1 && (
          <button
            type="button"
            aria-label={`${todas ? 'Desligar' : 'Ligar'} todas de ${titulo}`}
            onClick={() => onMudar(Object.fromEntries(opcoes.map(o => [o.chave, !todas])))}
            className={`text-caption text-zinc-300 hover:text-zinc-100 underline underline-offset-2 rounded px-1 ${FOCO}`}
          >
            {todas ? 'Desligar todas' : 'Ligar todas'}
          </button>
        )}
      </div>
      {opcoes.map(o => (
        <label key={o.chave} className="flex items-center justify-between gap-3 min-h-9 py-1.5 px-2 rounded-lg hover:bg-[#161619] cursor-pointer transition-colors">
          <span className="min-w-0">
            <span className="block text-body text-zinc-300">{o.rotulo}</span>
            {o.ajuda && <span className="block text-caption text-zinc-400">{o.ajuda}</span>}
          </span>
          <input
            type="checkbox"
            checked={!!marcas[o.chave]}
            onChange={e => onMudar({ [o.chave]: e.target.checked })}
            className={`size-4 shrink-0 accent-blue-600 cursor-pointer rounded ${FOCO}`}
          />
        </label>
      ))}
    </fieldset>
  );
}
