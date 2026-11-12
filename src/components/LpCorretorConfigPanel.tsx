import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, ExternalLink, Eye, EyeOff, GripVertical, Image as ImageIcon, Link2, ListChecks, Loader2, Plus, RefreshCw, ShieldCheck, Trash2, Upload, UploadCloud, X } from 'lucide-react';
import { LpCorretorConfig, LpCorretorFichaItem, LpCorretorImagem, LpCorretorImovel, LpCorretorPlanta, SiengeCalculoRegra, SiengeTabelaVendaColuna, SiengeTabelaVendaUnidade, SiengeTabelaVendaVersao } from '../types';
import { LpCorretorSlugConflictError, fetchLpCorretorConfigs, publicarTabelaLpCorretorVersao, regenerarTokenValidacaoLp, saveLpCorretorConfig } from '../lib/api';
import { REGRA_PREFIX, lpCorretorUrl, lpValidacaoUrl, slugifyLpSlug } from '../lib/lpCorretor';
import { mergeColunasRegras } from '../lib/siengeVendasTabela';
import { usePermissoes } from '../lib/permissoes';
import { UPLOAD_LIMITS, sanitizeFileName, uploadToStorage } from '../lib/storage';

interface LpCorretorConfigPanelProps {
  projectId: string;
  projectName: string;
  /**
   * Empreendimento de terceiros. A LP deixa de descrever um prédio e passa a
   * descrever uma carteira: galeria, informações e book saem do topo da página
   * e viram cadastro por imóvel, exibido ao expandir a linha. Por isso as
   * seções de material do empreendimento dão lugar a "Imóveis".
   */
  terceiros: boolean;
  /** Todas as versões do empreendimento — cada uma pode ir para a LP ou não. */
  versoes: SiengeTabelaVendaVersao[];
  onSaveVersao: (versao: SiengeTabelaVendaVersao) => Promise<void> | void;
  /** Colunas e regras de TODAS as versões: a LP escolhe entre elas. */
  colunas: SiengeTabelaVendaColuna[];
  regras: SiengeCalculoRegra[];
  /** Unidades do empreendimento — usadas para detectar alterações não publicadas. */
  unidades: SiengeTabelaVendaUnidade[];
  onClose: () => void;
}

const INPUT_CLASS = 'w-full bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500/50 transition-colors';

type UploadTipo = 'banner' | 'logo' | 'imagens' | 'plantas' | 'book';
type DestinoColuna = 'oculta' | 'linha' | 'detalhe';

const DESTINOS: { valor: DestinoColuna; label: string; ativo: string }[] = [
  { valor: 'oculta', label: 'Oculta', ativo: 'bg-zinc-700/60 text-zinc-200 border-zinc-600' },
  { valor: 'linha', label: 'Linha', ativo: 'bg-blue-500/15 text-blue-300 border-blue-500/40' },
  { valor: 'detalhe', label: 'Detalhe', ativo: 'bg-violet-500/15 text-violet-300 border-violet-500/40' },
];

