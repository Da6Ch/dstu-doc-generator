// lib/types/index.ts

/** Ідентифікатори підтримуваних типів документів */
export type DocStandardId =
  | "iso-29148" // Специфікація вимог до ПЗ (SRS)
  | "iso-42010" // Опис архітектури
  | "iso-26514" // Документація для користувачів та адміністраторів
  | "espd-19404"; // Пояснювальна записка (ЄСПД)

export interface DocStandardMeta {
  id: DocStandardId;
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
  standards: DocStandardId[];
}

/** Подія SSE, яку бекенд надсилає клієнту під час генерації */
export type GenerationEvent =
  | { type: "status"; stage: string; message: string }
  | { type: "tree"; tree: RepoTreeNode[] }
  | { type: "doc-start"; standard: DocStandardId; title: string }
  | { type: "doc-chunk"; standard: DocStandardId; delta: string }
  | { type: "doc-end"; standard: DocStandardId }
  | { type: "error"; message: string }
  | { type: "done" };
