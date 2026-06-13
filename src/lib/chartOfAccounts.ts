/**
 * ==================== PLAN COMPTABLE OHADA ====================
 * 
 * Structure conforme à la norme SYSCOHADA (Cameroun, Afrique de l'Ouest/Centrale)
 * Niveaux: Classe (1 chiffre) -> Groupe (2e chiffre) -> Compte (3e chiffre) -> Sous-compte (4e chiffre optionnel)
 * 
 * Exemple: 411 = Classe 4 (Tiers), Groupe 1 (Clients), Compte 1 (Clients ordinaires)
 *          4111 = Sous-compte Client GABA
 * 
 * Structure du groupe Guims:
 * - GABA: élevage, intrants, formations
 * - Guims Educ: cours répétition, coaching scolaire
 * - Guims Academy: formations professionnelles
 * - DigitBoosterPlus: création sites, digital services
 * - Direction Générale: charges communes, coordination générale
 */

// ==================== TYPES ET INTERFACES ====================

export type AccountClass = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
export type JournalType = 'AC' | 'VE' | 'AC' | 'OD' | 'TR' | 'AN';

export interface ChartAccount {
  /** Code compte (ex: 101, 411, 706) */
  code: string;
  /** Libellé court (max 50 chars) */
  label: string;
  /** Description plus détaillée */
  description?: string;
  /** Classe comptable (1=Capitaux, 2=Immobilisations, 3=Stocks, etc.) */
  accountClass: AccountClass;
  /** Type de compte: A=Actif, P=Passif, R=Résultat */
  accountType: 'A' | 'P' | 'R';
  /** true = compte contrôle (ex: TVA collectée), false = compte normal */
  isControlAccount?: boolean;
  /** Départements autorisés à utiliser ce compte (null = tous) */
  departmentIds?: string[];
  /** true = compte fermé (ne peut plus recevoir d'écritures) */
  isClosed?: boolean;
}

export interface JournalEntry {
  /** UUID unique */
  id: string;
  /** Journal (AC=Achat, VE=Vente, AC=Caisse, TR=Trésorerie, OD=Opérations Diverses, AN=Analytique) */
  journalType: JournalType;
  /** Numéro séquentiel dans le journal (ex: AC/2026/001) */
  journalNumber: string;
  /** Date comptable */
  entryDate: string;
  /** Période comptable (YYYY-MM) */
  accountingPeriod: string;
  /** Description de l'écriture */
  description: string;
  /** Département source */
  departmentId: string;
  /** Écritures (débits et crédits) */
  lines: JournalLine[];
  /** Utilisateur qui a saisi */
  createdBy: string;
  /** Horodatage */
  createdAt: string;
  /** État: brouillon, valide, lettré, clôturé */
  status: 'draft' | 'validated' | 'matched' | 'closed';
  /** Pièce justificative référence (facture, bulletin de paie, etc.) */
  referenceDocument?: string;
  /** Vrai = écriture d'extourne (OD) */
  isReversalEntry?: boolean;
}

export interface JournalLine {
  /** Compte comptable débité/crédité */
  accountCode: string;
  /** Montant (positif) */
  amount: number;
  /** 'D' = Débit, 'C' = Crédit */
  side: 'D' | 'C';
  /** Texte libre optionnel */
  description?: string;
  /** Tiers (client, fournisseur, salarié) si applicable */
  tiers?: string;
  /** Référence analytique (centre de coûts, etc.) */
  analyticalRef?: string;
}

export interface AccountingPeriod {
  /** YYYY-MM */
  period: string;
  /** État: open, closed, archived */
  status: 'open' | 'closed' | 'archived';
  /** Date ouverture */
  openedAt: string;
  /** Date fermeture (si clôturé) */
  closedAt?: string;
  /** Raison fermeture */
  closureReason?: string;
  /** Solde avant clôture */
  openingBalance?: number;
}

// ==================== PLAN COMPTABLE COMPLET ====================

