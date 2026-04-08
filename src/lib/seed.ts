/**
 * Seed script — populates the app with a test account and realistic demo data
 * across all departments, formations, stock, payment plans, trainings, etc.
 *
 * Call seedAll() once from the browser console or from App.tsx on first run.
 */

import { addTransaction } from './data';
import type { DepartmentId, PaymentMethod } from './data';
import {
  addStockItem,
  addStockMovement,
  addFormationCatalog,
  addPaymentPlan,
  addInstallment,
  addTraining,
  addStockKit,
  updatePlanInscription,
  getStockItems,
  getFormationsCatalog,
  getPaymentPlans,
  getTrainings,
} from './stock';
import { addAuditEntry } from './auth';

// ── Flag to avoid double-seeding ─────────────────────────────
const SEED_FLAG = 'finance-seed-done';

export function isSeedDone(): boolean {
  return localStorage.getItem(SEED_FLAG) === '1';
}

// ── Helper: random date between two dates ────────────────────
function rdate(from: string, to: string): string {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  return new Date(a + Math.random() * (b - a)).toISOString().slice(0, 10);
}

// ── Main seeder ──────────────────────────────────────────────
export async function seedAll(userId: string, username: string) {
  if (isSeedDone()) {
    console.log('[Seed] Already seeded — skipping.');
    return;
  }
  console.log('[Seed] Populating demo data…');

  // ============================================================
  //  1. STOCK ITEMS  (GABA)
  // ============================================================
  const poules = addStockItem({ categoryId: 'geniteurs', name: 'Poules pondeuses', unit: 'pièce', alertThreshold: 5, purchasePrice: 3500, sellingPrice: 5000 });
  const lapins = addStockItem({ categoryId: 'geniteurs', name: 'Lapins reproducteurs', unit: 'pièce', alertThreshold: 3, purchasePrice: 5000, sellingPrice: 8000 });
  const hannetons = addStockItem({ categoryId: 'geniteurs', name: 'Hannetons (géniteurs)', unit: 'pièce', alertThreshold: 10, purchasePrice: 500, sellingPrice: 1500 });
  const aliment = addStockItem({ categoryId: 'intrants', name: 'Aliment pour volaille (sac 25kg)', unit: 'sac', alertThreshold: 5, purchasePrice: 8000, sellingPrice: 10000 });
  const vitamines = addStockItem({ categoryId: 'intrants', name: 'Vitamines & compléments', unit: 'flacon', alertThreshold: 4, purchasePrice: 2500, sellingPrice: 4000 });
  const abreuvoirs = addStockItem({ categoryId: 'equipements', name: 'Abreuvoirs', unit: 'pièce', alertThreshold: 3, purchasePrice: 1500, sellingPrice: 2500 });
  const mangeoires = addStockItem({ categoryId: 'equipements', name: 'Mangeoires', unit: 'pièce', alertThreshold: 3, purchasePrice: 2000, sellingPrice: 3000 });
  const oeufs = addStockItem({ categoryId: 'produits-finis', name: 'Œufs (plateau de 30)', unit: 'plateau', alertThreshold: 2, purchasePrice: 1500, sellingPrice: 2500 });
  const fumier = addStockItem({ categoryId: 'produits-finis', name: 'Fumier (sac)', unit: 'sac', alertThreshold: 5, purchasePrice: 300, sellingPrice: 800 });
  const livre = addStockItem({ categoryId: 'equipements', name: 'Livre de formation GABA', unit: 'pièce', alertThreshold: 5, purchasePrice: 3000, sellingPrice: 5000 });

  // ── Stock movements ──────────────────────────────────────────
  const by = username;
  addStockMovement(poules.id,    'entry', 20,  3500, 'Achat lot initial',           '2026-01-10', by);
  addStockMovement(lapins.id,    'entry', 10,  5000, 'Achat reproducteurs',         '2026-01-12', by);
  addStockMovement(hannetons.id, 'entry', 50,  500,  'Réception élevage',           '2026-01-15', by);
  addStockMovement(aliment.id,   'entry', 15,  8000, 'Approvisionnement mensuel',   '2026-02-01', by);
  addStockMovement(vitamines.id, 'entry', 12,  2500, 'Achat pharmacie vétérinaire', '2026-02-05', by);
  addStockMovement(abreuvoirs.id,'entry', 10,  1500, 'Achat équipements',           '2026-02-10', by);
  addStockMovement(mangeoires.id,'entry', 8,   2000, 'Achat équipements',           '2026-02-10', by);
  addStockMovement(oeufs.id,     'entry', 12,  1500, 'Collecte semaine 1-4',        '2026-02-15', by);
  addStockMovement(fumier.id,    'entry', 20,  300,  'Ramassage mensuel',           '2026-03-01', by);
  addStockMovement(livre.id,     'entry', 20,  3000, 'Impression lot 1',            '2026-01-20', by);

  // Some exits (sales / gifts)
  addStockMovement(poules.id,    'exit',  3,   5000, 'Vente client Kouamé',         '2026-02-20', by);
  addStockMovement(oeufs.id,     'exit',  4,   2500, 'Vente marché local',          '2026-03-05', by);
  addStockMovement(hannetons.id, 'gift',  5,   0,    'Kit démarrage formé Aya',     '2026-03-10', by, 'Parc Abidjan', 'Aya Kouassi');
  addStockMovement(aliment.id,   'exit',  3,   10000,'Vente sacs aliment',          '2026-03-12', by);

  // ============================================================
  //  2. STOCK KIT  (GABA)
  // ============================================================
  const kitStarter = addStockKit({
    name: 'Kit Starter Hanneton',
    description: 'Pack de démarrage pour éleveur de hannetons',
    components: [
      { stockItemId: hannetons.id, quantity: 10 },
      { stockItemId: aliment.id, quantity: 1 },
      { stockItemId: abreuvoirs.id, quantity: 1 },
      { stockItemId: livre.id, quantity: 1 },
    ],
    sellingPrice: 25000,
    createdBy: by,
  });

  // ============================================================
  //  3. FORMATIONS CATALOG
  // ============================================================

  // ── GABA: pack-based formation ──
  const fGaba = addFormationCatalog({
    departmentId: 'gaba',
    name: 'Formation Élevage de Hannetons',
    description: 'Apprenez l\'élevage de hannetons de A à Z : reproduction, alimentation, commercialisation.',
    mode: 'packs',
    packs: [
      {
        id: crypto.randomUUID(),
        name: 'Pack Classique',
        price: 35000,
        advantages: [{ description: 'Formation 3 jours' }, { description: 'Accès groupe WhatsApp' }],
        kitItems: [
          { stockItemId: hannetons.id, label: '10 hannetons géniteurs', quantity: 10, specialPrice: 0, normalPrice: 15000 },
          { stockItemId: livre.id, label: 'Livre de formation', quantity: 1, specialPrice: 0, normalPrice: 5000 },
        ],
      },
      {
        id: crypto.randomUUID(),
        name: 'Pack Gold',
        price: 60000,
        advantages: [{ description: 'Formation 5 jours + suivi 3 mois' }, { description: 'Accès groupe WhatsApp' }, { description: 'Visite de parc offerte' }],
        kitItems: [
          { stockItemId: hannetons.id, label: '20 hannetons géniteurs', quantity: 20, specialPrice: 0, normalPrice: 30000 },
          { stockItemId: aliment.id, label: '2 sacs d\'aliment', quantity: 2, specialPrice: 0, normalPrice: 20000 },
          { stockItemId: abreuvoirs.id, label: '2 abreuvoirs', quantity: 2, specialPrice: 0, normalPrice: 5000 },
          { stockItemId: livre.id, label: 'Livre de formation', quantity: 1, specialPrice: 0, normalPrice: 5000 },
        ],
      },
    ],
    tranches: undefined,
    totalPrice: undefined,
    inscriptionFee: 5000,
    createdBy: by,
  });

  // ── Guims Academy: tranche-based formation ──
  const fAcademy = addFormationCatalog({
    departmentId: 'guims-academy',
    name: 'Formation Marketing Digital',
    description: 'Maîtrisez le marketing digital : réseaux sociaux, publicité en ligne, SEO, création de contenu.',
    mode: 'tranches',
    packs: [],
    tranches: [
      { id: crypto.randomUUID(), name: 'Tranche 1', amount: 25000, deadline: '2026-04-15' },
      { id: crypto.randomUUID(), name: 'Tranche 2', amount: 25000, deadline: '2026-05-15' },
      { id: crypto.randomUUID(), name: 'Tranche 3', amount: 25000, deadline: '2026-06-15' },
    ],
    totalPrice: 75000,
    inscriptionFee: 10000,
    createdBy: by,
  });

  const fAcademy2 = addFormationCatalog({
    departmentId: 'guims-academy',
    name: 'Formation Développement Web',
    description: 'HTML, CSS, JavaScript, React. Devenez développeur web en 3 mois.',
    mode: 'tranches',
    packs: [],
    tranches: [
      { id: crypto.randomUUID(), name: 'Tranche 1', amount: 30000, deadline: '2026-04-30' },
      { id: crypto.randomUUID(), name: 'Tranche 2', amount: 30000, deadline: '2026-05-30' },
    ],
    totalPrice: 60000,
    inscriptionFee: 10000,
    createdBy: by,
  });

  // ── Guims Educ: tranche-based ──
  const fEduc = addFormationCatalog({
    departmentId: 'guims-educ',
    name: 'Prépas Concours ENS',
    description: 'Préparation intensive aux concours de l\'École Normale Supérieure.',
    mode: 'tranches',
    packs: [],
    tranches: [
      { id: crypto.randomUUID(), name: 'Tranche 1', amount: 15000, deadline: '2026-04-20' },
      { id: crypto.randomUUID(), name: 'Tranche 2', amount: 15000, deadline: '2026-05-20' },
    ],
    totalPrice: 30000,
    inscriptionFee: 5000,
    createdBy: by,
  });

  // ============================================================
  //  4. PAYMENT PLANS + INSTALLMENTS
  // ============================================================

  // ── Plan 1: Guims Academy — Marketing Digital — Kouadio Aya ──
  const plan1 = addPaymentPlan({
    departmentId: 'guims-academy',
    clientName: 'Kouadio Aya',
    planType: 'formation',
    label: 'Formation Marketing Digital',
    description: 'Inscription complète avec paiement en 3 tranches',
    totalAmount: 75000,
    scheduledTranches: fAcademy.tranches!.map(t => ({ id: t.id, name: t.name, amount: t.amount, dueDate: t.deadline })),
    createdBy: by,
    formationId: fAcademy.id,
    inscriptionFee: 10000,
    inscriptionPaid: false,
  });
  // Pay inscription
  updatePlanInscription(plan1.id, true, 10000);
  addTransaction({ departmentId: 'guims-academy', type: 'income', paymentMethod: 'momo', category: 'Inscription étudiant', personName: 'Kouadio Aya', description: 'Inscription Formation Marketing Digital', amount: 10000, date: '2026-03-01' });
  // Pay tranche 1
  addInstallment(plan1.id, { amount: 25000, date: '2026-03-15', paymentMethod: 'momo', note: 'Tranche 1', recordedBy: by });
  addTransaction({ departmentId: 'guims-academy', type: 'income', paymentMethod: 'momo', category: 'Frais de formation - Tranche 1', personName: 'Kouadio Aya', description: 'Paiement Tranche 1 Marketing Digital', amount: 25000, date: '2026-03-15' });

  // ── Plan 2: Guims Academy — Dev Web — Koné Ibrahim ──
  const plan2 = addPaymentPlan({
    departmentId: 'guims-academy',
    clientName: 'Koné Ibrahim',
    planType: 'formation',
    label: 'Formation Développement Web',
    description: 'Paiement en 2 tranches',
    totalAmount: 60000,
    scheduledTranches: fAcademy2.tranches!.map(t => ({ id: t.id, name: t.name, amount: t.amount, dueDate: t.deadline })),
    createdBy: by,
    formationId: fAcademy2.id,
    inscriptionFee: 10000,
    inscriptionPaid: false,
  });
  updatePlanInscription(plan2.id, true, 10000);
  addTransaction({ departmentId: 'guims-academy', type: 'income', paymentMethod: 'especes', category: 'Inscription étudiant', personName: 'Koné Ibrahim', description: 'Inscription Formation Dev Web', amount: 10000, date: '2026-03-05' });
  addInstallment(plan2.id, { amount: 30000, date: '2026-03-20', paymentMethod: 'especes', note: 'Tranche 1', recordedBy: by });
  addTransaction({ departmentId: 'guims-academy', type: 'income', paymentMethod: 'especes', category: 'Frais de formation - Tranche 1', personName: 'Koné Ibrahim', description: 'Paiement Tranche 1 Dev Web', amount: 30000, date: '2026-03-20' });
  addInstallment(plan2.id, { amount: 30000, date: '2026-04-02', paymentMethod: 'momo', note: 'Tranche 2', recordedBy: by });
  addTransaction({ departmentId: 'guims-academy', type: 'income', paymentMethod: 'momo', category: 'Frais de formation - Tranche 2', personName: 'Koné Ibrahim', description: 'Paiement Tranche 2 Dev Web', amount: 30000, date: '2026-04-02' });

  // ── Plan 3: GABA — Formation Hannetons — Traoré Mamadou (pack Gold) ──
  const goldPack = fGaba.packs.find(p => p.name === 'Pack Gold')!;
  const plan3 = addPaymentPlan({
    departmentId: 'gaba',
    clientName: 'Traoré Mamadou',
    planType: 'formation',
    label: 'Formation Hannetons (Pack Gold)',
    description: 'Pack Gold avec kit complet',
    totalAmount: 60000,
    scheduledTranches: undefined,
    createdBy: by,
    formationId: fGaba.id,
    packId: goldPack.id,
    inscriptionFee: 5000,
    inscriptionPaid: false,
  });
  updatePlanInscription(plan3.id, true, 5000);
  addTransaction({ departmentId: 'gaba', type: 'income', paymentMethod: 'om', category: 'Inscriptions formation', personName: 'Traoré Mamadou', description: 'Inscription Formation Hannetons (Pack Gold)', amount: 5000, date: '2026-02-20' });
  addInstallment(plan3.id, { amount: 60000, date: '2026-02-25', paymentMethod: 'om', note: 'Paiement complet', recordedBy: by });
  addTransaction({ departmentId: 'gaba', type: 'income', paymentMethod: 'om', category: 'Frais de formation', personName: 'Traoré Mamadou', description: 'Paiement complet Pack Gold Hannetons', amount: 60000, date: '2026-02-25' });

  // ── Plan 4: Guims Educ — Prépas ENS — Bamba Fatou (en cours) ──
  const plan4 = addPaymentPlan({
    departmentId: 'guims-educ',
    clientName: 'Bamba Fatou',
    planType: 'formation',
    label: 'Prépas Concours ENS',
    description: 'Préparation intensive',
    totalAmount: 30000,
    scheduledTranches: fEduc.tranches!.map(t => ({ id: t.id, name: t.name, amount: t.amount, dueDate: t.deadline })),
    createdBy: by,
    formationId: fEduc.id,
    inscriptionFee: 5000,
    inscriptionPaid: false,
  });
  updatePlanInscription(plan4.id, true, 5000);
  addTransaction({ departmentId: 'guims-educ', type: 'income', paymentMethod: 'especes', category: 'Inscription élève/étudiant', personName: 'Bamba Fatou', description: 'Inscription Prépas ENS', amount: 5000, date: '2026-03-10' });
  // Tranche 1 partial
  addInstallment(plan4.id, { amount: 10000, date: '2026-03-25', paymentMethod: 'momo', note: 'Tranche 1 (avance)', recordedBy: by });
  addTransaction({ departmentId: 'guims-educ', type: 'income', paymentMethod: 'momo', category: 'Frais de cours à domicile', personName: 'Bamba Fatou', description: 'Avance Tranche 1 Prépas ENS', amount: 10000, date: '2026-03-25' });

  // ── Plan 5: GABA — Pack Classique — Yao Estelle ──
  const classicPack = fGaba.packs.find(p => p.name === 'Pack Classique')!;
  const plan5 = addPaymentPlan({
    departmentId: 'gaba',
    clientName: 'Yao Estelle',
    planType: 'formation',
    label: 'Formation Hannetons (Pack Classique)',
    description: 'Pack de base',
    totalAmount: 35000,
    scheduledTranches: undefined,
    createdBy: by,
    formationId: fGaba.id,
    packId: classicPack.id,
    inscriptionFee: 5000,
    inscriptionPaid: false,
  });
  updatePlanInscription(plan5.id, true, 5000);
  addTransaction({ departmentId: 'gaba', type: 'income', paymentMethod: 'especes', category: 'Inscriptions formation', personName: 'Yao Estelle', description: 'Inscription Formation Hannetons', amount: 5000, date: '2026-03-02' });

  // ============================================================
  //  5. TRAINING SESSIONS (GABA)
  // ============================================================
  addTraining({
    trainingType: 'gaba',
    parkName: 'Parc Abidjan',
    date: '2026-03-10',
    description: 'Formation pratique élevage de hannetons — session mars',
    trainees: ['Traoré Mamadou', 'Yao Estelle', 'Aya Kouassi'],
    traineeKits: [
      { traineeName: 'Traoré Mamadou', starterKitHannetons: 20, hasBook: true, otherItems: [] },
      { traineeName: 'Yao Estelle', starterKitHannetons: 10, hasBook: true, otherItems: [] },
      { traineeName: 'Aya Kouassi', starterKitHannetons: 10, hasBook: true, otherItems: [] },
    ],
    materialsUsed: [],
    giftsGiven: [],
    createdBy: by,
  });

  addTraining({
    trainingType: 'gaba',
    parkName: 'Parc Yamoussoukro',
    date: '2026-04-05',
    description: 'Session d\'avril — élevage avicole et hannetons',
    trainees: ['Diallo Moussa', 'Coulibaly Mariam'],
    traineeKits: [
      { traineeName: 'Diallo Moussa', starterKitHannetons: 10, hasBook: true, otherItems: [] },
      { traineeName: 'Coulibaly Mariam', starterKitHannetons: 10, hasBook: false, otherItems: [] },
    ],
    materialsUsed: [],
    giftsGiven: [],
    createdBy: by,
  });

  // ============================================================
  //  6. EXTRA TRANSACTIONS  (various departments)
  // ============================================================

  // ── GABA: revenues & expenses ──
  addTransaction({ departmentId: 'gaba', type: 'income', paymentMethod: 'especes', category: 'Vente intrants', personName: 'Client Abidjan #1', description: 'Vente 3 sacs aliment volaille', amount: 30000, date: '2026-02-18' });
  addTransaction({ departmentId: 'gaba', type: 'income', paymentMethod: 'momo', category: 'Vente géniteurs', personName: 'Kouamé Yves', description: 'Vente 5 poules pondeuses', amount: 25000, date: '2026-03-01' });
  addTransaction({ departmentId: 'gaba', type: 'income', paymentMethod: 'especes', category: 'Autres revenus', personName: 'Marché local', description: 'Vente 4 plateaux d\'œufs', amount: 10000, date: '2026-03-05' });
  addTransaction({ departmentId: 'gaba', type: 'expense', paymentMethod: 'especes', category: 'Achat composants intrants', personName: 'Fournisseur AlimentPro', description: 'Achat 10 sacs aliment 25kg', amount: 80000, date: '2026-02-01' });
  addTransaction({ departmentId: 'gaba', type: 'expense', paymentMethod: 'momo', category: 'Achat géniteurs', personName: 'Éleveur Korhogo', description: 'Achat 10 lapins reproducteurs', amount: 50000, date: '2026-01-12' });
  addTransaction({ departmentId: 'gaba', type: 'expense', paymentMethod: 'especes', category: 'Frais de transport', personName: 'Transport Express', description: 'Livraison géniteurs Korhogo → Abidjan', amount: 15000, date: '2026-01-14' });

  // ── Guims Educ ──
  addTransaction({ departmentId: 'guims-educ', type: 'income', paymentMethod: 'momo', category: 'Frais de cours à domicile', personName: 'Famille Touré', description: 'Cours maths + physique — mars', amount: 20000, date: '2026-03-05' });
  addTransaction({ departmentId: 'guims-educ', type: 'income', paymentMethod: 'especes', category: 'Frais cours en ligne', personName: 'Diarra Aminata', description: 'Cours français en ligne — pack 10h', amount: 15000, date: '2026-03-08' });
  addTransaction({ departmentId: 'guims-educ', type: 'income', paymentMethod: 'om', category: 'Coaching scolaire', personName: 'Konan Serge', description: 'Coaching orientation terminale', amount: 10000, date: '2026-03-15' });
  addTransaction({ departmentId: 'guims-educ', type: 'expense', paymentMethod: 'momo', category: 'Communication Facebook', personName: 'Facebook Ads', description: 'Boost pub rentrée mars', amount: 5000, date: '2026-03-01' });
  addTransaction({ departmentId: 'guims-educ', type: 'expense', paymentMethod: 'especes', category: 'Matériel pédagogique', personName: 'Librairie Centrale', description: 'Achat manuels scolaires', amount: 12000, date: '2026-02-25' });

  // ── Guims Academy ──
  addTransaction({ departmentId: 'guims-academy', type: 'expense', paymentMethod: 'momo', category: 'Location salle', personName: 'Espace Cocody', description: 'Location salle formation mars', amount: 30000, date: '2026-03-01' });
  addTransaction({ departmentId: 'guims-academy', type: 'expense', paymentMethod: 'especes', category: 'Matériel de formation', personName: 'Fournisseur Bureau+', description: 'Vidéoprojecteur + marqueurs', amount: 45000, date: '2026-02-15' });
  addTransaction({ departmentId: 'guims-academy', type: 'expense', paymentMethod: 'banque', category: 'Rémunération formateur', personName: 'Formateur Koffi', description: 'Honoraires mars — marketing digital', amount: 50000, date: '2026-03-30' });

  // ── DigitBoosterPlus ──
  addTransaction({ departmentId: 'digitboosterplus', type: 'income', paymentMethod: 'momo', category: 'Création site web', personName: 'Restaurant Le Maquis', description: 'Site web vitrine + domaine', amount: 150000, date: '2026-02-10' });
  addTransaction({ departmentId: 'digitboosterplus', type: 'income', paymentMethod: 'om', category: 'Boost Facebook', personName: 'Boutique ModeCI', description: 'Campagne boost 1 mois', amount: 25000, date: '2026-03-01' });
  addTransaction({ departmentId: 'digitboosterplus', type: 'income', paymentMethod: 'momo', category: 'Publication Facebook', personName: 'Salon Beauté Akissi', description: '10 publications + visuels', amount: 20000, date: '2026-03-10' });
  addTransaction({ departmentId: 'digitboosterplus', type: 'income', paymentMethod: 'banque', category: 'Community management', personName: 'ONG EducAfrica', description: 'Gestion réseaux sociaux — mars', amount: 35000, date: '2026-03-15' });
  addTransaction({ departmentId: 'digitboosterplus', type: 'income', paymentMethod: 'especes', category: 'Autres services digitaux', personName: 'PME LogiTrans', description: 'Création logo + charte graphique', amount: 40000, date: '2026-03-20' });
  addTransaction({ departmentId: 'digitboosterplus', type: 'expense', paymentMethod: 'banque', category: 'Hébergement', personName: 'OVH Cloud', description: 'Hébergement annuel serveurs', amount: 35000, date: '2026-01-05' });
  addTransaction({ departmentId: 'digitboosterplus', type: 'expense', paymentMethod: 'momo', category: 'Outils digitaux', personName: 'Canva Pro', description: 'Abonnement annuel Canva', amount: 18000, date: '2026-01-10' });
  addTransaction({ departmentId: 'digitboosterplus', type: 'expense', paymentMethod: 'momo', category: 'Publicité', personName: 'Meta Ads', description: 'Budget pub Facebook Q1', amount: 20000, date: '2026-03-01' });

  // ============================================================
  //  7. AUDIT ENTRIES
  // ============================================================
  addAuditEntry({ userId, username, action: 'create', entityType: 'transaction', entityId: plan1.id, details: `Inscription Kouadio Aya — Formation Marketing Digital : 10 000 FCFA`, previousData: '', newData: '' });
  addAuditEntry({ userId, username, action: 'create', entityType: 'transaction', entityId: plan2.id, details: `Paiement complet Koné Ibrahim — Formation Dev Web : 60 000 FCFA`, previousData: '', newData: '' });
  addAuditEntry({ userId, username, action: 'create', entityType: 'transaction', entityId: plan3.id, details: `Paiement complet Traoré Mamadou — Pack Gold Hannetons : 65 000 FCFA`, previousData: '', newData: '' });

  // ── Mark done ──
  localStorage.setItem(SEED_FLAG, '1');

  // Log summary
  const items = getStockItems();
  const formations = getFormationsCatalog();
  const plans = getPaymentPlans();
  const trainings = getTrainings();
  console.log(`[Seed] Done! Created:`);
  console.log(`  • ${items.length} stock items`);
  console.log(`  • ${formations.length} formations`);
  console.log(`  • ${plans.length} payment plans`);
  console.log(`  • ${trainings.length} trainings`);
  console.log(`  • 25+ transactions across 4 departments`);
}
