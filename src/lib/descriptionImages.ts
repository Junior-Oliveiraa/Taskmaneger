import { UPLOAD_LIMITS, uploadDataUrl, extensionForDataUrl, sanitizeFileName } from './storage';

// Imagens coladas na descrição chegam como `data:` base64. Guardá-las dentro da
// coluna description fazia a linha crescer para centenas de KB: além de pesar em
// toda leitura de tarefas, estourava o limite de URL do compare-and-swap que
// protege a descrição, gerando conflito falso e descartando o que era digitado.
// Aqui elas viram links do Storage, e o banco guarda só a URL.

const BUCKET = 'attachments' as const;

export function isDataUrlImage(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:image');
}

/** Sobe uma imagem base64 da descrição e devolve a URL pública. */
export async function uploadDescriptionImage(taskId: string, dataUrl: string): Promise<string> {
  const prefix = sanitizeFileName(taskId) || 'task';
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionForDataUrl(dataUrl)}`;
  return uploadDataUrl(BUCKET, `task-descriptions/${prefix}/${name}`, dataUrl, UPLOAD_LIMITS.task);
}

/** Converte um File (colado ou arrastado) em `data:` URL. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler a imagem.'));
    reader.readAsDataURL(file);
  });
}

/** Lê as imagens da área de transferência (print recém-tirado). Vazio se não houver ou sem permissão. */
export async function imagensDoClipboard(): Promise<File[]> {
  try {
    const arquivos: File[] = [];
    for (const item of await navigator.clipboard.read()) {
      const tipo = item.types.find(t => t.startsWith('image/'));
      if (!tipo) continue;
      arquivos.push(new File([await item.getType(tipo)], `print.${tipo.split('/')[1]}`, { type: tipo }));
    }
    return arquivos;
  } catch {
    return [];
  }
}

/** Extrai os arquivos de imagem de um DataTransfer (clipboard ou drop). */
export function imageFilesFrom(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  return Array.from(dt.files || []).filter(f => f.type.startsWith('image/'));
}