function emptyConfig(projectId: string, projectName: string): LpCorretorConfig {
  const now = new Date().toISOString();
  return {
    projectId,
    slug: slugifyLpSlug(projectName) || projectId,
    publicada: false,
    titulo: projectName,
    subtitulo: null,
    descricao: null,
    logoEmpreendimentoUrl: null,
    bannerUrl: null,
    imagens: [],
    plantas: [],
    fichaTecnica: [],
    imoveis: [],
    bookUrl: null,
    observacoes: null,
    cvcrmUrlTemplate: null,
    colunasVisiveis: [],
    colunasLinha: [],
    colunaTipologia: null,
    riRegistrado: true,
    validacaoHabilitada: false,
    // O token real nasce no banco (default da coluna) e chega no primeiro
    // carregamento depois de salvar; até lá não há link para copiar.
    validacaoToken: '',
    tabelaPublicadaEm: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Upload para o bucket público de anexos, sob um prefixo por empreendimento. */
async function uploadLpFile(projectId: string, file: File): Promise<string> {
  const path = `lp-corretor/${projectId}/${Date.now()}-${sanitizeFileName(file.name)}`;
  return uploadToStorage('attachments', path, file, UPLOAD_LIMITS.task);
}

// Ponto de partida da legenda de uma planta: o nome do arquivo, sem extensão e
// com '-'/'_' virando espaço — evita a planta nascer sem identificação a cada
// upload. É só o valor inicial do campo, continua editável normalmente depois.
function legendaInicialDoArquivo(nomeArquivo: string): string {
  return nomeArquivo
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Comparação de nome de imóvel. O vínculo entre a tabela de vendas e o cadastro
// é o nome puro, então caixa e espaço sobrando não podem separar 'Allure ' de
// 'allure' — quem digitou na tabela e quem escolheu no painel são a mesma
// pessoa em momentos diferentes.
function normalizarNome(nome: string): string {
  return nome.trim().toLowerCase();
}

function Secao({ titulo, descricao, children }: { titulo: string; descricao?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 pt-4 border-t border-zinc-800/70 first:pt-0 first:border-0">
      <div>
        <h4 className="text-xs font-semibold text-zinc-200">{titulo}</h4>
        {descricao && <p className="text-[11px] text-zinc-500 mt-0.5">{descricao}</p>}
      </div>
      {children}
    </div>
  );
}

export default function LpCorretorConfigPanel({ projectId, projectName, terceiros, versoes, onSaveVersao, colunas, regras, unidades, onClose }: LpCorretorConfigPanelProps) {
  const [config, setConfig] = useState<LpCorretorConfig | null>(null);
  const [salvo, setSalvo] = useState<LpCorretorConfig | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [copiadoValidacao, setCopiadoValidacao] = useState(false);
  const [regenerando, setRegenerando] = useState(false);
  // Além dos UploadTipo fixos, guarda 'imovel:<id>:imagens' | 'imovel:<id>:book'
  // — um por card, para o spinner ficar no botão que foi clicado.
  const [enviando, setEnviando] = useState<string | null>(null);
  /** Id da versão sendo publicada — o botão que roda é só o dela. */
  const [publicando, setPublicando] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const bannerInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const imagensInputRef = useRef<HTMLInputElement>(null);
  const plantasInputRef = useRef<HTMLInputElement>(null);
  const bookInputRef = useRef<HTMLInputElement>(null);

  // Config isolada do resto do app (não vive nas queries de App.tsx): carrega
  // ao abrir o painel e grava no botão Salvar.
  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    fetchLpCorretorConfigs()
      .then(list => {
        if (!ativo) return;
        const existente = list.find(c => c.projectId === projectId) || emptyConfig(projectId, projectName);
        setConfig(existente);
        setSalvo(existente);
        setCarregando(false);
      })
      .catch(e => {
        if (!ativo) return;
        // 42P01 = undefined_table: a migration da LP ainda não foi aplicada.
        setErro(e?.code === '42P01'
          ? 'A tabela sienge_lp_corretor ainda não existe no banco. Aplique a migration 20260802000000_lp_corretor.sql (supabase db push) para liberar a Tabela Corretor.'
          : (e?.message || 'Erro ao carregar a configuração.'));
        setCarregando(false);
      });
    return () => { ativo = false; };
  }, [projectId, projectName]);

  const ordenadas = useMemo(() => [...versoes].sort((a, b) => a.sortOrder - b.sortOrder), [versoes]);
  const versoesLp = useMemo(() => ordenadas.filter(v => v.lpVisivel), [ordenadas]);

  // Colunas de TODAS as versões, não só das liberadas. Marcar uma coluna aqui
  // não a põe no ar: a leitura pública cruza esta lista com a versão servida, e
  // versão não liberada não é servida. Restringir às liberadas criava um beco —
  // para validar uma versão antes de soltá-la é preciso escolher as colunas
  // dela, mas ela só entrava na lista depois de solta.
  //
  // Uma key repetida entre versões é a mesma coluna e aparece uma vez só;
  // regras têm id próprio por versão, então cada uma entra separada — marcar a
  // de uma versão não faz a irmã aparecer na outra.
  const merged = useMemo(() => {
    const porKey = new Map<string, SiengeTabelaVendaColuna>();
    for (const c of colunas) if (!porKey.has(c.key)) porKey.set(c.key, c);
    return mergeColunasRegras([...porKey.values()], regras);
  }, [colunas, regras]);

  // Nome da versão de cada regra — sem ele, duas versões com a mesma regra
  // ("Entrada 20%") viram duas linhas idênticas e indistinguíveis na lista.
  const nomeVersaoDaRegra = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of regras) {
      const v = ordenadas.find(x => x.id === r.versaoId);
      if (v) m.set(r.id, v.nome);
    }
    return m;
  }, [regras, ordenadas]);

  // Candidatas a coluna de tipologia: as visíveis, na mesma ordem da lista de
  // colunas. Ocultas ficam de fora porque não saem do banco — a coluna
  // apontada precisa ter valores no payload público para virar filtro.
  const opcoesTipologia = useMemo(() => {
    const visiveis = new Set(config?.colunasVisiveis || []);
    return merged
      .map(m => {
        const key = m.kind === 'coluna' ? m.item.key : `${REGRA_PREFIX}${m.item.id}`;
        const base = m.kind === 'coluna' ? m.item.label : m.item.titulo;
        const daVersao = m.kind === 'regra' && ordenadas.length > 1 ? nomeVersaoDaRegra.get(m.item.id) : null;
        return { key, label: daVersao ? `${base} · ${daVersao}` : base };
      })
      .filter(o => visiveis.has(o.key));
  }, [merged, config?.colunasVisiveis, ordenadas, nomeVersaoDaRegra]);

  // A LP serve um snapshot aprovado, não a tabela ao vivo: nada da tabela chega
  // ao corretor sem Publicar. O aviso de pendência tem que cobrir tudo que o
  // snapshot congela — valores das unidades, nomes/ordem das colunas e as
  // regras de cálculo. Olhar só as unidades deixava o painel dizer "sem
  // pendências" com uma regra já editada esperando publicação.
  //
  // Coluna ou regra APAGADA depois da publicação não aparece aqui: sem o
  // snapshot em mãos não há o que comparar. É seguro por outro motivo — o que
  // sumiu do banco continua congelado no snapshot e não muda a página.
  const pendenciaDaVersao = (versao: SiengeTabelaVendaVersao) => {
    if (!versao.tabelaPublicadaEm) return null;
    const em = new Date(versao.tabelaPublicadaEm).getTime();
    const depois = (iso: string) => new Date(iso).getTime() > em;
    return {
      unidades: unidades.filter(u => u.versaoId === versao.id && depois(u.updatedAt)),
      colunas: colunas.filter(c => c.versaoId === versao.id && depois(c.updatedAt)),
      regras: regras.filter(r => r.versaoId === versao.id && depois(r.updatedAt)),
    };
  };

  const publicar = async (versao: SiengeTabelaVendaVersao) => {
    if (publicando) return;
    setPublicando(versao.id);
    setErro(null);
    try {
      const em = await publicarTabelaLpCorretorVersao(versao.id);
      await onSaveVersao({ ...versao, tabelaPublicadaEm: em });
    } catch (e: any) {
      setErro(e.message || 'Erro ao publicar a tabela.');
    } finally {
      setPublicando(null);
    }
  };
  const dirty = !!config && !!salvo && JSON.stringify(config) !== JSON.stringify(salvo);

  const patch = (p: Partial<LpCorretorConfig>) => setConfig(c => (c ? { ...c, ...p } : c));

  // Nomes de imóvel presentes na tabela de vendas — a única fonte da lista do
  // cadastro. Vem de todas as versões do empreendimento: o imóvel é da unidade,
  // não da condição comercial.
  const imoveisDaTabela = useMemo(
    () => [...new Set(unidades.map(u => u.imovel?.trim()).filter((v): v is string => !!v))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
    [unidades]
  );

  const imoveisSemCadastro = useMemo(
    () => imoveisDaTabela.filter(n => !(config?.imoveis || []).some(im => normalizarNome(im.nome) === normalizarNome(n))),
    [imoveisDaTabela, config]
  );

  const patchImovel = (id: string, mudanca: (im: LpCorretorImovel) => Partial<LpCorretorImovel>) => {
    setConfig(c => (c ? { ...c, imoveis: c.imoveis.map(im => (im.id === id ? { ...im, ...mudanca(im) } : im)) } : c));
  };

  // Rotação do token: grava direto, sem passar pelo Salvar. O motivo de
  // rotacionar é sempre "este link não pode mais valer", e isso não pode ficar
  // pendurado num botão que a pessoa talvez não aperte. Escreve nos dois
  // estados para o campo não contar como alteração não salva.
  const { isAdmin } = usePermissoes();
  const regenerarToken = async () => {
    if (!config || regenerando) return;
    setRegenerando(true);
    setErro(null);
    try {
      const token = await regenerarTokenValidacaoLp(projectId);
      setConfig(c => (c ? { ...c, validacaoToken: token } : c));
      setSalvo(s => (s ? { ...s, validacaoToken: token } : s));
      setCopiadoValidacao(false);
    } catch (e: any) {
      setErro(e.message || 'Erro ao gerar um novo link de validação.');
    } finally {
      setRegenerando(false);
    }
  };

  // Três estados por coluna: oculta (não sai do banco), linha (aparece na linha
  // compacta) e detalhe (só ao expandir a unidade). colunasLinha é sempre um
  // subconjunto de colunasVisiveis, então ocultar uma coluna a tira das duas.
  const setDestinoColuna = (key: string, destino: DestinoColuna) => {
    if (!config) return;
    const semKey = (lista: string[]) => lista.filter(k => k !== key);
    if (destino === 'oculta') {
      patch({ colunasVisiveis: semKey(config.colunasVisiveis), colunasLinha: semKey(config.colunasLinha) });
      return;
    }
    patch({
      colunasVisiveis: [...semKey(config.colunasVisiveis), key],
      colunasLinha: destino === 'linha' ? [...semKey(config.colunasLinha), key] : semKey(config.colunasLinha),
    });
  };

  const destinoDe = (key: string): DestinoColuna => {
    if (!config?.colunasVisiveis.includes(key)) return 'oculta';
    return config.colunasLinha.includes(key) ? 'linha' : 'detalhe';
  };

  const handleUpload = async (tipo: UploadTipo, files: FileList | null) => {
    if (!files || files.length === 0 || !config) return;
    setEnviando(tipo);
    setErro(null);
    try {
      if (tipo === 'imagens' || tipo === 'plantas') {
        const arquivos = Array.from(files);
        const urls = await Promise.all(arquivos.map(f => uploadLpFile(projectId, f)));
        if (tipo === 'imagens') {
          const novas: LpCorretorImagem[] = urls.map(url => ({ id: crypto.randomUUID(), url, legenda: '' }));
          patch({ imagens: [...config.imagens, ...novas] });
        } else {
          const novas: LpCorretorPlanta[] = urls.map((url, i) => ({
            id: crypto.randomUUID(),
            url,
            legenda: legendaInicialDoArquivo(arquivos[i].name),
            unidades: [],
            terminacoes: [],
            andares: [],
          }));
          patch({ plantas: [...config.plantas, ...novas] });
        }
      } else {
        const url = await uploadLpFile(projectId, files[0]);
        if (tipo === 'banner') patch({ bannerUrl: url });
        else if (tipo === 'logo') patch({ logoEmpreendimentoUrl: url });
        else patch({ bookUrl: url });
      }
    } catch (e: any) {
      setErro(e.message || 'Erro ao enviar o arquivo.');
    } finally {
      setEnviando(null);
    }
  };

  /** Mesmo upload, endereçado a um imóvel em vez de à página inteira. */
  const handleUploadImovel = async (imovelId: string, tipo: 'imagens' | 'book', files: FileList | null) => {
    if (!files || files.length === 0) return;
    setEnviando(`imovel:${imovelId}:${tipo}`);
    setErro(null);
    try {
      if (tipo === 'imagens') {
        const urls = await Promise.all(Array.from(files).map(f => uploadLpFile(projectId, f)));
        const novas: LpCorretorImagem[] = urls.map(url => ({ id: crypto.randomUUID(), url, legenda: '' }));
        patchImovel(imovelId, im => ({ imagens: [...im.imagens, ...novas] }));
      } else {
        const url = await uploadLpFile(projectId, files[0]);
        patchImovel(imovelId, () => ({ bookUrl: url }));
      }
    } catch (e: any) {
      setErro(e.message || 'Erro ao enviar o arquivo.');
    } finally {
      setEnviando(null);
    }
  };

  const salvar = async () => {
    if (!config) return;
    const slug = slugifyLpSlug(config.slug);
    if (!slug) { setErro('Informe um endereço (slug) válido para a página.'); return; }
    setSalvando(true);
    setErro(null);
    const normalizado: LpCorretorConfig = {
      ...config,
      slug,
      titulo: config.titulo?.trim() || null,
      subtitulo: config.subtitulo?.trim() || null,
      descricao: config.descricao?.trim() || null,
      observacoes: config.observacoes?.trim() || null,
      cvcrmUrlTemplate: config.cvcrmUrlTemplate?.trim() || null,
      bookUrl: config.bookUrl?.trim() || null,
      fichaTecnica: config.fichaTecnica.filter(i => i.label.trim() || i.valor.trim()),
      // Imóvel sem nome não tem como ser encontrado pela tabela (o vínculo é
      // por nome), então é descartado em vez de virar cadastro órfão.
      imoveis: config.imoveis
        .filter(im => im.nome.trim())
        .map(im => ({
          ...im,
          nome: im.nome.trim(),
          descricao: im.descricao?.trim() || null,
          bookUrl: im.bookUrl?.trim() || null,
          fotosUrl: im.fotosUrl?.trim() || null,
          fichaTecnica: im.fichaTecnica.filter(i => i.label.trim() || i.valor.trim()),
        })),
    };
    try {
      await saveLpCorretorConfig(normalizado);
      setConfig(normalizado);
      setSalvo(normalizado);
    } catch (e: any) {
      setErro(e instanceof LpCorretorSlugConflictError ? e.message : (e.message || 'Erro ao salvar.'));
    } finally {
      setSalvando(false);
    }
  };

  const copiarLink = () => {
    if (!config) return;
    navigator.clipboard.writeText(lpCorretorUrl(slugifyLpSlug(config.slug))).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  };

  const copiarLinkValidacao = () => {
    if (!config?.validacaoToken) return;
    navigator.clipboard.writeText(lpValidacaoUrl(config.validacaoToken)).then(() => {
      setCopiadoValidacao(true);
      setTimeout(() => setCopiadoValidacao(false), 2000);
    });
  };

  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 bg-zinc-900/40 border border-zinc-800 rounded-xl text-xs text-zinc-500">
        <Loader2 size={14} className="animate-spin" /> Carregando configuração da LP...
      </div>
    );
  }

  // Sem config e sem loading = a carga falhou; sem este ramo o erro vira um
  // spinner eterno.
  if (!config) {
    return (
      <div className="flex items-start justify-between gap-3 p-4 bg-zinc-900/40 border border-zinc-800 rounded-xl">
        <div className="flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-zinc-400 leading-relaxed">{erro || 'Não foi possível carregar a configuração da LP.'}</p>
        </div>
        <button type="button" onClick={onClose} className="p-1 text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors shrink-0">
          <X size={14} />
        </button>
      </div>
    );
  }

  const url = lpCorretorUrl(slugifyLpSlug(config.slug));

  // Lê de `salvo`, não de `config`: quem decide se o link responde é o banco, e
  // o toggle só chega lá no Salvar. Usar o estado local aqui faria o painel
  // anunciar "no ar" um link que a RPC ainda recusa.
  const validacaoNoAr = !!salvo?.validacaoHabilitada;

  return (
    <div className="flex flex-col gap-4 p-4 bg-zinc-900/40 border border-zinc-800 rounded-xl animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Tabela Corretor</h3>
          <p className="text-[11px] text-zinc-500">
            Página pública com a tabela de preços de {projectName}, aberta por link e otimizada para celular.
            Só as colunas marcadas abaixo saem do banco — nenhuma outra informação do sistema fica acessível.
          </p>
        </div>
        <button type="button" onClick={onClose} className="p-1 text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors shrink-0">
          <X size={14} />
        </button>
      </div>

      {/* Publicação + link */}
      <div className="flex flex-col gap-2.5 p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {config.publicada ? <Eye size={14} className="text-emerald-400" /> : <EyeOff size={14} className="text-zinc-600" />}
            <span className="text-xs font-semibold text-zinc-200">{config.publicada ? 'Publicada' : 'Não publicada'}</span>
            <span className="text-[11px] text-zinc-600">{config.publicada ? '— qualquer pessoa com o link acessa' : '— o link retorna "tabela indisponível"'}</span>
          </div>
          <button
            type="button"
            onClick={() => patch({ publicada: !config.publicada })}
            className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${config.publicada ? 'bg-emerald-500' : 'bg-zinc-700'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${config.publicada ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 flex-1 min-w-0 bg-zinc-900/60 border border-zinc-800 rounded-lg px-2.5 py-2">
            <Link2 size={12} className="text-zinc-600 shrink-0" />
            <span className="text-[11px] text-zinc-600 shrink-0">/tabela/</span>
            <input
              type="text"
              value={config.slug}
              onChange={e => patch({ slug: e.target.value })}
              onBlur={e => patch({ slug: slugifyLpSlug(e.target.value) })}
              placeholder="endereco-da-pagina"
              className="flex-1 min-w-0 bg-transparent text-[11px] text-zinc-100 placeholder-zinc-600 outline-none"
            />
          </div>
          <button type="button" onClick={copiarLink} title="Copiar link" className="p-2 text-zinc-400 hover:text-zinc-100 bg-zinc-900/60 border border-zinc-800 rounded-lg transition-colors shrink-0">
            {copiado ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
          </button>
          <a href={url} target="_blank" rel="noopener noreferrer" title="Abrir página" className="p-2 text-zinc-400 hover:text-zinc-100 bg-zinc-900/60 border border-zinc-800 rounded-lg transition-colors shrink-0">
            <ExternalLink size={13} />
          </a>
        </div>
      </div>

      {/* Página de validação — a contrapartida do botão Publicar. A página do
          corretor só muda quando alguém publica; esta reflete a tabela do
          Orbit agora, para conferir um reajuste antes de soltá-lo. O endereço é
          o token justamente porque ela mostra preço não publicado: derivá-lo do
          slug faria a página pública entregar a de validação junto. */}
      <div className="flex flex-col gap-2.5 p-3 bg-amber-500/[0.04] border border-amber-500/20 rounded-lg">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <ListChecks size={14} className={config.validacaoHabilitada ? 'text-amber-400 shrink-0' : 'text-zinc-600 shrink-0'} />
            <span className="text-xs font-semibold text-zinc-200 shrink-0">Página de validação</span>
            <span className="text-[11px] text-zinc-600 truncate">
              {validacaoNoAr ? '— espelha a tabela ao vivo, sem publicar' : '— o link está desligado'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => patch({ validacaoHabilitada: !config.validacaoHabilitada })}
            className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${config.validacaoHabilitada ? 'bg-amber-500' : 'bg-zinc-700'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${config.validacaoHabilitada ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>

        <p className="text-[11px] text-zinc-500 leading-relaxed">
          Mostra sempre o estado atual da tabela — valores, colunas e regras de cálculo — sem nunca precisar do botão Publicar.
          Inclui as versões que ainda não foram liberadas ao corretor. Trate o link como senha: ele expõe preço não publicado.
        </p>

        {config.validacaoToken ? (
          <>
            {/* Copiar e abrir só depois de SALVO. O toggle é estado local até o
                Salvar gravar; enquanto isso a RPC recusa o token e a página
                responde "indisponível". Deixar os botões ativos aqui convidava
                a abrir um link que ainda não existe para o banco. */}
            <div className={`flex items-center gap-2 ${validacaoNoAr ? '' : 'opacity-50'}`}>
              <div className="flex items-center gap-1.5 flex-1 min-w-0 bg-zinc-900/60 border border-zinc-800 rounded-lg px-2.5 py-2">
                <Link2 size={12} className="text-zinc-600 shrink-0" />
                <span className="text-[11px] text-zinc-600 shrink-0">/validacao/</span>
                <span className="flex-1 min-w-0 truncate text-[11px] text-zinc-400 font-mono">{config.validacaoToken}</span>
              </div>
              <button
                type="button"
                onClick={copiarLinkValidacao}
                disabled={!validacaoNoAr}
                title={validacaoNoAr ? 'Copiar link de validação' : 'Ligue a validação e salve para o link responder'}
                className="p-2 text-zinc-400 hover:text-zinc-100 bg-zinc-900/60 border border-zinc-800 rounded-lg transition-colors shrink-0 disabled:cursor-not-allowed disabled:hover:text-zinc-400"
              >
                {copiadoValidacao ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              </button>
              {validacaoNoAr ? (
                <a
                  href={lpValidacaoUrl(config.validacaoToken)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Abrir página de validação"
                  className="p-2 text-zinc-400 hover:text-zinc-100 bg-zinc-900/60 border border-zinc-800 rounded-lg transition-colors shrink-0"
                >
                  <ExternalLink size={13} />
                </a>
              ) : (
                <span title="Ligue a validação e salve para o link responder" className="p-2 text-zinc-600 bg-zinc-900/60 border border-zinc-800 rounded-lg shrink-0 cursor-not-allowed">
                  <ExternalLink size={13} />
                </span>
              )}
              {isAdmin && (
              <button
                type="button"
                onClick={regenerarToken}
                disabled={regenerando}
                title="Gerar um novo link — o atual para de funcionar na hora"
                className="p-2 text-zinc-400 hover:text-amber-300 bg-zinc-900/60 border border-zinc-800 rounded-lg transition-colors shrink-0 disabled:opacity-50"
              >
                <RefreshCw size={13} className={regenerando ? 'animate-spin' : ''} />
              </button>
              )}
            </div>

            {!validacaoNoAr && (
              <p className="flex items-center gap-1.5 text-[11px] text-amber-400/90">
                <AlertTriangle size={12} className="shrink-0" />
                {config.validacaoHabilitada
                  ? 'Clique em Salvar, no rodapé do painel, para o link entrar no ar.'
                  : 'Ligue a chave acima e clique em Salvar para o link entrar no ar.'}
              </p>
            )}
          </>
        ) : (
          <p className="text-[11px] text-zinc-600">Salve a configuração uma vez para o link de validação ser gerado.</p>
        )}
      </div>

      {/* Versões servidas à LP. A página é uma só — banner, plantas e ficha são
          as mesmas; o que o botão de versão troca lá são as unidades, as colunas
          e os valores. Cada versão tem a própria publicação: reajustar não sobe
          sozinho, o corretor vê a última aprovada até alguém publicar. */}
      <Secao
        titulo="Versões na página"
        descricao="Marque quais versões o corretor pode escolher. Com mais de uma marcada, a página exibe os botões de versão nos filtros da tabela. Versão sem publicação não aparece na página."
      >
        {ordenadas.length === 0 ? (
          <p className="text-[11px] text-zinc-600">Este empreendimento ainda não tem versões de tabela de vendas.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {ordenadas.map(v => {
              const pendentes = pendenciaDaVersao(v);
              const nunca = pendentes === null;
              const totalPendente = pendentes
                ? pendentes.unidades.length + pendentes.colunas.length + pendentes.regras.length
                : 0;
              const temPendencia = totalPendente > 0;
              const alerta = v.lpVisivel && (temPendencia || nunca);
              return (
                <div
                  key={v.id}
                  className={`flex flex-col gap-2 p-2.5 border rounded-lg ${
                    alerta ? 'bg-amber-500/5 border-amber-500/30' : 'bg-zinc-900/50 border-zinc-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      {!v.lpVisivel
                        ? <EyeOff size={14} className="text-zinc-600 shrink-0 mt-0.5" />
                        : alerta
                          ? <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                          : <ShieldCheck size={14} className="text-emerald-400 shrink-0 mt-0.5" />}
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                          {v.nome}
                          {v.principal && <span className="text-[9px] font-bold text-blue-400 uppercase tracking-wider">principal</span>}
                        </p>
                        <p className="text-[11px] text-zinc-500 leading-relaxed">
                          {!v.lpVisivel ? (
                            <>Não aparece na página. Marque para o corretor poder escolher esta condição.</>
                          ) : nunca ? (
                            <>Nunca publicada — a página não exibe esta versão. Publique para o corretor vê-la.</>
                          ) : temPendencia ? (
                            <>
                              {[
                                pendentes!.unidades.length && `${pendentes!.unidades.length} ${pendentes!.unidades.length === 1 ? 'unidade' : 'unidades'}`,
                                pendentes!.colunas.length && `${pendentes!.colunas.length} ${pendentes!.colunas.length === 1 ? 'coluna' : 'colunas'}`,
                                pendentes!.regras.length && `${pendentes!.regras.length} ${pendentes!.regras.length === 1 ? 'regra' : 'regras'}`,
                              ].filter(Boolean).join(', ')} desde a última publicação
                              ({new Date(v.tabelaPublicadaEm!).toLocaleString('pt-BR')}). O corretor ainda vê a anterior.
                            </>
                          ) : (
                            <>Publicada em {new Date(v.tabelaPublicadaEm!).toLocaleString('pt-BR')}. Sem pendências.</>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {v.lpVisivel && (
                        <button
                          type="button"
                          onClick={() => publicar(v)}
                          disabled={!!publicando || (!temPendencia && !nunca)}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg transition-colors ${
                            temPendencia || nunca
                              ? 'text-white bg-amber-600 hover:bg-amber-500'
                              : 'text-zinc-600 bg-zinc-900/60 border border-zinc-800'
                          }`}
                        >
                          {publicando === v.id ? <Loader2 size={11} className="animate-spin" /> : <UploadCloud size={11} />}
                          {publicando === v.id ? 'Publicando...' : 'Publicar'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onSaveVersao({ ...v, lpVisivel: !v.lpVisivel })}
                        title={v.lpVisivel ? 'Tirar esta versão da página' : 'Liberar esta versão na página'}
                        className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${v.lpVisivel ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${v.lpVisivel ? 'left-[22px]' : 'left-0.5'}`} />
                      </button>
                    </div>
                  </div>

                  {temPendencia && totalPendente <= 12 && (
                    <p className="text-[10px] text-zinc-600 break-words">
                      {[
                        ...pendentes!.unidades.map(u => u.unidade).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
                        ...pendentes!.colunas.map(c => c.label),
                        ...pendentes!.regras.map(r => r.titulo),
                      ].join(', ')}
                    </p>
                  )}
                </div>
              );
            })}
            {versoesLp.length === 0 && (
              <p className="text-[11px] text-amber-400">
                Nenhuma versão liberada — a página responde como indisponível para o corretor.
              </p>
            )}
          </div>
        )}
      </Secao>

      <Secao titulo="Banner principal" descricao="Imagem de topo da página. Sem banner, a capa do empreendimento é usada.">
        <div className="flex items-center gap-3">
          {config.bannerUrl ? (
            <div className="relative shrink-0">
              <img src={config.bannerUrl} alt="" className="w-28 h-16 object-cover rounded-lg border border-zinc-800" />
              <button
                type="button"
                onClick={() => patch({ bannerUrl: null })}
                title="Remover banner"
                className="absolute -top-1.5 -right-1.5 p-1 bg-zinc-900 border border-zinc-700 rounded-full text-zinc-400 hover:text-red-400 transition-colors"
              >
                <X size={10} />
              </button>
            </div>
          ) : (
            <div className="w-28 h-16 rounded-lg border border-dashed border-zinc-800 flex items-center justify-center text-zinc-700 shrink-0">
              <ImageIcon size={16} />
            </div>
          )}
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={e => { handleUpload('banner', e.target.files); e.target.value = ''; }} />
            <button
              type="button"
              onClick={() => bannerInputRef.current?.click()}
              disabled={enviando === 'banner'}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-zinc-300 bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors disabled:opacity-50"
            >
              {enviando === 'banner' ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Enviar banner
            </button>
            <input type="text" value={config.titulo || ''} onChange={e => patch({ titulo: e.target.value })} placeholder="Nome do empreendimento (usado no título da aba)" className={INPUT_CLASS} />
            <input type="text" value={config.subtitulo || ''} onChange={e => patch({ subtitulo: e.target.value })} placeholder="Subtítulo (ex.: bairro, entrega prevista)" className={INPUT_CLASS} />
          </div>
        </div>
      </Secao>

      <Secao
        titulo="Logo do empreendimento"
        descricao="PNG (de preferência com fundo transparente) exibido no topo da LP no lugar do nome em texto. Sem logo, o nome volta a aparecer escrito."
      >
        <div className="flex items-center gap-3">
          {config.logoEmpreendimentoUrl ? (
            <div className="relative shrink-0">
              <img src={config.logoEmpreendimentoUrl} alt="" className="w-28 h-16 object-contain rounded-lg border border-zinc-800 bg-zinc-950 p-1" />
              <button
                type="button"
                onClick={() => patch({ logoEmpreendimentoUrl: null })}
                title="Remover logo"
                className="absolute -top-1.5 -right-1.5 p-1 bg-zinc-900 border border-zinc-700 rounded-full text-zinc-400 hover:text-red-400 transition-colors"
              >
                <X size={10} />
              </button>
            </div>
          ) : (
            <div className="w-28 h-16 rounded-lg border border-dashed border-zinc-800 flex items-center justify-center text-zinc-700 shrink-0">
              <ImageIcon size={16} />
            </div>
          )}
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            <input ref={logoInputRef} type="file" accept="image/png,image/svg+xml,image/webp" className="hidden" onChange={e => { handleUpload('logo', e.target.files); e.target.value = ''; }} />
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={enviando === 'logo'}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-zinc-300 bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors disabled:opacity-50"
            >
              {enviando === 'logo' ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Enviar logo PNG
            </button>
          </div>
        </div>
      </Secao>

      <Secao titulo="Descrição" descricao="Parágrafo exibido no topo, logo abaixo do logo do empreendimento.">
        <textarea
          value={config.descricao || ''}
          onChange={e => patch({ descricao: e.target.value })}
          rows={3}
          placeholder="Ex.: 32 apartamentos de 2 e 3 quartos, a duas quadras da orla, com entrega prevista para 2028."
          className={`${INPUT_CLASS} resize-y leading-relaxed`}
        />
      </Secao>

      {terceiros && (
        <Secao
          titulo="Imóveis"
          descricao="Um cadastro por imóvel da tabela. Aqui não existe material “do empreendimento”: fotos, descrição, informações, book e álbum pertencem ao imóvel e aparecem quando o corretor abre uma unidade dele — repetidos para todas as unidades do mesmo imóvel. O vínculo é pelo nome, por isso o imóvel se escolhe na lista da tabela de vendas em vez de se digitar."
        >
          {imoveisDaTabela.length === 0 ? (
            <p className="text-[11px] text-zinc-600">
              Nenhuma unidade da tabela tem imóvel preenchido ainda. Preencha a coluna “Imóvel” na Tabela de Vendas e os nomes aparecem aqui para cadastrar.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {config.imoveis.map(imovel => {
                const naTabela = imoveisDaTabela.some(n => normalizarNome(n) === normalizarNome(imovel.nome));
                const totalUnidades = unidades.filter(u => normalizarNome(u.imovel || '') === normalizarNome(imovel.nome)).length;
                // Cada nome da tabela pertence a um cadastro só: oferecer um já
                // usado por outro card criaria dois cadastros para o mesmo
                // imóvel e a LP mostraria só o primeiro.
                const disponiveis = imoveisDaTabela.filter(n =>
                  normalizarNome(n) === normalizarNome(imovel.nome)
                  || !config.imoveis.some(outro => outro.id !== imovel.id && normalizarNome(outro.nome) === normalizarNome(n))
                );
                return (
                  <div key={imovel.id} className="flex flex-col gap-2 p-3 bg-zinc-900/30 border border-zinc-800/70 rounded-xl">
                    <div className="flex items-center gap-2">
                      <select
                        value={naTabela ? imovel.nome : ''}
                        onChange={e => patchImovel(imovel.id, () => ({ nome: e.target.value }))}
                        className={`${INPUT_CLASS} font-semibold`}
                      >
                        <option value="">Selecione o imóvel...</option>
                        {disponiveis.map(nome => <option key={nome} value={nome}>{nome}</option>)}
                      </select>
                      <span className="text-[10px] text-zinc-600 shrink-0 whitespace-nowrap">
                        {totalUnidades} {totalUnidades === 1 ? 'unidade' : 'unidades'}
                      </span>
                      <button
                        type="button"
                        onClick={() => patch({ imoveis: config.imoveis.filter(i => i.id !== imovel.id) })}
                        title="Remover este cadastro (não mexe nas unidades da tabela)"
                        className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                    {/* O nome existe no cadastro mas sumiu da tabela: nenhuma
                        linha vai abrir este material, e apagar por conta
                        própria destruiria fotos e textos já enviados. */}
                    {imovel.nome.trim() && !naTabela && (
                      <p className="flex items-start gap-1.5 text-[10px] text-amber-400">
                        <AlertTriangle size={11} className="shrink-0 mt-px" />
                        “{imovel.nome}” não corresponde a nenhuma unidade da tabela — este cadastro não aparece na página. Escolha o imóvel certo na lista acima ou corrija a coluna Imóvel na Tabela de Vendas.
                      </p>
                    )}

                    <textarea
                      value={imovel.descricao || ''}
                      onChange={e => patchImovel(imovel.id, () => ({ descricao: e.target.value }))}
                      rows={2}
                      placeholder="Descrição do imóvel — exibida ao lado das fotos quando a unidade é aberta."
                      className={`${INPUT_CLASS} resize-y leading-relaxed`}
                    />

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={imovel.bookUrl || ''}
                        onChange={e => patchImovel(imovel.id, () => ({ bookUrl: e.target.value }))}
                        placeholder="Link do book (ou envie o PDF)"
                        className={INPUT_CLASS}
                      />
                      <input
                        id={`lp-imovel-book-${imovel.id}`}
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={e => { handleUploadImovel(imovel.id, 'book', e.target.files); e.target.value = ''; }}
                      />
                      <label
                        htmlFor={`lp-imovel-book-${imovel.id}`}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-zinc-300 bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors shrink-0 cursor-pointer"
                      >
                        {enviando === `imovel:${imovel.id}:book` ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} PDF
                      </label>
                      <input
                        type="text"
                        value={imovel.fotosUrl || ''}
                        onChange={e => patchImovel(imovel.id, () => ({ fotosUrl: e.target.value }))}
                        placeholder="Link do álbum de fotos (Drive, site...)"
                        className={INPUT_CLASS}
                      />
                    </div>

                    {/* Fotos do imóvel: viram o carrossel da linha expandida, no
                        lugar onde um empreendimento próprio mostra a planta. */}
                    {imovel.imagens.length > 0 && (
                      <div className="flex flex-col gap-2">
                        {imovel.imagens.map(img => (
                          <div key={img.id} className="flex items-center gap-2">
                            <button type="button" onClick={() => setPreview(img.url)} title="Ver foto em tamanho maior" className="shrink-0">
                              <img src={img.url} alt="" className="w-12 h-12 object-cover rounded-lg border border-zinc-800 hover:border-zinc-600 transition-colors cursor-zoom-in" />
                            </button>
                            <input
                              type="text"
                              value={img.legenda}
                              onChange={e => patchImovel(imovel.id, im => ({ imagens: im.imagens.map(i => i.id === img.id ? { ...i, legenda: e.target.value } : i) }))}
                              placeholder="Legenda (opcional)"
                              className={INPUT_CLASS}
                            />
                            <button
                              type="button"
                              onClick={() => patchImovel(imovel.id, im => ({ imagens: im.imagens.filter(i => i.id !== img.id) }))}
                              className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Informações do imóvel: o que num empreendimento próprio
                        fica no topo da página. */}
                    {imovel.fichaTecnica.length > 0 && (
                      <div className="flex flex-col gap-2">
                        {imovel.fichaTecnica.map(item => (
                          <div key={item.id} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={item.label}
                              onChange={e => patchImovel(imovel.id, im => ({ fichaTecnica: im.fichaTecnica.map(i => i.id === item.id ? { ...i, label: e.target.value } : i) }))}
                              placeholder="Item (ex.: Tipologia)"
                              className={INPUT_CLASS}
                            />
                            <input
                              type="text"
                              value={item.valor}
                              onChange={e => patchImovel(imovel.id, im => ({ fichaTecnica: im.fichaTecnica.map(i => i.id === item.id ? { ...i, valor: e.target.value } : i) }))}
                              disabled={!!item.url?.trim()}
                              title={item.url?.trim() ? 'Ignorado: com link preenchido a linha mostra “Abrir”' : undefined}
                              placeholder="Valor"
                              className={`${INPUT_CLASS} disabled:opacity-40`}
                            />
                            <input
                              type="text"
                              value={item.url || ''}
                              onChange={e => patchImovel(imovel.id, im => ({ fichaTecnica: im.fichaTecnica.map(i => i.id === item.id ? { ...i, url: e.target.value } : i) }))}
                              placeholder="Link (opcional)"
                              className={INPUT_CLASS}
                            />
                            <button
                              type="button"
                              onClick={() => patchImovel(imovel.id, im => ({ fichaTecnica: im.fichaTecnica.filter(i => i.id !== item.id) }))}
                              className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      <input
                        id={`lp-imovel-imgs-${imovel.id}`}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={e => { handleUploadImovel(imovel.id, 'imagens', e.target.files); e.target.value = ''; }}
                      />
                      <label
                        htmlFor={`lp-imovel-imgs-${imovel.id}`}
                        className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                      >
                        {enviando === `imovel:${imovel.id}:imagens` ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} strokeWidth={3} />} Adicionar fotos
                      </label>
                      <button
                        type="button"
                        onClick={() => patchImovel(imovel.id, im => ({ fichaTecnica: [...im.fichaTecnica, { id: crypto.randomUUID(), label: '', valor: '', url: '' }] }))}
                        className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        <Plus size={11} strokeWidth={3} /> Adicionar informação
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {imoveisSemCadastro.length > 0 && (
            <p className="text-[11px] text-zinc-500">
              Sem cadastro: <span className="text-zinc-300">{imoveisSemCadastro.join(', ')}</span>. As unidades desses imóveis abrem sem fotos nem informações.
            </p>
          )}

          {imoveisDaTabela.length > 0 && (
            <button
              type="button"
              onClick={() => patch({
                imoveis: [...config.imoveis, {
                  id: crypto.randomUUID(),
                  // Já nasce apontando para o primeiro imóvel sem cadastro: é
                  // quase sempre o que se quer, e evita salvar um card em branco.
                  nome: imoveisSemCadastro[0] || '',
                  descricao: null,
                  bookUrl: null,
                  fotosUrl: null,
                  imagens: [],
                  fichaTecnica: [],
                }],
              })}
              className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-colors self-start"
            >
              <Plus size={11} strokeWidth={3} /> Adicionar imóvel
            </button>
          )}
        </Secao>
      )}

      {/* Material do empreendimento inteiro. Num empreendimento de terceiros
          nada disso existe — cada linha da tabela é de um imóvel diferente, e
          o material dela está no cadastro acima. */}
      {!terceiros && (
      <>
      <Secao titulo="Imagens do Produto" descricao="Galeria do menu de informações.">
        <input ref={imagensInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { handleUpload('imagens', e.target.files); e.target.value = ''; }} />
        {config.imagens.length > 0 && (
          <div className="flex flex-col gap-2">
            {config.imagens.map(img => (
              <div key={img.id} className="flex items-center gap-2">
                <GripVertical size={12} className="text-zinc-700 shrink-0" />
                <button
                  type="button"
                  onClick={() => setPreview(img.url)}
                  title="Ver foto em tamanho maior"
                  className="shrink-0"
                >
                  <img src={img.url} alt="" className="w-12 h-12 object-cover rounded-lg border border-zinc-800 hover:border-zinc-600 transition-colors cursor-zoom-in" />
                </button>
                <input
                  type="text"
                  value={img.legenda}
                  onChange={e => patch({ imagens: config.imagens.map((i: LpCorretorImagem) => i.id === img.id ? { ...i, legenda: e.target.value } : i) })}
                  placeholder="Legenda (opcional)"
                  className={INPUT_CLASS}
                />
                <button
                  type="button"
                  onClick={() => patch({ imagens: config.imagens.filter(i => i.id !== img.id) })}
                  className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => imagensInputRef.current?.click()}
          disabled={enviando === 'imagens'}
          className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50 self-start"
        >
          {enviando === 'imagens' ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} strokeWidth={3} />} Adicionar imagens
        </button>
      </Secao>

      <Secao
        titulo="Plantas"
        descricao="Exibidas ao expandir a linha de uma unidade. A ligação é por terminação: '01' vale para 101, 201, 1101 e assim por diante. Se a mesma terminação tiver plantas diferentes em andares diferentes, informe o(s) andar(es) para desempatar (ex.: '01' + andar '3' pega só a 301). Uma planta com unidades específicas preenchidas vale só para elas e ignora terminação e andar — é assim que a cobertura fica com a planta própria mesmo tendo a mesma terminação das demais. Com todos os campos em branco, a planta vale para o empreendimento inteiro (ex.: pavimento)."
      >
        <input ref={plantasInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { handleUpload('plantas', e.target.files); e.target.value = ''; }} />
        {config.plantas.length > 0 && (
          <div className="flex flex-col gap-2">
            {config.plantas.map(planta => {
              const atualizar = (mudanca: Partial<LpCorretorPlanta>) => patch({
                plantas: config.plantas.map((p: LpCorretorPlanta) => p.id === planta.id ? { ...p, ...mudanca } : p),
              });
              // Aceita ',' e ';' como separador — o resto do módulo Sienge usa ';'
              // (CSV de import/export), então quem digita aqui no automatismo do
              // app inteiro não pode ficar com o campo inteiro virando um único
              // item que nunca bate com nenhuma unidade real.
              const listaDe = (texto: string) => texto.split(/[,;]/).map(s => s.trim()).filter(Boolean);
              const propria = planta.unidades.length > 0;
              return (
                <div key={planta.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreview(planta.url)}
                    title="Ver planta em tamanho maior"
                    className="shrink-0"
                  >
                    <img src={planta.url} alt="" className="w-12 h-12 object-contain rounded-lg border border-zinc-800 hover:border-zinc-600 bg-zinc-950 transition-colors cursor-zoom-in" />
                  </button>
                  <input
                    type="text"
                    value={planta.legenda}
                    onChange={e => atualizar({ legenda: e.target.value })}
                    placeholder="Legenda (ex.: Planta baixa — Tipo A)"
                    className={INPUT_CLASS}
                  />
                  <input
                    type="text"
                    value={(planta.terminacoes || []).join(', ')}
                    onChange={e => atualizar({ terminacoes: listaDe(e.target.value) })}
                    disabled={propria}
                    title={propria ? 'Ignorado: esta planta já está restrita a unidades específicas' : undefined}
                    placeholder="Terminações (ex.: 01, 02)"
                    className={`${INPUT_CLASS} disabled:opacity-40`}
                  />
                  <input
                    type="text"
                    value={(planta.andares || []).join(', ')}
                    onChange={e => atualizar({ andares: listaDe(e.target.value) })}
                    disabled={propria}
                    title={propria ? 'Ignorado: esta planta já está restrita a unidades específicas' : 'Opcional — só necessário quando a mesma terminação tem plantas diferentes por andar'}
                    placeholder="Andar (ex.: 3, 10) — opcional"
                    className={`${INPUT_CLASS} disabled:opacity-40`}
                  />
                  <input
                    type="text"
                    value={planta.unidades.join(', ')}
                    onChange={e => atualizar({ unidades: listaDe(e.target.value) })}
                    placeholder="Unidades específicas (ex.: cobertura)"
                    className={INPUT_CLASS}
                  />
                  <button
                    type="button"
                    onClick={() => patch({ plantas: config.plantas.filter(p => p.id !== planta.id) })}
                    className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <button
          type="button"
          onClick={() => plantasInputRef.current?.click()}
          disabled={enviando === 'plantas'}
          className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50 self-start"
        >
          {enviando === 'plantas' ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} strokeWidth={3} />} Adicionar plantas
        </button>
      </Secao>

      <Secao
        titulo="Informações"
        descricao="Pares de informação exibidos em lista (ex.: Metragem — 42 m² a 78 m²). Com um link preenchido, a linha mostra “Abrir” no lugar do valor, como o Book."
      >
        {config.fichaTecnica.length > 0 && (
          <div className="flex flex-col gap-2">
            {config.fichaTecnica.map(item => {
              // Um único atualizador por item: os três campos escrevem no mesmo
              // objeto do array e só mudam a chave que lhes cabe.
              const atualizar = (p: Partial<LpCorretorFichaItem>) => patch({
                fichaTecnica: config.fichaTecnica.map((i: LpCorretorFichaItem) => i.id === item.id ? { ...i, ...p } : i),
              });
              return (
                <div key={item.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={item.label}
                    onChange={e => atualizar({ label: e.target.value })}
                    placeholder="Item"
                    className={INPUT_CLASS}
                  />
                  <input
                    type="text"
                    value={item.valor}
                    onChange={e => atualizar({ valor: e.target.value })}
                    disabled={!!item.url?.trim()}
                    title={item.url?.trim() ? 'Ignorado: com link preenchido a linha mostra “Abrir”' : undefined}
                    placeholder="Valor"
                    className={`${INPUT_CLASS} disabled:opacity-40`}
                  />
                  <input
                    type="text"
                    value={item.url || ''}
                    onChange={e => atualizar({ url: e.target.value })}
                    placeholder="Link (opcional)"
                    className={INPUT_CLASS}
                  />
                  <button
                    type="button"
                    onClick={() => patch({ fichaTecnica: config.fichaTecnica.filter(i => i.id !== item.id) })}
                    className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <button
          type="button"
          onClick={() => patch({ fichaTecnica: [...config.fichaTecnica, { id: crypto.randomUUID(), label: '', valor: '', url: '' }] })}
          className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-colors self-start"
        >
          <Plus size={11} strokeWidth={3} /> Adicionar item
        </button>
      </Secao>

      <Secao titulo="Book" descricao="PDF ou link externo do material de vendas.">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={config.bookUrl || ''}
            onChange={e => patch({ bookUrl: e.target.value })}
            placeholder="https://... (ou envie um PDF)"
            className={INPUT_CLASS}
          />
          <input ref={bookInputRef} type="file" accept="application/pdf" className="hidden" onChange={e => { handleUpload('book', e.target.files); e.target.value = ''; }} />
          <button
            type="button"
            onClick={() => bookInputRef.current?.click()}
            disabled={enviando === 'book'}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-zinc-300 bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors shrink-0 disabled:opacity-50"
          >
            {enviando === 'book' ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} PDF
          </button>
        </div>
      </Secao>
      </>
      )}

      <Secao
        titulo="Colunas da tabela"
        descricao="Colunas de todas as versões do empreendimento — marcar aqui a coluna de uma versão ainda não liberada não a põe na página, mas já a mostra na validação. Unidade, valor e situação sempre aparecem na linha. Para cada coluna restante escolha: Oculta (não sai do banco), Linha (aparece na linha compacta) ou Detalhe (aparece só ao expandir a unidade, ao lado da planta) — o card da unidade sempre mostra tudo que não estiver oculto."
      >
        {merged.length === 0 ? (
          <p className="text-[11px] text-zinc-600">Este empreendimento ainda não tem colunas na tabela de vendas.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {merged.map(m => {
              const key = m.kind === 'coluna' ? m.item.key : `${REGRA_PREFIX}${m.item.id}`;
              const label = m.kind === 'coluna' ? m.item.label : m.item.titulo;
              const destino = destinoDe(key);
              // Regra pertence a uma versão só; com mais de uma versão, o nome
              // dela é o que distingue duas regras homônimas ("Valor m²" existe
              // em quase todas).
              const daVersao = m.kind === 'regra' && ordenadas.length > 1 ? nomeVersaoDaRegra.get(m.item.id) : null;
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 flex items-center gap-1.5 text-[11px] text-zinc-300 truncate">
                    {label}
                    {m.kind === 'regra' && <span className="text-[9px] text-zinc-600 uppercase shrink-0">calc.</span>}
                    {daVersao && <span className="text-[9px] text-zinc-600 shrink-0 truncate">· {daVersao}</span>}
                  </span>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {DESTINOS.map(d => (
                      <button
                        key={d.valor}
                        type="button"
                        onClick={() => setDestinoColuna(key, d.valor)}
                        aria-pressed={destino === d.valor}
                        className={`px-2 py-1 text-[10px] font-bold rounded-md border transition-colors ${
                          destino === d.valor ? d.ativo : 'text-zinc-600 bg-zinc-900/60 border-zinc-800 hover:text-zinc-400'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Secao>

      <Secao
        titulo="RI"
        descricao="Registro de Incorporação. Enquanto não está registrado, o empreendimento não vende — o que existe são reservas, e a página precisa dizer isso."
      >
        <div className="flex items-center justify-between gap-3 p-2.5 bg-zinc-900/50 border border-zinc-800 rounded-lg">
          <div className="flex items-center gap-2 min-w-0">
            {config.riRegistrado
              ? <ShieldCheck size={14} className="text-emerald-400 shrink-0" />
              : <AlertTriangle size={14} className="text-amber-400 shrink-0" />}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-zinc-200">
                {config.riRegistrado ? 'RI registrado' : 'RI não registrado'}
              </p>
              <p className="text-[11px] text-zinc-500">
                {config.riRegistrado
                  ? 'A tabela sai como está: vendida aparece como vendida.'
                  : 'As unidades vendidas aparecem como reservadas. As já reservadas não mudam.'}
              </p>
            </div>
          </div>
          {/* A troca acontece na RPC, não na tela: com o RI desligado a
              situação real nem chega ao navegador do corretor. */}
          <button
            type="button"
            onClick={() => patch({ riRegistrado: !config.riRegistrado })}
            aria-pressed={config.riRegistrado}
            aria-label={config.riRegistrado ? 'Marcar RI como não registrado' : 'Marcar RI como registrado'}
            className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${config.riRegistrado ? 'bg-emerald-500' : 'bg-zinc-700'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${config.riRegistrado ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
      </Secao>

      <Secao
        titulo="Filtro de tipologia"
        descricao="Coluna que guarda a tipologia da unidade. A LP monta um botão por valor encontrado, e um clique filtra a tabela inteira. Sem coluna escolhida, a página não mostra esse filtro."
      >
        <select
          value={config.colunaTipologia || ''}
          onChange={e => patch({ colunaTipologia: e.target.value || null })}
          className={INPUT_CLASS}
        >
          <option value="">Sem filtro de tipologia</option>
          {/* Só colunas não-ocultas: coluna oculta não sai do banco (é a
              fronteira de colunas_visiveis) e o filtro nasceria vazio. */}
          {opcoesTipologia.map(o => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
        {config.colunaTipologia && !opcoesTipologia.some(o => o.key === config.colunaTipologia) && (
          <p className="flex items-center gap-1.5 text-[11px] text-amber-400">
            <AlertTriangle size={11} className="shrink-0" />
            A coluna escolhida está oculta ou não existe mais nas versões liberadas — o filtro não vai aparecer na página.
          </p>
        )}
      </Secao>

      <Secao
        titulo="Botão Reservar (CVCRM)"
        descricao="Link aberto ao tocar em Reservar, exibido apenas nas unidades disponíveis. Use {unidade} onde o nome da unidade deve entrar; sem o placeholder, todas apontam para o mesmo endereço."
      >
        <input
          type="text"
          value={config.cvcrmUrlTemplate || ''}
          onChange={e => patch({ cvcrmUrlTemplate: e.target.value })}
          placeholder="https://empresa.cvcrm.com.br/reserva?empreendimento=123&unidade={unidade}"
          className={INPUT_CLASS}
        />
      </Secao>

      <Secao titulo="Observações" descricao="Texto exibido logo abaixo da tabela.">
        <textarea
          value={config.observacoes || ''}
          onChange={e => patch({ observacoes: e.target.value })}
          rows={4}
          placeholder="Ex.: condições de pagamento, validade da tabela, sinal mínimo..."
          className={`${INPUT_CLASS} resize-y leading-relaxed`}
        />
      </Secao>

      {erro && <p className="text-[11px] text-red-400">{erro}</p>}

      <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800/70">
        {dirty && <span className="text-[11px] text-amber-400 mr-auto">Alterações não salvas</span>}
        <button
          type="button"
          onClick={salvar}
          disabled={salvando || !dirty}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 rounded-lg transition-colors"
        >
          {salvando ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} strokeWidth={3} />} Salvar
        </button>
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <button
            type="button"
            onClick={() => setPreview(null)}
            aria-label="Fechar"
            className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white"
          >
            <X size={22} />
          </button>
          <img src={preview} alt="" className="max-h-full max-w-full object-contain rounded-lg" />
        </div>
      )}
    </div>
  );
}
