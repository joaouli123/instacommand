import { getPrisma } from '../lib/prisma';
import { AppError, ValidationError } from '../utils/errors';

const prisma = getPrisma();

// Each Threads, X and YouTube profile belongs to one company (an Instagram account,
// the "empresa" chosen at the top of the panel). Screens, posts and reports use only
// the profiles of the selected company, so one client's data never shows up in another.

export type LinkedNetwork = 'THREADS' | 'X' | 'YOUTUBE';
export const LINKED_NETWORKS: LinkedNetwork[] = ['THREADS', 'X', 'YOUTUBE'];
const NETWORK_LABELS: Record<LinkedNetwork, string> = { THREADS: 'do Threads', X: 'do X', YOUTUBE: 'do YouTube' };

/** The company id when it belongs to the user and is connected, otherwise null. */
export async function ownedWorkspaceId(userId: string, raw: unknown): Promise<string | null> {
  if (typeof raw !== 'string' || !/^[0-9a-f-]{36}$/i.test(raw)) return null;
  const account = await prisma.instagramAccount.findFirst({ where: { id: raw, userId, isActive: true }, select: { id: true } });
  return account?.id ?? null;
}

const delegate = (network: LinkedNetwork) => (network === 'THREADS' ? prisma.threadsAccount : network === 'X' ? prisma.xAccount : prisma.youTubeAccount) as unknown as {
  findFirst(args: unknown): Promise<{ id: string; workspaceAccountId: string | null } | null>;
  update(args: unknown): Promise<unknown>;
};

/** Moves a profile to a company of the same user, or unlinks it with null. */
export async function linkNetworkAccount(network: LinkedNetwork, accountId: string, userId: string, workspaceAccountId: unknown) {
  const account = await delegate(network).findFirst({ where: { id: accountId, userId, isActive: true }, select: { id: true, workspaceAccountId: true } });
  if (!account) throw new AppError('Conta não encontrada.', 404);
  let target: string | null = null;
  if (workspaceAccountId !== null) {
    target = await ownedWorkspaceId(userId, workspaceAccountId);
    if (!target) throw new ValidationError('Empresa inválida. Escolha uma das empresas conectadas.');
  }
  await delegate(network).update({ where: { id: account.id }, data: { workspaceAccountId: target } });
  return { id: account.id, workspaceAccountId: target };
}

/** Links a profile right after it is connected from inside a company. */
export async function linkAfterConnect(network: LinkedNetwork, accountId: string, userId: string, workspaceAccountId: unknown) {
  const target = await ownedWorkspaceId(userId, workspaceAccountId);
  if (target) await delegate(network).update({ where: { id: accountId }, data: { workspaceAccountId: target } });
}

/**
 * A Threads profile always mirrors an Instagram profile with the same username, so an
 * unlinked one is attached to that company. Profiles with no exact match stay unlinked
 * until the user chooses the company in Accounts.
 */
export async function autoLinkThreadsAccounts(userId: string) {
  const unlinked = await prisma.threadsAccount.findMany({ where: { userId, isActive: true, workspaceAccountId: null }, select: { id: true, username: true } });
  if (!unlinked.length) return;
  const companies = await prisma.instagramAccount.findMany({ where: { userId, isActive: true }, select: { id: true, igUsername: true } });
  for (const profile of unlinked) {
    const match = companies.filter((company) => company.igUsername.toLowerCase() === profile.username.toLowerCase());
    if (match.length === 1) await prisma.threadsAccount.update({ where: { id: profile.id }, data: { workspaceAccountId: match[0].id } });
  }
}

/** Rejects a post whose Threads, X or YouTube profile belongs to another company (or to none). */
export function assertSameWorkspace(instagramAccountId: string, profiles: Array<{ network: LinkedNetwork; account: { workspaceAccountId?: string | null } | null | undefined }>) {
  for (const { network, account } of profiles) {
    if (!account) continue;
    if (!account.workspaceAccountId) throw new ValidationError(`A conta ${NETWORK_LABELS[network]} ainda não está vinculada a uma empresa. Vincule em Contas antes de publicar.`);
    if (account.workspaceAccountId !== instagramAccountId) throw new ValidationError(`A conta ${NETWORK_LABELS[network]} escolhida pertence a outra empresa. Use a conta da empresa selecionada.`);
  }
}
