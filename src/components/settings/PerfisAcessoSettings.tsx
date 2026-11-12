import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Lock, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  ACOES_ADMIN, MODULOS, Modulo, Nivel, PERFIS, PERFIS_CONFIGURAVEIS, PerfilConfiguravel,
  MatrizPermissoes, fetchMatrizPermissoes, rotuloPerfil, salvarPermissao,
} from '../../lib/permissoes';

const NIVEIS: { id: Nivel; label: string; ativo: string }[] = [
  { id: 'nenhum', label: '—',      ativo: 'bg-zinc-800 text-zinc-300' },
  { id: 'ver',    label: 'Ver',    ativo: 'bg-sky-500/20 text-sky-300' },
  { id: 'editar', label: 'Editar', ativo: 'bg-emerald-500/20 text-emerald-300' },
];

/**
 * Matriz perfil × módulo. Cada clique grava na hora em perfis_permissoes —
 * tabela que só o administrador pode alterar (RLS) — e vale no próximo
 * carregamento de quem tem aquele perfil (no máximo 5 minutos).
 */
export default function PerfisAcessoSettings() {
  const { currentUser, allUsers } = useAuth();
  const queryClient = useQueryClient();
  const { data: matriz, isLoading, error } = useQuery({ queryKey: ['perfisPermissoes'], queryFn: fetchMatrizPermissoes });
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const alterar = async (perfil: PerfilConfiguravel, modulo: Modulo, nivel: Nivel) => {
    const chave = `${perfil}:${modulo}`;
    setSalvando(chave);
    setErro(null);
    const anterior = queryClient.getQueryData<MatrizPermissoes>(['perfisPermissoes']);
    queryClient.setQueryData<MatrizPermissoes>(['perfisPermissoes'], old =>
      old ? { ...old, [perfil]: { ...old[perfil], [modulo]: nivel } } : old);
    try {
      await salvarPermissao(perfil, modulo, nivel, currentUser?.id);
    } catch (e: any) {
      queryClient.setQueryData(['perfisPermissoes'], anterior);
      setErro(e.message);
    } finally {
      setSalvando(null);
    }
  };

  const contagem = (perfil: string) => allUsers.filter(u => (u.perfil || 'assistente') === perfil).length;
  const grupos = [...new Set(MODULOS.map(m => m.grupo))];

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-zinc-200">Perfis e acessos</h3>
        <p className="text-[11px] text-zinc-500">
          Defina o que cada perfil acessa. <strong className="text-zinc-400">Ver</strong> abre a tela sem permitir alterações;{' '}
          <strong className="text-zinc-400">Editar</strong> libera criar, alterar e excluir. A regra vale no banco de dados,
          não só na tela. O perfil de cada pessoa é definido em Usuários.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {PERFIS.map(p => (
          <div key={p.id} className="bg-zinc-950/40 border border-zinc-900 rounded-lg p-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
              {p.id === 'administrador' && <ShieldCheck size={12} className="text-blue-400" />}
              {p.label}
              <span className="ml-auto text-[10px] font-mono text-zinc-500">{contagem(p.id)}</span>
            </div>
            <p className="text-[10px] text-zinc-500 mt-1 leading-snug">{p.descricao}</p>
          </div>
        ))}
      </div>

      {erro && <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 p-2.5 rounded-md">{erro}</div>}
      {error && <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 p-2.5 rounded-md">{(error as Error).message}</div>}

      {isLoading || !matriz ? (
        <div className="flex items-center gap-2 text-xs text-zinc-500 py-8 justify-center">
          <Loader2 size={14} className="animate-spin" /> Carregando permissões...
        </div>
      ) : (
        <div className="border border-zinc-900 rounded-lg overflow-x-auto">
          <table className="w-full text-xs min-w-[640px]">
            <thead className="bg-zinc-950/50 text-zinc-500">
              <tr>
                <th className="text-left font-medium px-3 py-2">Módulo</th>
                {PERFIS_CONFIGURAVEIS.map(p => (
                  <th key={p} className="text-center font-medium px-2 py-2">{rotuloPerfil(p)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupos.map(grupo => (
                <React.Fragment key={grupo}>
                  <tr className="border-t border-zinc-900 bg-zinc-950/30">
                    <td colSpan={1 + PERFIS_CONFIGURAVEIS.length} className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-zinc-500">
                      {grupo}
                    </td>
                  </tr>
                  {MODULOS.filter(m => m.grupo === grupo).map(m => (
                    <tr key={m.id} className="border-t border-zinc-900/60 text-zinc-300">
                      <td className="px-3 py-2">
                        <div className="font-medium">{m.label}</div>
                        <div className="text-[10px] text-zinc-500">{m.descricao}</div>
                      </td>
                      {PERFIS_CONFIGURAVEIS.map(perfil => {
                        const atual = matriz[perfil]?.[m.id] ?? 'nenhum';
                        const chave = `${perfil}:${m.id}`;
                        return (
                          <td key={perfil} className="px-2 py-2 text-center">
                            <div
                              role="radiogroup"
                              aria-label={`${m.label} — ${rotuloPerfil(perfil)}`}
                              className={`inline-flex rounded-md border border-zinc-800 overflow-hidden ${salvando === chave ? 'opacity-60' : ''}`}
                            >
                              {NIVEIS.map(n => (
                                <button
                                  key={n.id}
                                  role="radio"
                                  aria-checked={atual === n.id}
                                  disabled={salvando === chave}
                                  onClick={() => atual !== n.id && alterar(perfil, m.id, n.id)}
                                  className={`px-2 py-1 text-[10px] font-medium transition-colors ${
                                    atual === n.id ? n.ativo : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
                                  }`}
                                >
                                  {n.label}
                                </button>
                              ))}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-zinc-950/30 border border-zinc-900 rounded-lg p-4">
        <h4 className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
          <Lock size={12} className="text-amber-400" /> Exclusivo do administrador
        </h4>
        <p className="text-[10px] text-zinc-500 mt-1 mb-2">Não podem ser liberadas para nenhum perfil, nem para o Master.</p>
        <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-zinc-400 list-disc pl-4">
          {ACOES_ADMIN.map(a => <li key={a}>{a}</li>)}
        </ul>
      </div>
    </div>
  );
}
