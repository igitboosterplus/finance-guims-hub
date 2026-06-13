/**
 * ==================== GESTION DES ÉCRITURES COMPTABLES ====================
 * 
 * Ce module gère le cycle comptable :
 * 1. Création d'écritures (débits/crédits)
 * 2. Validation et numérotation (unicité, équilibre)
 * 3. Clôture de périodes
 * 4. États comptables (balance, grand livre, journal)
 */

import {
  JournalEntry,
  JournalLine,
  AccountingPeriod,
  getAccount,
  isJournalLineBalanced,
  calculateAccountBalance,
} from './chartOfAccounts';
import { getTransactions } from './data';
import { getSupabase, isSupabaseConfigured, TABLES } from './firebase';
import { syncSetDoc, syncDeleteDoc } from './sync';

// ==================== STOCKAGE LOCAL ====================

const JOURNAL_ENTRIES_STORAGE_KEY = 'finance-journal-entries';
const ACCOUNTING_PERIODS_STORAGE_KEY = 'finance-accounting-periods';

// ==================== GESTION DES ÉCRITURES ====================

/**
 * Récupère toutes les écritures comptables
 */
export function getJournalEntries(): JournalEntry[] {
  if (!isSupabaseConfigured()) {
    // Mode offline: localStorage uniquement
    const data = localStorage.getItem(JOURNAL_ENTRIES_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  }

  // Mode online: synchroniser depuis Supabase
  const data = localStorage.getItem(JOURNAL_ENTRIES_STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

/**
 * Sauvegarde et synchronise les écritures
 */
function saveJournalEntries(entries: JournalEntry[]): void {
  localStorage.setItem(JOURNAL_ENTRIES_STORAGE_KEY, JSON.stringify(entries));
  syncSetDoc(TABLES.transactions, {
    id: JOURNAL_ENTRIES_STORAGE_KEY,
    data: entries,
  });
}

/**
 * Crée une nouvelle écriture comptable
 * Valide automatiquement: équilibre, codes compte existants, période ouverte
 */
export function createJournalEntry(
  journalType: string,
  accountingPeriod: string,
  lines: JournalLine[],
  description: string,
  departmentId: string,
  createdBy: string,
  referenceDocument?: string
): { success: boolean; entryId?: string; error?: string } {
  // ========== VALIDATIONS ==========

  // 1. Vérifier qu'il y a au moins 2 lignes (débit + crédit)
  if (lines.length < 2) {
    return {
      success: false,
      error: 'Une écriture comptable doit avoir au moins 2 lignes',
    };
  }

  // 2. Vérifier équilibre débits/crédits
  if (!isJournalLineBalanced(lines)) {
    const totalDebits = lines
      .filter((l) => l.side === 'D')
      .reduce((sum, l) => sum + l.amount, 0);
    const totalCredits = lines
      .filter((l) => l.side === 'C')
      .reduce((sum, l) => sum + l.amount, 0);
    return {
      success: false,
      error: `Écriture non équilibrée. Débits: ${totalDebits} ≠ Crédits: ${totalCredits}`,
    };
  }

  // 3. Vérifier que tous les comptes existent
  for (const line of lines) {
    const account = getAccount(line.accountCode);
    if (!account) {
      return {
        success: false,
        error: `Compte ${line.accountCode} inexistant`,
      };
    }
    if (account.isClosed) {
      return {
        success: false,
        error: `Compte ${line.accountCode} fermé (${account.label})`,
      };
    }
  }

  // 4. Vérifier que la période est ouverte
  const period = getAccountingPeriod(accountingPeriod);
  if (!period || period.status !== 'open') {
    return {
      success: false,
      error: `Période ${accountingPeriod} non ouverte ou inexistante`,
    };
  }

  // ========== CRÉATION DE L'ÉCRITURE ==========

  const entries = getJournalEntries();

  // Générer numéro séquentiel dans le journal
  const journalPrefix = `${journalType}/${accountingPeriod}`;
  const sameJournal = entries.filter((e) => e.journalNumber.startsWith(journalPrefix));
  const nextSeq = sameJournal.length + 1;
  const journalNumber = `${journalPrefix}/${String(nextSeq).padStart(4, '0')}`;

  const newEntry: JournalEntry = {
    id: crypto.randomUUID(),
    journalType: journalType as any,
    journalNumber,
    entryDate: new Date().toISOString().split('T')[0],
    accountingPeriod,
    description,
    departmentId,
    lines,
    createdBy,
    createdAt: new Date().toISOString(),
    status: 'draft',
    referenceDocument,
    isReversalEntry: false,
  };

  entries.push(newEntry);
  saveJournalEntries(entries);

  return {
    success: true,
    entryId: newEntry.id,
  };
}

/**
 * Valide une écriture (passe de brouillon à validée)
 * Une fois validée, elle ne peut être modifiée que par annulation/extourne
 */
export function validateJournalEntry(
  entryId: string,
  validatedBy: string
): { success: boolean; error?: string } {
  const entries = getJournalEntries();
  const entry = entries.find((e) => e.id === entryId);

  if (!entry) {
    return { success: false, error: 'Écriture introuvable' };
  }

  if (entry.status !== 'draft') {
    return {
      success: false,
      error: `Écriture ne peut être validée (statut: ${entry.status})`,
    };
  }

  entry.status = 'validated';
  saveJournalEntries(entries);

  return { success: true };
}

/**
 * Récupère les écritures d'une période
 */
export function getEntriesByPeriod(period: string): JournalEntry[] {
  return getJournalEntries().filter((e) => e.accountingPeriod === period);
}

/**
 * Récupère les écritures d'un journal spécifique
 */
export function getEntriesByJournal(journalType: string): JournalEntry[] {
  return getJournalEntries().filter((e) => e.journalType === journalType);
}

// ==================== GESTION DES PÉRIODES COMPTABLES ====================

/**
 * Récupère toutes les périodes comptables
 */
export function getAccountingPeriods(): AccountingPeriod[] {
  const data = localStorage.getItem(ACCOUNTING_PERIODS_STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

/**
 * Sauvegarde les périodes
 */
function saveAccountingPeriods(periods: AccountingPeriod[]): void {
  localStorage.setItem(ACCOUNTING_PERIODS_STORAGE_KEY, JSON.stringify(periods));
  syncSetDoc(TABLES.transactions, {
    id: ACCOUNTING_PERIODS_STORAGE_KEY,
    data: periods,
  });
}

/**
 * Crée une nouvelle période comptable (ex: "2026-01" pour janvier 2026)
 */
export function createAccountingPeriod(
  period: string // Format YYYY-MM
): { success: boolean; error?: string } {
  // Valider format
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return {
      success: false,
      error: 'Format période invalide (attendu: YYYY-MM)',
    };
  }

  const periods = getAccountingPeriods();
  if (periods.some((p) => p.period === period)) {
    return { success: false, error: `Période ${period} existe déjà` };
  }

  const newPeriod: AccountingPeriod = {
    period,
    status: 'open',
    openedAt: new Date().toISOString(),
  };

  periods.push(newPeriod);
  saveAccountingPeriods(periods);

  return { success: true };
}

/**
 * Récupère une période par code
 */
export function getAccountingPeriod(period: string): AccountingPeriod | undefined {
  return getAccountingPeriods().find((p) => p.period === period);
}

/**
 * Ferme une période comptable
 * Génère la balance, archive les écritures, empêche nouvelles écritures
 */
export function closeAccountingPeriod(
  period: string,
  reason: string
): { success: boolean; error?: string } {
  const periods = getAccountingPeriods();
  const idx = periods.findIndex((p) => p.period === period);

  if (idx === -1) {
    return { success: false, error: `Période ${period} introuvable` };
  }

  if (periods[idx].status !== 'open') {
    return {
      success: false,
      error: `Période ne peut être fermée (statut: ${periods[idx].status})`,
    };
  }

  periods[idx].status = 'closed';
  periods[idx].closedAt = new Date().toISOString();
  periods[idx].closureReason = reason;

  saveAccountingPeriods(periods);

  return { success: true };
}

// ==================== ÉTATS COMPTABLES DE BASE ====================

export interface BalanceRow {
  accountCode: string;
  accountLabel: string;
  debits: number;
  credits: number;
  balance: number;
}

/**
 * Génère la balance générale (ou balance par période)
 * Utile pour vérification équilibre comptable (total débits = total crédits)
 */
export function generateTrialBalance(
  periodFilter?: string
): { rows: BalanceRow[]; totalDebits: number; totalCredits: number } {
  const entries = periodFilter
    ? getEntriesByPeriod(periodFilter)
    : getJournalEntries();

  const accountMap = new Map<string, { debits: number; credits: number }>();

  // Accumuler débits/crédits par compte
  for (const entry of entries) {
    if (entry.status !== 'validated') continue; // Ignorer les brouillons
    for (const line of entry.lines) {
      if (!accountMap.has(line.accountCode)) {
        accountMap.set(line.accountCode, { debits: 0, credits: 0 });
      }
      const acc = accountMap.get(line.accountCode)!;
      if (line.side === 'D') {
        acc.debits += line.amount;
      } else {
        acc.credits += line.amount;
      }
    }
  }

  // Construire les lignes
  const rows: BalanceRow[] = Array.from(accountMap.entries())
    .map(([code, { debits, credits }]) => {
      const account = getAccount(code);
      const balance =
        account?.accountType === 'A'
          ? debits - credits
          : credits - debits;

      return {
        accountCode: code,
        accountLabel: account?.label || 'Compte inconnu',
        debits,
        credits,
        balance,
      };
    })
    .filter((row) => row.debits > 0 || row.credits > 0)
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  const totalDebits = rows.reduce((sum, r) => sum + r.debits, 0);
  const totalCredits = rows.reduce((sum, r) => sum + r.credits, 0);

  return {
    rows,
    totalDebits,
    totalCredits,
  };
}

/**
 * Récupère le grand livre simplifié pour un compte
 */
export interface GeneralLedgerLine {
  entryDate: string;
  journalNumber: string;
  description: string;
  debit?: number;
  credit?: number;
  balance: number;
}

export function getGeneralLedger(accountCode: string): GeneralLedgerLine[] {
  const entries = getJournalEntries().filter((e) => e.status === 'validated');
  const accountLines = entries
    .flatMap((entry) =>
      entry.lines
        .filter((line) => line.accountCode === accountCode)
        .map((line) => ({
          entryDate: entry.entryDate,
          journalNumber: entry.journalNumber,
          description: entry.description,
          debit: line.side === 'D' ? line.amount : undefined,
          credit: line.side === 'C' ? line.amount : undefined,
        }))
    )
    .sort(
      (a, b) =>
        new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime()
    );

  // Calculer soldes cumulatifs
  const account = getAccount(accountCode);
  let balance = 0;

  return accountLines.map((line) => {
    if (line.debit) balance += line.debit;
    if (line.credit) balance -= line.credit;

    if (account?.accountType === 'P' || account?.accountType === 'R') {
      balance = -balance;
    }

    return {
      ...line,
      balance,
    };
  });
}

/**
 * Export structure pour rapport balance générale
 */
export interface BalanceReportData {
  period: string;
  asOf: string;
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
  rows: BalanceRow[];
}

/**
 * Génère un rapport balance générale prêt pour export PDF/Excel
 */
export function generateBalanceReport(period: string): BalanceReportData {
  const { rows, totalDebits, totalCredits } = generateTrialBalance(period);

  return {
    period,
    asOf: new Date().toISOString().split('T')[0],
    totalDebits,
    totalCredits,
    isBalanced: Math.abs(totalDebits - totalCredits) < 0.01,
    rows,
  };
}

/**
 * Récupère les écritures d'un département
 */
export function getEntriesByDepartment(departmentId: string): JournalEntry[] {
  return getJournalEntries().filter((e) => e.departmentId === departmentId);
}

/**
 * Génère les écritures d'extourne (inverse une écriture validée)
 * Utile pour corriger une écriture erreur
 */
export function createReversalEntry(
  originalEntryId: string,
  createdBy: string,
  reason: string
): { success: boolean; reversalEntryId?: string; error?: string } {
  const entries = getJournalEntries();
  const original = entries.find((e) => e.id === originalEntryId);

  if (!original) {
    return { success: false, error: 'Écriture originale introuvable' };
  }

  if (original.status !== 'validated') {
    return {
      success: false,
      error: 'Seules les écritures validées peuvent être extournées',
    };
  }

  // Inverser les débits/crédits
  const reversedLines: JournalLine[] = original.lines.map((line) => ({
    ...line,
    side: line.side === 'D' ? 'C' : 'D',
  }));

  const result = createJournalEntry(
    original.journalType,
    original.accountingPeriod,
    reversedLines,
    `EXTOURNE - ${reason}. Ref: ${original.journalNumber}`,
    original.departmentId,
    createdBy
  );

  if (result.success && result.entryId) {
    // Marquer l'original comme étourné (relire le tableau actualisé)
    const updatedEntries = getJournalEntries();
    const entryIdx = updatedEntries.findIndex((e) => e.id === originalEntryId);
    if (entryIdx !== -1) {
      updatedEntries[entryIdx].isReversalEntry = true;
      saveJournalEntries(updatedEntries);
    }

    return {
      success: true,
      reversalEntryId: result.entryId,
    };
  }

  return {
    success: false,
    error: result.error,
  };
}

export default {
  getJournalEntries,
  createJournalEntry,
  validateJournalEntry,
  getAccountingPeriods,
  createAccountingPeriod,
  closeAccountingPeriod,
  generateTrialBalance,
  generateBalanceReport,
  getGeneralLedger,
  createReversalEntry,
};
