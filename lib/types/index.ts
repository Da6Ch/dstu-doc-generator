// lib/types/index.ts

/** Ідентифікатори підтримуваних артефактів ДСТУ/ЄСПД серії 19 */
export type DstuStandardId =
  | "dstu-19201" // Технічне завдання
  | "dstu-19402" // Опис програми
  | "dstu-19404" // Пояснювальна записка
  | "dstu-19505"; // Керівництво системного програміста

export interface DstuStandardMeta {
  id: DstuStandardId;
  code: string;
  title: string;
  description: string;
}

export interface RepoFile {
  path: string;      // відносний шлях у репозиторії
  content: string;   // текстовий вміст (обрізаний за потреби)
  language: string;  // визначена мова/тип файлу
  sizeBytes: number;
}

export interface RepoTreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: RepoTreeNode[];
}

export interface RepoSnapshot {
  owner: string;
  repo: string;
  branch: string;
  tree: RepoTreeNode[];
  files: RepoFile[];      // відфільтровані, готові до аналізу файли
  readme?: string;
  totalFilesScanned: number;
  totalFilesIncluded: number;
}

export interface GenerationRequest {
  repoUrl: string;
  branch?: string;
  standards: DstuStandardId[];
}

/** Подія SSE, яку бекенд надсилає клієнту під час генерації */
export type GenerationEvent =
  | { type: "status"; stage: string; message: string }
  | { type: "tree"; tree: RepoTreeNode[] }
  | { type: "doc-start"; standard: DstuStandardId; title: string }
  | { type: "doc-chunk"; standard: DstuStandardId; delta: string }
  | { type: "doc-end"; standard: DstuStandardId }
  | { type: "error"; message: string }
  | { type: "done" };