export const chartOfAccounts: ChartAccount[] = [
  // ========== CLASSE 1: CAPITAUX PROPRES (Actif passif) ==========
  {
    code: '101',
    label: 'Capital social',
    description: 'Apports en capital des associés',
    accountClass: '1',
    accountType: 'P',
  },
  {
    code: '106',
    label: 'Réserves',
    description: 'Résultats mis en réserve (légale, libre)',
    accountClass: '1',
    accountType: 'P',
  },
  {
    code: '120',
    label: 'Résultats nets des exercices antérieurs',
    description: 'Profits et pertes des années précédentes',
    accountClass: '1',
    accountType: 'P',
  },
  {
    code: '121',
    label: 'Résultat net de l\'exercice',
    description: 'Bénéfice ou perte de l\'année en cours',
    accountClass: '1',
    accountType: 'P',
  },

  // ========== CLASSE 2: IMMOBILISATIONS ==========
  {
    code: '211',
    label: 'Terrains et constructions',
    description: 'Immeubles, bâtiments, terrains',
    accountClass: '2',
    accountType: 'A',
  },
  {
    code: '214',
    label: 'Matériel et outillage',
    description: 'Machines, équipements professionnels',
    accountClass: '2',
    accountType: 'A',
  },
  {
    code: '215',
    label: 'Mobilier de bureau et aménagements',
    description: 'Bureaux, chaises, armoires, agencements',
    accountClass: '2',
    accountType: 'A',
  },
  {
    code: '218',
    label: 'Autres immobilisations corporelles',
    description: 'Véhicules, informatique, etc.',
    accountClass: '2',
    accountType: 'A',
  },
  {
    code: '221',
    label: 'Brevets, licences, droits d\'auteur',
    description: 'Frais d\'établissement, logiciels achetés',
    accountClass: '2',
    accountType: 'A',
  },
  {
    code: '281',
    label: 'Amortissement des immobilisations',
    description: 'Cumul des amortissements (compte contrepartie)',
    accountClass: '2',
    accountType: 'A',
    isControlAccount: true,
  },

  // ========== CLASSE 3: STOCKS ==========
  {
    code: '301',
    label: 'Matières premières et fournitures',
    description: 'Intrants, matières premières (GABA)',
    accountClass: '3',
    accountType: 'A',
  },
  {
    code: '302',
    label: 'Produits en cours de fabrication',
    description: 'Stock intermédiaire en production',
    accountClass: '3',
    accountType: 'A',
  },
  {
    code: '303',
    label: 'Produits finis',
    description: 'Produits finis prêts à vendre',
    accountClass: '3',
    accountType: 'A',
  },
  {
    code: '310',
    label: 'Marchandises',
    description: 'Stocks à revendre (petit équipement, kits, livres)',
    accountClass: '3',
    accountType: 'A',
  },
  {
    code: '390',
    label: 'Variation de stocks',
    description: 'Ajustement fin d\'exercice (mouvements à date)',
    accountClass: '3',
    accountType: 'R',
  },

  // ========== CLASSE 4: TIERS (Clients, Fournisseurs) ==========
  {
    code: '411',
    label: 'Clients ordinaires',
    description: 'Clients nationaux',
    accountClass: '4',
    accountType: 'A',
  },
  {
    code: '4111',
    label: 'Clients - GABA',
    description: 'Clients facturés par département GABA',
    accountClass: '4',
    accountType: 'A',
    departmentIds: ['gaba'],
  },
  {
    code: '4112',
    label: 'Clients - Guims Educ',
    description: 'Clients facturés par Guims Educ',
    accountClass: '4',
    accountType: 'A',
    departmentIds: ['guims-educ'],
  },
  {
    code: '4113',
    label: 'Clients - Guims Academy',
    description: 'Clients facturés par Guims Academy',
    accountClass: '4',
    accountType: 'A',
    departmentIds: ['guims-academy'],
  },
  {
    code: '4114',
    label: 'Clients - DigitBoosterPlus',
    description: 'Clients facturés par DigitBoosterPlus',
    accountClass: '4',
    accountType: 'A',
    departmentIds: ['digitboosterplus'],
  },
  {
    code: '416',
    label: 'Clients douteux',
    description: 'Créances à faible probabilité de recouvrement',
    accountClass: '4',
    accountType: 'A',
  },
  {
    code: '4170',
    label: 'Provision clients douteux',
    description: 'Provision pour dépréciation (compte contrepartie)',
    accountClass: '4',
    accountType: 'A',
    isControlAccount: true,
  },

  {
    code: '401',
    label: 'Fournisseurs ordinaires',
    description: 'Fournisseurs pour achats intrants, équipement, services',
    accountClass: '4',
    accountType: 'P',
  },
  {
    code: '4011',
    label: 'Fournisseurs - GABA',
    description: 'Fournisseurs d\'intrants et géniteurs',
    accountClass: '4',
    accountType: 'P',
    departmentIds: ['gaba'],
  },
  {
    code: '4012',
    label: 'Fournisseurs - Logistique & Support',
    description: 'Fournisseurs communs (location, transport, services)',
    accountClass: '4',
    accountType: 'P',
  },

  {
    code: '421',
    label: 'Personnel - Salaires et traitements dus',
    description: 'Dettes envers salariés',
    accountClass: '4',
    accountType: 'P',
  },
  {
    code: '422',
    label: 'Retenues sur salaires',
    description: 'Cotisations, impôts à reverser (compte contrepartie)',
    accountClass: '4',
    accountType: 'P',
    isControlAccount: true,
  },

  {
    code: '431',
    label: 'Organismes sociaux',
    description: 'CNPS, mutuelles, cotisations patronales',
    accountClass: '4',
    accountType: 'P',
  },
  {
    code: '432',
    label: 'État - Impôts et taxes dues',
    description: 'TVA, impôt sur bénéfice, taxe professionnelle',
    accountClass: '4',
    accountType: 'P',
  },

  // ========== CLASSE 5: COMPTES FINANCIERS ==========
  {
    code: '501',
    label: 'Caisse espèces',
    description: 'Liquidités en main',
    accountClass: '5',
    accountType: 'A',
  },
  {
    code: '5011',
    label: 'Caisse espèces - GABA',
    description: 'Liquidités GABA',
    accountClass: '5',
    accountType: 'A',
    departmentIds: ['gaba'],
  },
  {
    code: '5012',
    label: 'Caisse espèces - Guims Educ',
    description: 'Liquidités Guims Educ',
    accountClass: '5',
    accountType: 'A',
    departmentIds: ['guims-educ'],
  },
  {
    code: '5013',
    label: 'Caisse espèces - Guims Academy',
    description: 'Liquidités Guims Academy',
    accountClass: '5',
    accountType: 'A',
    departmentIds: ['guims-academy'],
  },
  {
    code: '5014',
    label: 'Caisse espèces - DigitBoosterPlus',
    description: 'Liquidités DigitBoosterPlus',
    accountClass: '5',
    accountType: 'A',
    departmentIds: ['digitboosterplus'],
  },

  {
    code: '511',
    label: 'Comptes courants bancaires',
    description: 'Dépôts à vue (compte chèque)',
    accountClass: '5',
    accountType: 'A',
  },
  {
    code: '5111',
    label: 'Compte courant - GABA',
    description: 'Compte chèque GABA',
    accountClass: '5',
    accountType: 'A',
    departmentIds: ['gaba'],
  },
  {
    code: '5112',
    label: 'Compte courant - Guims Group',
    description: 'Compte chèque principal groupe',
    accountClass: '5',
    accountType: 'A',
  },

  {
    code: '521',
    label: 'Comptes d\'épargne et placements',
    description: 'Comptes à terme, livrets, placements court terme',
    accountClass: '5',
    accountType: 'A',
  },

  {
    code: '525',
    label: 'Virements internes entre caisses',
    description: 'Mouvements de trésorerie entre caisses (équilibrage)',
    accountClass: '5',
    accountType: 'A',
  },

  {
    code: '531',
    label: 'Valeurs mobilières de placement',
    description: 'Actions, parts de fonds, obligations',
    accountClass: '5',
    accountType: 'A',
  },

  {
    code: '581',
    label: 'Créances sur tiers (avances, prêts)',
    description: 'Prêts accordés, avances à fournisseurs, avances salaires',
    accountClass: '5',
    accountType: 'A',
  },

  {
    code: '591',
    label: 'Dettes envers établissements de crédit',
    description: 'Emprunts bancaires, découverts, crédits',
    accountClass: '5',
    accountType: 'P',
  },

  // ========== CLASSE 6: CHARGES ==========
  {
    code: '601',
    label: 'Achats de matières premières et fournitures',
    description: 'Intrants, génétique, matières premières',
    accountClass: '6',
    accountType: 'R',
    departmentIds: ['gaba'],
  },
  {
    code: '602',
    label: 'Achats de marchandises et biens de consommation',
    description: 'Stocks achetés pour revente (kits, livres, équipement)',
    accountClass: '6',
    accountType: 'R',
  },
  {
    code: '603',
    label: 'Variation de stocks (achats)',
    description: 'Ajustement stocks début/fin période',
    accountClass: '6',
    accountType: 'R',
  },

  {
    code: '611',
    label: 'Sous-traitance et services extérieurs de production',
    description: 'Coûts de transport production, prestataires spécialisés',
    accountClass: '6',
    accountType: 'R',
  },
  {
    code: '612',
    label: 'Fournitures et services extérieurs (fonctionnement)',
    description: 'Électricité, eau, combustible, carburant, loyer locaux',
    accountClass: '6',
    accountType: 'R',
  },
  {
    code: '621',
    label: 'Redevances et droit d\'usage',
    description: 'Licences, hébergement web, logiciels, abonnements',
    accountClass: '6',
    accountType: 'R',
  },

  {
    code: '641',
    label: 'Rémunération des salariés - Salaires et traitements',
    description: 'Paie brute, primes',
    accountClass: '6',
    accountType: 'R',
  },
  {
    code: '642',
    label: 'Rémunération des salariés - Cotisations patronales sociales',
    description: 'CNPS, mutuelles, assurances collectives',
    accountClass: '6',
    accountType: 'R',
  },
  {
    code: '643',
    label: 'Rémunération des salariés - Avantages extra-légaux',
    description: 'Tickets restaurant, transport, formation personnelle',
    accountClass: '6',
    accountType: 'R',
  },

  {
    code: '651',
    label: 'Autres charges externes',
    description: 'Déplacements, missions, communications, fournitures bureau',
    accountClass: '6',
    accountType: 'R',
  },

  {
    code: '661',
    label: 'Impôts et taxes',
    description: 'Taxe professionnelle, patentes, permis',
    accountClass: '6',
    accountType: 'R',
  },
  {
    code: '6615',
    label: 'TVA déductible',
    description: 'TVA sur achats (compte de gestion)',
    accountClass: '6',
    accountType: 'R',
    isControlAccount: true,
  },

  {
    code: '681',
    label: 'Amortissements et provisions - Dotations',
    description: 'Charge de dépréciation immobilisations et créances',
    accountClass: '6',
    accountType: 'R',
  },

  {
    code: '691',
    label: 'Charges financières',
    description: 'Intérêts bancaires, frais de banque',
    accountClass: '6',
    accountType: 'R',
  },

  {
    code: '698',
    label: 'Autres charges',
    description: 'Dons, pénalités, pertes exceptionnelles',
    accountClass: '6',
    accountType: 'R',
  },

  // ========== CLASSE 7: PRODUITS / REVENUS ==========
  {
    code: '701',
    label: 'Ventes de produits finis - GABA',
    description: 'Revenus de vente intrants, géniteurs, produits d\'élevage',
    accountClass: '7',
    accountType: 'R',
    departmentIds: ['gaba'],
  },
  {
    code: '702',
    label: 'Ventes de marchandises - DigitBoosterPlus',
    description: 'Revenus sites web, boosts, publications Facebook',
    accountClass: '7',
    accountType: 'R',
    departmentIds: ['digitboosterplus'],
  },

  {
    code: '703',
    label: 'Variation de stocks (ventes)',
    description: 'Ajustement stocks produits finis',
    accountClass: '7',
    accountType: 'R',
  },

  {
    code: '711',
    label: 'Prestations de services - Guims Educ',
    description: 'Revenus cours répétition, coaching scolaire',
    accountClass: '7',
    accountType: 'R',
    departmentIds: ['guims-educ'],
  },
  {
    code: '712',
    label: 'Prestations de services - Guims Academy',
    description: 'Revenus formations professionnelles',
    accountClass: '7',
    accountType: 'R',
    departmentIds: ['guims-academy'],
  },
  {
    code: '713',
    label: 'Prestations de services - DigitBoosterPlus',
    description: 'Revenus community management, boosts digitaux',
    accountClass: '7',
    accountType: 'R',
    departmentIds: ['digitboosterplus'],
  },

  {
    code: '721',
    label: 'Redevances, droits d\'usage reçus',
    description: 'Revenus de licences, royalties',
    accountClass: '7',
    accountType: 'R',
  },

  {
    code: '731',
    label: 'Revenus des immeubles',
    description: 'Loyers reçus (si immeubles loués)',
    accountClass: '7',
    accountType: 'R',
  },

  {
    code: '741',
    label: 'Intérêts et revenus financiers',
    description: 'Intérêts bancaires, dividendes, gains de change',
    accountClass: '7',
    accountType: 'R',
  },

  {
    code: '751',
    label: 'Revenus accessoires et apports',
    description: 'Apports externes, subventions, remboursements, dons',
    accountClass: '7',
    accountType: 'R',
  },

  {
    code: '754',
    label: 'TVA collectée',
    description: 'TVA à reverser à l\'État (compte de gestion)',
    accountClass: '7',
    accountType: 'R',
    isControlAccount: true,
  },

  {
    code: '791',
    label: 'Autres revenus',
    description: 'Gains exceptionnels, plus-values',
    accountClass: '7',
    accountType: 'R',
  },

  // ========== CLASSE 8: COMPTES DE GESTION ANALYTIQUE / RÉSULTATS ==========
  {
    code: '801',
    label: 'Charges par centre de coûts',
    description: 'Allocation analytique des charges (GABA, EdSup, etc.)',
    accountClass: '8',
    accountType: 'R',
  },
  {
    code: '901',
    label: 'Comptes analytiques - Centre coûts GABA',
    description: 'Suivi analytique GABA',
    accountClass: '9',
    accountType: 'R',
    departmentIds: ['gaba'],
  },
  {
    code: '902',
    label: 'Comptes analytiques - Centre coûts Guims Educ',
    description: 'Suivi analytique Guims Educ',
    accountClass: '9',
    accountType: 'R',
    departmentIds: ['guims-educ'],
  },
  {
    code: '903',
    label: 'Comptes analytiques - Centre coûts Guims Academy',
    description: 'Suivi analytique Guims Academy',
    accountClass: '9',
    accountType: 'R',
    departmentIds: ['guims-academy'],
  },
  {
    code: '904',
    label: 'Comptes analytiques - Centre coûts DigitBoosterPlus',
    description: 'Suivi analytique DigitBoosterPlus',
    accountClass: '9',
    accountType: 'R',
    departmentIds: ['digitboosterplus'],
  },
];

