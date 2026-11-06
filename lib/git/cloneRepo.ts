// lib/git/cloneRepo.ts
//
// Клонує публічний GitHub-репозиторій (shallow, depth=1) у тимчасову теку
// через isomorphic-git + вбудований node:fs. Тека видаляється після аналізу
// викликом cleanup().

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";

export interface CloneResult {
  dir: string;
  owner: string;
  repo: string;
  branch: string;
  cleanup: () => Promise<void>;
}

const GITHUB_URL_RE =
  /^https?:\/\/github\.com\/(?<owner>[\w.-]+)\/(?<repo>[\w.-]+?)(\.git)?\/?$/;

export function parseGithubUrl(url: string) {
  const match = GITHUB_URL_RE.exec(url.trim());
  if (!match?.groups) {
    throw new Error(
      "Некоректне посилання на GitHub-репозиторій. Очікується формат https://github.com/<owner>/<repo>"
    );
  }
  return { owner: match.groups.owner, repo: match.groups.repo };
}

export async function cloneRepo(
  repoUrl: string,
  branch?: string
): Promise<CloneResult> {
  const { owner, repo } = parseGithubUrl(repoUrl);
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "dstu-repo-"));
  const cleanup = () => fs.promises.rm(dir, { recursive: true, force: true });

  try {
    await git.clone({
      fs,
      http,
      dir,
      url: `https://github.com/${owner}/${repo}.git`,
      ref: branch || undefined,
      singleBranch: true,
      depth: 1,
      noTags: true,
    });
  } catch (err) {
    await cleanup();
    throw new Error(
      `Не вдалося клонувати репозиторій "${owner}/${repo}"${
        branch ? ` (гілка ${branch})` : ""
      }. Перевірте, що репозиторій публічний, а гілка існує. Деталі: ${
        (err as Error).message
      }`
    );
  }

  const resolvedBranch =
    branch || (await git.currentBranch({ fs, dir, fullname: false })) || "main";

  return { dir, owner, repo, branch: resolvedBranch, cleanup };
}
