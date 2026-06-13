/**
 * ==================== TESTS SOCLE COMPTABLE ====================
 * Tests unitaires pour valider:
 * - Équilibre des écritures
 * - Validations compte/période
 * - Balance générale
 * - Grand livre
 * - Gestion de périodes
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createJournalEntry,
  validateJournalEntry,
  getJournalEntries,
  createAccountingPeriod,
  getAccountingPeriod,
  closeAccountingPeriod,
  generateTrialBalance,
  getGeneralLedger,
  createReversalEntry,
  getEntriesByPeriod,
  getEntriesByJournal,
} from '../lib/accountingEntries';
import { getAccount, mapTransactionCategoryToAccount } from '../lib/chartOfAccounts';

// Nettoyer localStorage avant chaque test
beforeEach(() => {
  localStorage.clear();
  // Initialiser la période de test
  createAccountingPeriod('2026-06');
});

describe('Plan comptable', () => {
  it('devrait retrouver le compte 501 (Caisse espèces)', () => {
    const account = getAccount('501');
    expect(account).toBeDefined();
    expect(account?.label).toBe('Caisse espèces');
    expect(account?.accountClass).toBe('5');
    expect(account?.accountType).toBe('A');
  });

  it('devrait retrouver le compte 701 (Ventes GABA)', () => {
    const account = getAccount('701');
    expect(account?.label).toContain('Ventes de produits finis');
    expect(account?.departmentIds).toContain('gaba');
  });

  it('devrait mapper automatiquement catégorie > compte comptable', () => {
    // Achat intrants GABA
    const accountCode = mapTransactionCategoryToAccount(
      'expense',
      'Achat composants intrants',
      'gaba'
    );
    expect(accountCode).toBe('602'); // Achats marchandises

    // Salaires
    const salaryCode = mapTransactionCategoryToAccount(
      'expense',
      'Paiement employés',
      'charges-entreprise'
    );
    expect(salaryCode).toBe('641'); // Salaires

    // Vente GABA
    const saleCode = mapTransactionCategoryToAccount(
      'income',
      'Vente intrants',
      'gaba'
    );
    expect(saleCode).toBe('701'); // Ventes GABA
  });
});

describe('Gestion des périodes comptables', () => {
  it('devrait créer une période comptable valide', () => {
    const result = createAccountingPeriod('2026-07');
    expect(result.success).toBe(true);

    const period = getAccountingPeriod('2026-07');
    expect(period).toBeDefined();
    expect(period?.status).toBe('open');
  });

  it('devrait rejeter format période invalide', () => {
    const result = createAccountingPeriod('06-2026'); // Mauvais format
    expect(result.success).toBe(false);
    expect(result.error).toContain('Format période invalide');
  });

  it('devrait empêcher création période dupliquée', () => {
    createAccountingPeriod('2026-08');
    const result = createAccountingPeriod('2026-08');
    expect(result.success).toBe(false);
    expect(result.error).toContain('existe déjà');
  });

  it('devrait fermer une période correctement', () => {
    createAccountingPeriod('2026-09');
    const resultClose = closeAccountingPeriod('2026-09', 'Clôture mensuelle');
    expect(resultClose.success).toBe(true);

    const period = getAccountingPeriod('2026-09');
    expect(period?.status).toBe('closed');
    expect(period?.closureReason).toBe('Clôture mensuelle');
  });

  it('devrait empêcher écriture dans période fermée', () => {
    closeAccountingPeriod('2026-06', 'Test');

    const result = createJournalEntry(
      'VE',
      '2026-06',
      [
        { accountCode: '411', side: 'D', amount: 100000 },
        { accountCode: '701', side: 'C', amount: 100000 },
      ],
      'Vente test',
      'gaba',
      'user@test.com'
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('non ouverte');
  });
});

describe('Création et validation écritures comptables', () => {
  it('devrait créer écriture équilibrée (Vente)', () => {
    // Vente: Débit Caisse, Crédit Revenu
    const result = createJournalEntry(
      'VE', // Journal Ventes
      '2026-06',
      [
        { accountCode: '501', side: 'D', amount: 500000, description: 'Espèces reçues' }, // Caisse +
        { accountCode: '701', side: 'C', amount: 500000, description: 'Vente intrants' }, // Revenus +
      ],
      'Vente intrants GABA - 100kg à 5000 FCFA/kg',
      'gaba',
      'vendeur@gaba.com'
    );

    expect(result.success).toBe(true);
    expect(result.entryId).toBeDefined();

    const entries = getJournalEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe('draft');
    expect(entries[0].journalNumber).toBe('VE/2026-06/0001');
  });

  it('devrait créer écriture équilibrée (Achat à crédit)', () => {
    // Achat: Débit Charge, Crédit Fournisseur
    const result = createJournalEntry(
      'AC', // Journal Achat
      '2026-06',
      [
        { accountCode: '602', side: 'D', amount: 250000, description: 'Achat intrants' }, // Charges +
        { accountCode: '401', side: 'C', amount: 250000, description: 'Fournisseur X' }, // Dettes +
      ],
      'Achat géniteurs premium - Facture FNS-2026-001',
      'gaba',
      'acheteur@gaba.com',
      'FNS-2026-001'
    );

    expect(result.success).toBe(true);
    const entries = getJournalEntries();
    expect(entries[0].referenceDocument).toBe('FNS-2026-001');
  });

  it('devrait créer écriture équilibrée (Paie)', () => {
    // Paie: Débit Salaires, Crédit Caisse + Retenues
    const result = createJournalEntry(
      'OD',
      '2026-06',
      [
        { accountCode: '641', side: 'D', amount: 300000, description: 'Salaires mai' }, // Charges salaires
        { accountCode: '501', side: 'C', amount: 270000, description: 'Paiement nets' }, // Caisse sortie
        { accountCode: '422', side: 'C', amount: 30000, description: 'Retenues CNPS' }, // Dettes sociales
      ],
      'Bulletins de paie mai 2026 - 3 salariés',
      'charges-entreprise',
      'rh@guimsgroup.com'
    );

    expect(result.success).toBe(true);
  });

  it('devrait rejeter écriture non équilibrée', () => {
    const result = createJournalEntry(
      'VE',
      '2026-06',
      [
        { accountCode: '501', side: 'D', amount: 500000 }, // Débit 500k
        { accountCode: '701', side: 'C', amount: 400000 }, // Crédit 400k (ERREUR!)
      ],
      'Vente mal équilibrée',
      'gaba',
      'test@test.com'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('non équilibrée');
    expect(result.error).toContain('500000');
    expect(result.error).toContain('400000');
  });

  it('devrait rejeter compte inexistant', () => {
    const result = createJournalEntry(
      'VE',
      '2026-06',
      [
        { accountCode: '999', side: 'D', amount: 100000 }, // Compte inexistant
        { accountCode: '701', side: 'C', amount: 100000 },
      ],
      'Test compte invalide',
      'gaba',
      'test@test.com'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('inexistant');
  });

  it('devrait exiger au minimum 2 lignes', () => {
    const result = createJournalEntry(
      'VE',
      '2026-06',
      [{ accountCode: '501', side: 'D', amount: 100000 }], // Seulement 1 ligne!
      'Test une seule ligne',
      'gaba',
      'test@test.com'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('au moins 2 lignes');
  });

  it('devrait numéroter séquentiellement les écritures', () => {
    createJournalEntry(
      'VE',
      '2026-06',
      [
        { accountCode: '501', side: 'D', amount: 100000 },
        { accountCode: '701', side: 'C', amount: 100000 },
      ],
      'Vente 1',
      'gaba',
      'test@test.com'
    );

    createJournalEntry(
      'VE',
      '2026-06',
      [
        { accountCode: '501', side: 'D', amount: 200000 },
        { accountCode: '701', side: 'C', amount: 200000 },
      ],
      'Vente 2',
      'gaba',
      'test@test.com'
    );

    const entries = getJournalEntries();
    expect(entries[0].journalNumber).toBe('VE/2026-06/0001');
    expect(entries[1].journalNumber).toBe('VE/2026-06/0002');
  });

  it('devrait numéroter par journal (VE et AC séparés)', () => {
    createJournalEntry(
      'VE',
      '2026-06',
      [
        { accountCode: '501', side: 'D', amount: 100000 },
        { accountCode: '701', side: 'C', amount: 100000 },
      ],
      'Vente',
      'gaba',
      'test@test.com'
    );

    createJournalEntry(
      'AC',
      '2026-06',
      [
        { accountCode: '602', side: 'D', amount: 50000 },
        { accountCode: '401', side: 'C', amount: 50000 },
      ],
      'Achat',
      'gaba',
      'test@test.com'
    );

    const entries = getJournalEntries();
    const venteEntries = getEntriesByJournal('VE');
    const achatEntries = getEntriesByJournal('AC');

    expect(venteEntries[0].journalNumber).toBe('VE/2026-06/0001');
    expect(achatEntries[0].journalNumber).toBe('AC/2026-06/0001');
  });
});

describe('Validation des écritures', () => {
  it('devrait valider une écriture brouillon', () => {
    const { entryId } = createJournalEntry(
      'VE',
      '2026-06',
      [
        { accountCode: '501', side: 'D', amount: 100000 },
        { accountCode: '701', side: 'C', amount: 100000 },
      ],
      'Test validation',
      'gaba',
      'test@test.com'
    );

    const result = validateJournalEntry(entryId!, 'controleur@guimsgroup.com');
    expect(result.success).toBe(true);

    const entries = getJournalEntries();
    expect(entries[0].status).toBe('validated');
  });

  it('devrait empêcher re-validation', () => {
    const { entryId } = createJournalEntry(
      'VE',
      '2026-06',
      [
        { accountCode: '501', side: 'D', amount: 100000 },
        { accountCode: '701', side: 'C', amount: 100000 },
      ],
      'Test',
      'gaba',
      'test@test.com'
    );

    validateJournalEntry(entryId!, 'controleur@test.com');
    const result2 = validateJournalEntry(entryId!, 'autre@test.com');

    expect(result2.success).toBe(false);
    expect(result2.error).toContain('ne peut être validée');
  });
});

describe('Balance générale (Trial Balance)', () => {
  it('devrait générer balance équilibrée avec 3 écritures', () => {
    // Vente 500k
    createJournalEntry(
      'VE',
      '2026-06',
      [
        { accountCode: '501', side: 'D', amount: 500000 },
        { accountCode: '701', side: 'C', amount: 500000 },
      ],
      'Vente 1',
      'gaba',
      'test@test.com'
    );

    // Achat 200k
    createJournalEntry(
      'AC',
      '2026-06',
      [
        { accountCode: '602', side: 'D', amount: 200000 },
        { accountCode: '401', side: 'C', amount: 200000 },
      ],
      'Achat 1',
      'gaba',
      'test@test.com'
    );

    // Valider les écritures
    const entries = getJournalEntries();
    entries.forEach((e) => validateJournalEntry(e.id, 'test@test.com'));

    // Générer balance
    const balance = generateTrialBalance('2026-06');

    expect(balance.totalDebits).toBe(700000);
    expect(balance.totalCredits).toBe(700000);
    expect(Math.abs(balance.totalDebits - balance.totalCredits)).toBeLessThan(0.01);

    expect(balance.rows).toHaveLength(4); // 501, 701, 602, 401
  });

  it('devrait calculer soldes de compte correctement (Actif vs Passif)', () => {
    // Écriture avec Actif (Caisse = Débit positif)
    createJournalEntry(
      'VE',
      '2026-06',
      [
        { accountCode: '501', side: 'D', amount: 1000000 }, // Caisse +1M
        { accountCode: '701', side: 'C', amount: 1000000 }, // Revenus +1M
      ],
      'Vente',
      'gaba',
      'test@test.com'
    );

    // Écriture avec Passif (Fournisseur = Crédit positif)
    createJournalEntry(
      'AC',
      '2026-06',
      [
        { accountCode: '602', side: 'D', amount: 300000 }, // Charges +300k
        { accountCode: '401', side: 'C', amount: 300000 }, // Fournisseur +300k (Passif)
      ],
      'Achat',
      'gaba',
      'test@test.com'
    );

    const entries = getJournalEntries();
    entries.forEach((e) => validateJournalEntry(e.id, 'test@test.com'));

    const balance = generateTrialBalance('2026-06');
    const caisse = balance.rows.find((r) => r.accountCode === '501');
    const fournisseur = balance.rows.find((r) => r.accountCode === '401');

    // Caisse: Actif, Débit = 1M, balance = 1M
    expect(caisse?.balance).toBe(1000000);
    // Fournisseur: Passif, Crédit = 300k, balance = 300k (positive pour passif)
    expect(fournisseur?.balance).toBe(300000);
  });

  it('devrait ignorer écritures brouillon dans balance', () => {
    createJournalEntry(
      'VE',
      '2026-06',
      [
        { accountCode: '501', side: 'D', amount: 500000 },
        { accountCode: '701', side: 'C', amount: 500000 },
      ],
      'Vente brouillon',
      'gaba',
      'test@test.com'
    );

    createJournalEntry(
      'VE',
      '2026-06',
      [
        { accountCode: '501', side: 'D', amount: 300000 },
        { accountCode: '701', side: 'C', amount: 300000 },
      ],
      'Vente validée',
      'gaba',
      'test@test.com'
    );

    const entries = getJournalEntries();
    validateJournalEntry(entries[1].id, 'test@test.com'); // Valider seulement 2e

    const balance = generateTrialBalance('2026-06');
    expect(balance.totalDebits).toBe(300000); // Seulement 2e écriture
  });
});

describe('Grand livre (General Ledger)', () => {
  it('devrait afficher solde cumulatif pour un compte', () => {
    createJournalEntry(
      'VE',
      '2026-06',
      [
        { accountCode: '501', side: 'D', amount: 500000 },
        { accountCode: '701', side: 'C', amount: 500000 },
      ],
      'Vente 1',
      'gaba',
      'test@test.com'
    );

    createJournalEntry(
      'VE',
      '2026-06',
      [
        { accountCode: '501', side: 'D', amount: 300000 },
        { accountCode: '701', side: 'C', amount: 300000 },
      ],
      'Vente 2',
      'gaba',
      'test@test.com'
    );

    const entries = getJournalEntries();
    entries.forEach((e) => validateJournalEntry(e.id, 'test@test.com'));

    const ledger = getGeneralLedger('501'); // Caisse

    expect(ledger).toHaveLength(2); // 2 opérations
    expect(ledger[0].debit).toBe(500000);
    expect(ledger[0].balance).toBe(500000);
    expect(ledger[1].debit).toBe(300000);
    expect(ledger[1].balance).toBe(800000); // Cumulatif
  });
});

describe('Extournes (Reversal entries)', () => {
  it('devrait créer écriture inverse correctement', () => {
    // Écriture originale
    const { entryId } = createJournalEntry(
      'VE',
      '2026-06',
      [
        { accountCode: '501', side: 'D', amount: 100000 },
        { accountCode: '701', side: 'C', amount: 100000 },
      ],
      'Vente erreur',
      'gaba',
      'test@test.com'
    );

    validateJournalEntry(entryId!, 'test@test.com');

    // Créer extourne
    const result = createReversalEntry(entryId!, 'superviseur@test.com', 'Vente enregistrée deux fois');

    expect(result.success).toBe(true);
    expect(result.reversalEntryId).toBeDefined();

    const entries = getJournalEntries();
    expect(entries).toHaveLength(2);

    // L'extourne devrait inverser débits/crédits
    const reversal = entries.find((e) => e.id === result.reversalEntryId);
    expect(reversal?.lines[0].side).toBe('C'); // Inverse de D
    expect(reversal?.lines[1].side).toBe('D'); // Inverse de C
    expect(reversal?.description).toContain('EXTOURNE');
  });

  it('devrait empêcher extourne d\'écriture non validée', () => {
    const { entryId } = createJournalEntry(
      'VE',
      '2026-06',
      [
        { accountCode: '501', side: 'D', amount: 100000 },
        { accountCode: '701', side: 'C', amount: 100000 },
      ],
      'Vente brouillon',
      'gaba',
      'test@test.com'
    );

    const result = createReversalEntry(entryId!, 'test@test.com', 'Raison');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Seules les écritures validées');
  });
});

describe('Filtrage écritures', () => {
  it('devrait filtrer écritures par période', () => {
    createAccountingPeriod('2026-07');

    createJournalEntry(
      'VE',
      '2026-06',
      [
        { accountCode: '501', side: 'D', amount: 100000 },
        { accountCode: '701', side: 'C', amount: 100000 },
      ],
      'Vente juin',
      'gaba',
      'test@test.com'
    );

    createJournalEntry(
      'VE',
      '2026-07',
      [
        { accountCode: '501', side: 'D', amount: 200000 },
        { accountCode: '701', side: 'C', amount: 200000 },
      ],
      'Vente juillet',
      'gaba',
      'test@test.com'
    );

    const juin = getEntriesByPeriod('2026-06');
    const juillet = getEntriesByPeriod('2026-07');

    expect(juin).toHaveLength(1);
    expect(juillet).toHaveLength(1);
    expect(juin[0].description).toContain('juin');
    expect(juillet[0].description).toContain('juillet');
  });

  it('devrait filtrer écritures par journal', () => {
    createJournalEntry(
      'VE',
      '2026-06',
      [
        { accountCode: '501', side: 'D', amount: 100000 },
        { accountCode: '701', side: 'C', amount: 100000 },
      ],
      'Vente',
      'gaba',
      'test@test.com'
    );

    createJournalEntry(
      'AC',
      '2026-06',
      [
        { accountCode: '602', side: 'D', amount: 50000 },
        { accountCode: '401', side: 'C', amount: 50000 },
      ],
      'Achat',
      'gaba',
      'test@test.com'
    );

    const ventes = getEntriesByJournal('VE');
    const achats = getEntriesByJournal('AC');

    expect(ventes).toHaveLength(1);
    expect(achats).toHaveLength(1);
  });
});
