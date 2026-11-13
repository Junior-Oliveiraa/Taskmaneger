/**
 * Rodapé institucional da LP do Corretor — igual em todas as páginas, por isso
 * fica no código e não no painel de configuração. Único lugar a editar quando
 * um canal de contato mudar.
 */
interface LpEmpresa {
  nome: string;
  descricao: string;
  logoUrl: string;
  creci: string;
  endereco: string;
  telefone: string;
  whatsapp: string;
  email: string;
  site: string;
  instagram: string;
}

export const LP_EMPRESA: LpEmpresa = {
  nome: 'Uchôa Empreendimentos',
  descricao: 'Com mais de 40 anos no mercado da Construção Civil, em especial nos segmentos de obras públicas e imobiliários, temos como propósito transformar a vida das pessoas e as cidades em que atuamos.',
  logoUrl: '/Logo_Primaria.png',
  creci: '',
  endereco: 'Av. Dr. Antônio Gomes de Barros, 625 — Jatiúca, Maceió/AL, 57036-001',
  telefone: '+55 82 98109-6793',
  whatsapp: '5582981096793', // só dígitos com DDI — é o que o wa.me aceita
  email: 'comercial@uchoaempreendimentos.com.br',
  site: 'https://www.uchoaempreendimentos.com.br',
  instagram: 'uchoaempreendimentos',
};

/** Canais preenchidos, na ordem em que aparecem no rodapé. */
export function canaisDeContato() {
  const canais: { label: string; href: string; texto: string }[] = [];
  if (LP_EMPRESA.whatsapp) canais.push({ label: 'WhatsApp', href: `https://wa.me/${LP_EMPRESA.whatsapp}`, texto: 'Falar no WhatsApp' });
  if (LP_EMPRESA.telefone) canais.push({ label: 'Telefone', href: `tel:${LP_EMPRESA.telefone.replace(/\D/g, '')}`, texto: LP_EMPRESA.telefone });
  if (LP_EMPRESA.email) canais.push({ label: 'E-mail', href: `mailto:${LP_EMPRESA.email}`, texto: LP_EMPRESA.email });
  if (LP_EMPRESA.instagram) canais.push({ label: 'Instagram', href: `https://instagram.com/${LP_EMPRESA.instagram}`, texto: `@${LP_EMPRESA.instagram}` });
  if (LP_EMPRESA.site) canais.push({ label: 'Site', href: LP_EMPRESA.site, texto: LP_EMPRESA.site.replace(/^https?:\/\//, '') });
  return canais;
}