// ==================== JOURNAUX COMPTABLES ==========

export const journals: Record<
  JournalType,
  { code: JournalType; label: string; description: string }
> = {
  AC: {
    code: 'AC',
    label: 'Achat',
    description: 'Journal des achats de matières, marchandises, services',
  },
  VE: {
    code: 'VE',
    label: 'Ventes',
    description: 'Journal des ventes et prestations',
  },
  TR: {
    code: 'TR',
    label: 'Trésorerie',
    description: 'Mouvements de caisse et banque (espèces, virements, chèques)',
  },
  OD: {
    code: 'OD',
    label: 'Opérations Diverses',
    description: 'Écritures de régularisation, amortissements, provisions, extournes',
  },
  AN: {
    code: 'AN',
    label: 'Analytique',
    description: 'Écritures d\'allocation analytique par centre de coûts',
  },
};

// ==================== HELPERS COMPTABLES ==========

/**
 * Récupère un compte par son code
 */
export function getAccount(code: string): ChartAccount | undefined {
  return chartOfAccounts.find((acc) => acc.code === code);
}

/**
 * Filtre les comptes par classe
 */
export function getAccountsByClass(accountClass: AccountClass): ChartAccount[] {
  return chartOfAccounts.filter((acc) => acc.accountClass === accountClass);
}

