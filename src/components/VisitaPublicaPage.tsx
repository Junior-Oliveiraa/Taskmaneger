import React, { useEffect, useState } from 'react';
import { AlertCircle, Building2, CalendarClock, Check, CheckCircle2, Layers, Loader2, MapPin, Plus } from 'lucide-react';
import { FormVisitaPublica, fetchFormVisita, registrarVisitaPublica } from '../lib/visitaPublica';

// Página das recepcionistas (/visita/<token>). Fica fora do AuthProvider: quem
// abre não faz login nem alcança outra tela. O link de cada stand já traz o
// local; o do supervisor pergunta.

const ESTADOS_CIVIS = ['Solteiro(a)', 'Casado(a)', 'União estável', 'Divorciado(a)', 'Viúvo(a)'];

const campo =
  'w-full h-12 rounded-xl border border-zinc-800 bg-zinc-950 px-4 text-[16px] text-zinc-100 outline-none [color-scheme:dark] ' +
  'placeholder:text-zinc-600 focus:border-blue-500/70 focus:ring-2 focus:ring-blue-500/20 transition-[border-color,box-shadow]';

const somaDias = (iso: string, dias: number) => {
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
};
const dataBr = (iso: string) => iso.split('-').reverse().join('/');

function Rotulo({ children, opcional }: { children: React.ReactNode; opcional?: boolean }) {
  return (
    <span className="block mb-2 text-[13px] font-medium text-zinc-300">
      {children}
      {opcional ? <span className="ml-1 font-normal text-zinc-600">(opcional)</span> : <span className="ml-0.5 text-blue-400">*</span>}
    </span>
  );
}

function Opcao({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button" role="radio" aria-checked={ativo} onClick={onClick}
      className={`flex items-center gap-2 min-h-12 px-4 py-2.5 rounded-xl border text-left text-[15px] font-medium transition-colors ${
        ativo
          ? 'border-blue-500/60 bg-blue-500/15 text-blue-100'
          : 'border-zinc-800 bg-zinc-950 text-zinc-300 active:bg-zinc-900'
      }`}
    >
      {children}
    </button>
  );
}

