// Propriedade "Responsáveis": o principal e as demais pessoas num campo só.
import React, { useState } from 'react';
import { Check, Plus, UserRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useResponsaveisExtras } from '../../lib/responsaveis';
import { FOCO, ItemMenu, Menu, pilula, Propriedade } from './Propriedade';

export default function Responsaveis({ taskId, principalId, obrigatorio, disabled, onPrincipal, onAdicionado }: {
  taskId: string;
  principalId?: string;
  /** Vazio conta como pendência. */
  obrigatorio?: boolean;
  disabled?: boolean;
  onPrincipal: (userId: string | undefined) => void;
  /** Chamado ao incluir mais alguém (ex.: para notificar a pessoa). */
  onAdicionado?: (userId: string) => void;
}) {
  const { allUsers, currentUser } = useAuth();
  const { extras, alterar } = useResponsaveisExtras();
  const [erro, setErro] = useState<string | null>(null);

  const usuarios = currentUser ? [currentUser, ...allUsers.filter(u => u.id !== currentUser.id)] : allUsers;
  const adicionais = (extras[taskId] || []).filter(id => id !== principalId);
  const pessoas = [principalId, ...adicionais].map(id => allUsers.find(u => u.id === id)).filter(Boolean) as typeof allUsers;

  const alternar = async (userId: string, incluir: boolean) => {
    setErro(null);
    try {
      await alterar(taskId, userId, incluir);
      if (incluir) onAdicionado?.(userId);
    } catch (e: any) {
      setErro(e.message);
    }
  };

  const tornarPrincipal = (userId: string) => {
    onPrincipal(userId);
    // Quem era adicional não fica duas vezes na tarefa.
    if (adicionais.includes(userId)) void alternar(userId, false);
  };

  const nomes = pessoas.map(p => p.name).join(', ');

  return (
    <Propriedade
      rotulo={nomes ? `Responsáveis: ${nomes}` : 'Responsáveis'}
      nota={erro && <p className="text-body text-red-400">{erro}</p>}
    >
      <Menu
        rotulo={`Responsáveis: ${nomes || 'ninguém'}`}
        classe={pilula(pessoas.length ? 'cheia' : obrigatorio ? 'erro' : 'vazia')}
        disabled={disabled}
        largura="w-72"
        gatilho={pessoas.length === 0 ? (
          <><UserRound size={14} className="shrink-0" aria-hidden /> Responsáveis</>
        ) : (
          <>
            <span className="flex -space-x-1.5 -ml-0.5 shrink-0">
              {pessoas.slice(0, 4).map(u => (
                <img key={u.id} src={u.avatarUrl} alt="" className="size-5 rounded-full object-cover" />
              ))}
            </span>
            <span className="truncate">{pessoas[0].name}{pessoas.length > 1 && ` +${pessoas.length - 1}`}</span>
          </>
        )}
      >
        {fechar => <>
          <p className="px-2 pt-1 pb-1.5 text-caption text-zinc-500">Clique no nome para definir o principal; “+” inclui mais alguém.</p>
          <ItemMenu marcado={!principalId} onClick={() => { fechar(); onPrincipal(undefined); }}>
            <span className="text-zinc-400">Sem responsável principal</span>
          </ItemMenu>
          {usuarios.map(u => {
            const principal = u.id === principalId;
            const adicional = adicionais.includes(u.id);
            return (
              <div key={u.id} className="shrink-0 flex items-center gap-1">
                <div className="flex-1 min-w-0">
                  <ItemMenu marcado={principal} onClick={() => { fechar(); if (!principal) tornarPrincipal(u.id); }}>
                    <img src={u.avatarUrl} alt="" className="size-5 rounded-full object-cover shrink-0" />
                    <span className="truncate">{u.name}</span>
                  </ItemMenu>
                </div>
                {!principal && (
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={adicional}
                    aria-label={`${adicional ? 'Retirar' : 'Incluir'} ${u.name}`}
                    title={adicional ? 'Retirar da tarefa' : 'Incluir na tarefa'}
                    onClick={() => { void alternar(u.id, !adicional); }}
                    className={`size-8 [@media(pointer:coarse)]:size-10 shrink-0 inline-flex items-center justify-center rounded-lg transition-colors ${adicional ? 'text-blue-400 bg-blue-500/10' : 'text-zinc-500 hover:text-zinc-100 hover:bg-[#1F1F22]'} ${FOCO}`}
                  >
                    {adicional ? <Check size={14} aria-hidden /> : <Plus size={14} aria-hidden />}
                  </button>
                )}
              </div>
            );
          })}
        </>}
      </Menu>
    </Propriedade>
  );
}
