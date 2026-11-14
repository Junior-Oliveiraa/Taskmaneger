// Gera um PNG de exemplo (dados do print da Gênova/110) para revisar o layout.
// Uso: node preview.js [saida.png]
import { writeFileSync } from 'node:fs';
import { renderCard } from './card.js';

const exemplo = {
  numero: 128,
  data: '13/11/2026',
  empreendimento: 'Gênova',
  unidade: '110',
  cliente: 'Maria Costa',
  corretor: 'João Silva',
  imobiliaria: 'Imobiliária Exemplo',
  solicitante: 'Ana Souza',
  valorTabela: 477490.38,
  limitePct: 1.5,
  autorizacao: {
    torre: 'Torre Única',
    areaPrivativa: 53.54,
    valorTabela: 477490.38,
    parcelas: [
      { descricao: 'Sinal', quantidade: 1, valorUnitario: 32695.20, primeiroVencimento: '2026-11-13', periodicidade: 0 },
      { descricao: 'Mensais', quantidade: 18, valorUnitario: 2469.33, primeiroVencimento: '2026-12-13', periodicidade: 1 },
      { descricao: 'Semestrais', quantidade: 2, valorUnitario: 8189.25, primeiroVencimento: '2027-05-13', periodicidade: 6 },
      { descricao: 'Financiamento CEF', quantidade: 1, valorUnitario: 375788.89, primeiroVencimento: '2026-11-13', periodicidade: 0 },
    ],
  },
};

const out = process.argv[2] || 'preview.png';
const t = Date.now();
writeFileSync(out, await renderCard(exemplo));
console.log(`ok: ${out} em ${Date.now() - t} ms`);