/**
 * Récupère tous les comptes pour un département
 */
export function getAccountsForDepartment(departmentId: string): ChartAccount[] {
  return chartOfAccounts.filter(
    (acc) => !acc.departmentIds || acc.departmentIds.includes(departmentId)
  );
}

/**
 * Valide qu'un montant de journal line est équilibré (somme débits = somme crédits)
 */
export function isJournalLineBalanced(lines: JournalLine[]): boolean {
  const totalDebits = lines
    .filter((l) => l.side === 'D')
    .reduce((sum, l) => sum + l.amount, 0);
  const totalCredits = lines
    .filter((l) => l.side === 'C')
    .reduce((sum, l) => sum + l.amount, 0);
  return Math.abs(totalDebits - totalCredits) < 0.01; // tolérance arrondi
}

/**
 * Calcule le solde d'un compte (débits - crédits, pour compte Actif)
 */
export function calculateAccountBalance(
  lines: JournalLine[],
  accountCode: string,
  accountType: 'A' | 'P' | 'R'
): number {
  const accountLines = lines.filter((l) => l.accountCode === accountCode);
  const debits = accountLines
    .filter((l) => l.side === 'D')
    .reduce((sum, l) => sum + l.amount, 0);
  const credits = accountLines
    .filter((l) => l.side === 'C')
    .reduce((sum, l) => sum + l.amount, 0);

  // Pour compte Actif: Débit positif, Crédit négatif
  // Pour compte Passif/Résultat: inverse
  if (accountType === 'A') {
    return debits - credits;
  } else {
    return credits - debits;
  }
}