export default function VisitaPublicaPage({ token }: { token: string }) {
  const [form, setForm] = useState<FormVisitaPublica | null | undefined>(undefined);
  const [falhaCarga, setFalhaCarga] = useState(false);

  const [local, setLocal] = useState('');
  const [cliente, setCliente] = useState('');
  const [interesse, setInteresse] = useState<'especifico' | 'geral' | ''>('');
  const [projectId, setProjectId] = useState('');
  const [corretor, setCorretor] = useState('');
  // Data e hora: por padrão, hoje e a hora do envio (sem campo na tela).
  const [outroMomento, setOutroMomento] = useState(false);
  const [data, setData] = useState('');
  const [hora, setHora] = useState('');
  const [profissao, setProfissao] = useState('');
  const [ondeMora, setOndeMora] = useState('');
  const [idade, setIdade] = useState('');
  const [estadoCivil, setEstadoCivil] = useState('');
  const [observacao, setObservacao] = useState('');

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [registrada, setRegistrada] = useState<{ numero: number | null; cliente: string } | null>(null);

  useEffect(() => {
    document.title = 'Cadastro de visita';
    fetchFormVisita(token)
      .then(f => {
        setForm(f);
        if (f) {
          setData(f.hoje);
          if (f.local) setLocal(f.local);
        }
      })
      .catch(() => setFalhaCarga(true));
  }, [token]);

  if (falhaCarga) {
    return <Aviso titulo="Sem conexão" texto="Não foi possível abrir o formulário. Verifique a internet e recarregue a página." />;
  }
  if (form === undefined) {
    return (
      <div className="min-h-[100dvh] bg-[#08080a] grid place-items-center text-zinc-500">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }
  if (form === null) {
    return <Aviso titulo="Link indisponível" texto="Este link de cadastro de visitas não existe mais ou foi desativado. Peça o link atualizado ao Comercial." />;
  }

  const ehHoje = data === form.hoje;
  const pendencia =
    !local ? 'Escolha o local da visita.'
    : !cliente.trim() ? 'Informe o nome do cliente.'
    : !interesse ? 'Informe o interesse do cliente.'
    : interesse === 'especifico' && !projectId ? 'Escolha o empreendimento.'
    : !data ? 'Informe a data da visita.'
    : null;

  const limpar = () => {
    setCliente(''); setInteresse(''); setProjectId(''); setCorretor('');
    setProfissao(''); setOndeMora(''); setIdade(''); setEstadoCivil(''); setObservacao('');
    // Mantém a data escolhida (cadastro do dia em lote); a hora é de cada visita.
    setHora('');
    setErro(null);
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pendencia || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const numero = await registrarVisitaPublica(token, {
        local: form.local ? null : local,
        cliente: cliente.trim(),
        data,
        // Vazio: o banco usa a hora do envio (visita de hoje).
        hora: outroMomento ? hora : '',
        interesse: interesse as 'especifico' | 'geral',
        projectId: interesse === 'especifico' ? projectId : null,
        corretor: corretor.trim(),
        profissao: profissao.trim(),
        ondeMora: ondeMora.trim(),
        idade: idade ? Number(idade) : null,
        estadoCivil,
        observacao: observacao.trim(),
      });
      setRegistrada({ numero, cliente: cliente.trim() });
      limpar();
      window.scrollTo({ top: 0 });
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível registrar a visita. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#08080a] text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-zinc-900 bg-[#08080a]/95 backdrop-blur">
        <div className="mx-auto max-w-xl px-4 h-16 flex items-center gap-3">
          <img src="/Logo_Primaria.png" alt="Uchôa Empreendimentos" className="h-8 w-auto" />
          <div className="min-w-0 ml-auto text-right">
            <p className="text-[15px] font-semibold leading-5">Cadastro de visita</p>
            <p className="text-[12px] text-zinc-500 truncate inline-flex items-center gap-1">
              <MapPin size={11} /> {form.local ?? 'Supervisor · todos os locais'}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 pt-5 pb-28">
        {registrada && (
          <div className="mb-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-start gap-3" role="status">
            <CheckCircle2 size={20} className="text-emerald-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-emerald-100">Visita registrada</p>
              <p className="text-[13px] text-emerald-200/80">
                {registrada.cliente}{registrada.numero != null ? ` · P${String(registrada.numero).padStart(4, '0')}` : ''}. O formulário já está pronto para a próxima.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={enviar} className="space-y-6">
          {!form.local && (
            <div>
              <Rotulo>Local da visita</Rotulo>
              <div className="grid grid-cols-1 gap-2" role="radiogroup">
                {form.locais.map(l => (
                  <Opcao key={l} ativo={local === l} onClick={() => setLocal(l)}>
                    <MapPin size={16} className="opacity-70" /> {l}
                  </Opcao>
                ))}
              </div>
            </div>
          )}

          <div>
            <Rotulo>Nome do cliente</Rotulo>
            <input className={campo} value={cliente} onChange={e => setCliente(e.target.value)} autoComplete="off" autoCapitalize="words" placeholder="Nome de quem visitou" />
          </div>

          <div>
            <Rotulo>Interesse</Rotulo>
            <div className="grid grid-cols-2 gap-2" role="radiogroup">
              <Opcao ativo={interesse === 'especifico'} onClick={() => setInteresse('especifico')}>
                <Building2 size={16} className="opacity-70 shrink-0" /> Um empreendimento
              </Opcao>
              <Opcao ativo={interesse === 'geral'} onClick={() => setInteresse('geral')}>
                <Layers size={16} className="opacity-70 shrink-0" /> Todos (veio conhecer)
              </Opcao>
            </div>
            {interesse === 'especifico' && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Empreendimento">
                {form.empreendimentos.map(p => (
                  <Opcao key={p.id} ativo={projectId === p.id} onClick={() => setProjectId(p.id)}>{p.nome}</Opcao>
                ))}
              </div>
            )}
          </div>

          <div>
            <Rotulo opcional>Atendido por</Rotulo>
            <input className={campo} list="corretores-visita" value={corretor} onChange={e => setCorretor(e.target.value)} autoComplete="off" placeholder="Nome do corretor" />
            <datalist id="corretores-visita">
              {form.corretores.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>

          {/* Quando: hoje e a hora do envio, a não ser que a visita tenha sido em outro momento. */}
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-4">
            <div className="flex items-center gap-3">
              <CalendarClock size={18} className="text-zinc-500 shrink-0" />
              <p className="flex-1 min-w-0 text-[14px] text-zinc-300">
                {outroMomento
                  ? <>Visita em <b className="text-zinc-100">{ehHoje ? 'hoje' : dataBr(data)}</b>{hora ? <> às <b className="text-zinc-100">{hora}</b></> : ''}</>
                  : <>Visita <b className="text-zinc-100">agora</b> ({dataBr(form.hoje)}, hora do envio)</>}
              </p>
              <button
                type="button"
                onClick={() => { if (outroMomento) { setData(form.hoje); setHora(''); } setOutroMomento(!outroMomento); }}
                className="shrink-0 text-[13px] font-medium text-blue-400 px-2 py-1.5"
              >
                {outroMomento ? 'Usar agora' : 'Outro dia/hora'}
              </button>
            </div>
            {outroMomento && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block mb-1.5 text-[12px] text-zinc-400">Data</span>
                  <input type="date" className={campo} value={data} min={somaDias(form.hoje, -90)} max={form.hoje} onChange={e => setData(e.target.value)} />
                </label>
                <label className="block">
                  <span className="block mb-1.5 text-[12px] text-zinc-400">Hora {ehHoje ? '' : '(se souber)'}</span>
                  <input type="time" className={campo} value={hora} onChange={e => setHora(e.target.value)} />
                </label>
              </div>
            )}
          </div>

          <div className="pt-2 space-y-4">
            <p className="text-[13px] font-semibold text-zinc-400 uppercase tracking-wider">Perfil do cliente <span className="normal-case font-normal tracking-normal text-zinc-600">(opcional)</span></p>
            <div>
              <Rotulo opcional>Profissão</Rotulo>
              <input className={campo} value={profissao} onChange={e => setProfissao(e.target.value)} />
            </div>
            <div>
              <Rotulo opcional>Onde mora</Rotulo>
              <input className={campo} value={ondeMora} onChange={e => setOndeMora(e.target.value)} placeholder="Bairro / cidade" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Rotulo opcional>Idade</Rotulo>
                <input className={campo} inputMode="numeric" value={idade} onChange={e => setIdade(e.target.value.replace(/\D/g, '').slice(0, 3))} />
              </div>
              <div>
                <Rotulo opcional>Estado civil</Rotulo>
                <select className={campo} value={estadoCivil} onChange={e => setEstadoCivil(e.target.value)}>
                  <option value="">—</option>
                  {ESTADOS_CIVIS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Rotulo opcional>Observações / resumo da visita</Rotulo>
              <textarea
                rows={4} value={observacao} onChange={e => setObservacao(e.target.value)}
                placeholder="Como foi a visita, o que o cliente procura…"
                className={`${campo} h-auto py-3 leading-relaxed resize-y`}
              />
            </div>
          </div>

          {erro && (
            <p className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[14px] text-rose-200">
              <AlertCircle size={16} className="shrink-0 mt-0.5" /> {erro}
            </p>
          )}

          {/* Botão sempre à vista no celular. */}
          <div className="fixed inset-x-0 bottom-0 border-t border-zinc-900 bg-[#08080a]/95 backdrop-blur px-4 py-3">
            <div className="mx-auto max-w-xl">
              <button
                type="submit" disabled={!!pendencia || enviando}
                className="w-full h-13 min-h-[52px] rounded-xl bg-blue-600 text-white text-[16px] font-semibold inline-flex items-center justify-center gap-2 disabled:bg-zinc-800 disabled:text-zinc-500 active:bg-blue-500 transition-colors"
              >
                {enviando ? <Loader2 size={18} className="animate-spin" /> : registrada ? <Plus size={18} /> : <Check size={18} />}
                {enviando ? 'Registrando…' : pendencia ?? 'Registrar visita'}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="min-h-[100dvh] bg-[#08080a] text-zinc-100 grid place-items-center px-6">
      <div className="max-w-sm text-center">
        <AlertCircle size={28} className="mx-auto text-zinc-500" />
        <p className="mt-3 text-[17px] font-semibold">{titulo}</p>
        <p className="mt-1 text-[14px] text-zinc-400">{texto}</p>
      </div>
    </div>
  );
}