/**
 * Retourne le compte correspondant à un type de transaction existant (liaison progressive)
 * Permet d'intégrer progressivement le plan comptable aux transactions existantes
 */
export function mapTransactionCategoryToAccount(
  type: 'income' | 'expense',
  category: string,
  departmentId: string
): string | null {
  const categoryNorm = category.toLowerCase().trim();

  // Mappings pour revenus
  if (type === 'income') {
    if (departmentId === 'gaba' && categoryNorm.includes('vente')) return '701'; // Ventes GABA
    if (departmentId === 'guims-educ' && categoryNorm.includes('inscription'))
      return '711'; // Services Guims Educ
    if (departmentId === 'guims-academy' && categoryNorm.includes('inscription'))
      return '712'; // Services Guims Academy
    if (departmentId === 'digitboosterplus') return '702'; // Services DigitBoosterPlus
    if (categoryNorm.includes('apport')) return '751'; // Apports
    return '791'; // Autres revenus par défaut
  }

  // Mappings pour dépenses
  if (type === 'expense') {
    if (categoryNorm.includes('achat')) return '602'; // Achats marchandises
    if (categoryNorm.includes('paiement employé') || categoryNorm.includes('salaire'))
      return '641'; // Salaires
    if (categoryNorm.includes('loyer') || categoryNorm.includes('location'))
      return '612'; // Fournitures & services
    if (categoryNorm.includes('transport')) return '651'; // Autres charges externes
    if (categoryNorm.includes('taxe') || categoryNorm.includes('impôt'))
      return '661'; // Impôts & taxes
    return '698'; // Autres charges par défaut
  }

  return null;
}

export default chartOfAccounts;
