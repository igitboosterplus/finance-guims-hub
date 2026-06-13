/**
 * ==================== PAGE: JOURNAL COMPTABLE ====================
 * Interface pour:
 * - Saisie d'écritures comptables en partie double
 * - Consultation balance générale
 * - Validation et contrôle
 * - Clôture de périodes
 */

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertCircle,
  Plus,
  CheckCircle,
  DollarSign,
  BookOpen,
  TrendingUp,
} from 'lucide-react';

import {
  createJournalEntry,
  validateJournalEntry,
  getJournalEntries,
  createAccountingPeriod,
  getAccountingPeriods,
  closeAccountingPeriod,
  generateTrialBalance,
  getGeneralLedger,
} from '@/lib/accountingEntries';
import { chartOfAccounts, journals, getAccount } from '@/lib/chartOfAccounts';
import { getCurrentSession } from '@/lib/auth';
import { formatCurrency } from '@/lib/data';

interface EntryLineUI {
  accountCode: string;
  amount: string;
  side: 'D' | 'C';
  description: string;
}

export default function JournalComptablePage() {
  const session = getCurrentSession();
  const [activeTab, setActiveTab] = useState<'saisie' | 'balance' | 'grand-livre' | 'periodes'>('saisie');

  // ========== STATE SAISIE D'ÉCRITURE ==========
  const [journalType, setJournalType] = useState<string>('VE');
  const [accountingPeriod, setAccountingPeriod] = useState<string>('2026-06');
  const [description, setDescription] = useState('');
  const [departmentId, setDepartmentId] = useState('gaba');
  const [referenceDocument, setReferenceDocument] = useState('');
  const [lines, setLines] = useState<EntryLineUI[]>([
    { accountCode: '', amount: '', side: 'D', description: '' },
    { accountCode: '', amount: '', side: 'C', description: '' },
  ]);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  // ========== STATE FILTRAGE ==========
  const [selectedPeriod, setSelectedPeriod] = useState('2026-06');
  const [selectedAccount, setSelectedAccount] = useState('');

  // ========== DONNÉES CONSOLIDÉES ==========
  const allEntries = useMemo(() => getJournalEntries(), []);
  const allPeriods = useMemo(() => getAccountingPeriods(), []);
  const trialBalance = useMemo(
    () => generateTrialBalance(selectedPeriod),
    [selectedPeriod]
  );
  const generalLedger = useMemo(
    () => (selectedAccount ? getGeneralLedger(selectedAccount) : []),
    [selectedAccount]
  );

  // ========== HANDLERS SAISIE ==========

  const handleAddLine = () => {
    setLines([
      ...lines,
      { accountCode: '', amount: '', side: 'D', description: '' },
    ]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length > 2) {
      setLines(lines.filter((_, i) => i !== index));
    }
  };

  const handleLineChange = (
    index: number,
    field: keyof EntryLineUI,
    value: string
  ) => {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: value };
    setLines(updated);
  };

  const handleCreateEntry = () => {
    setError('');
    setSuccess('');

    // Valider
    if (!description.trim()) {
      setError('Description requise');
      return;
    }

    const parsedLines = lines.map((l) => ({
      accountCode: l.accountCode,
      amount: parseFloat(l.amount) || 0,
      side: l.side as 'D' | 'C',
      description: l.description,
    }));

    const result = createJournalEntry(
      journalType,
      accountingPeriod,
      parsedLines,
      description,
      departmentId,
      session?.username || 'admin',
      referenceDocument || undefined
    );

    if (result.success) {
      setSuccess(`✓ Écriture créée: ${result.entryId}`);
      // Réinitialiser
      setDescription('');
      setReferenceDocument('');
      setLines([
        { accountCode: '', amount: '', side: 'D', description: '' },
        { accountCode: '', amount: '', side: 'C', description: '' },
      ]);
      setTimeout(() => setSuccess(''), 3000);
    } else {
      setError(result.error || 'Erreur lors de la création');
    }
  };

  const handleValidateEntry = (entryId: string) => {
    const result = validateJournalEntry(entryId, session?.username || 'admin');
    if (result.success) {
      setSuccess('✓ Écriture validée');
      setTimeout(() => setSuccess(''), 2000);
    } else {
      setError(result.error || 'Erreur validation');
    }
  };

  const handleClosePeriod = (period: string) => {
    const result = closeAccountingPeriod(period, 'Clôture mensuelle');
    if (result.success) {
      setSuccess(`✓ Période ${period} fermée`);
      setTimeout(() => setSuccess(''), 2000);
    } else {
      setError(result.error);
    }
  };

  const handleCreatePeriod = (newPeriod: string) => {
    const result = createAccountingPeriod(newPeriod);
    if (result.success) {
      setAccountingPeriod(newPeriod);
      setSuccess(`✓ Période ${newPeriod} créée`);
    } else {
      setError(result.error);
    }
  };

  // ========== CALCULS UI ==========

  const totalDebits = lines.reduce(
    (sum, l) => sum + (l.side === 'D' ? parseFloat(l.amount) || 0 : 0),
    0
  );
  const totalCredits = lines.reduce(
    (sum, l) => sum + (l.side === 'C' ? parseFloat(l.amount) || 0 : 0),
    0
  );
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

  const entriesCount = allEntries.length;
  const validatedCount = allEntries.filter((e) => e.status === 'validated').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="h-6 w-6" />
          Journal Comptable
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Saisie et gestion des écritures comptables en partie double
        </p>
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/30 rounded-lg p-4">
          <AlertCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-lg p-4">
          <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-green-700">{success}</p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total écritures</div>
            <div className="text-2xl font-bold">{entriesCount}</div>
            <div className="text-xs text-green-600 mt-1">
              {validatedCount} validées
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Balance débits</div>
            <div className="text-2xl font-bold">
              {formatCurrency(trialBalance.totalDebits)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Balance crédits</div>
            <div className="text-2xl font-bold">
              {formatCurrency(trialBalance.totalCredits)}
            </div>
            <div
              className={`text-xs mt-1 ${
                Math.abs(trialBalance.totalDebits - trialBalance.totalCredits) <
                0.01
                  ? 'text-green-600'
                  : 'text-destructive'
              }`}
            >
              {Math.abs(
                trialBalance.totalDebits - trialBalance.totalCredits
              ) < 0.01
                ? '✓ Équilibrée'
                : '✗ Déséquilibrée'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="saisie" className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Saisie
          </TabsTrigger>
          <TabsTrigger value="balance" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Balance
          </TabsTrigger>
          <TabsTrigger value="grand-livre" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Grand Livre
          </TabsTrigger>
          <TabsTrigger value="periodes" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Périodes
          </TabsTrigger>
        </TabsList>

        {/* ========== TAB SAISIE ==========*/}
        <TabsContent value="saisie" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nouvelle écriture comptable</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Entête */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Journal
                  </label>
                  <Select value={journalType} onValueChange={setJournalType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(journals).map(([key, journal]) => (
                        <SelectItem key={key} value={key}>
                          {journal.code} - {journal.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Période
                  </label>
                  <Select
                    value={accountingPeriod}
                    onValueChange={setAccountingPeriod}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {allPeriods.map((p) => (
                        <SelectItem key={p.period} value={p.period}>
                          {p.period} ({p.status})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Description
                </label>
                <Input
                  placeholder="Libellé de l'écriture"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Département
                  </label>
                  <Select value={departmentId} onValueChange={setDepartmentId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gaba">GABA</SelectItem>
                      <SelectItem value="guims-educ">Guims Educ</SelectItem>
                      <SelectItem value="guims-academy">
                        Guims Academy
                      </SelectItem>
                      <SelectItem value="digitboosterplus">
                        DigitBoosterPlus
                      </SelectItem>
                      <SelectItem value="charges-entreprise">
                        Direction Générale
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Document référence (opt)
                  </label>
                  <Input
                    placeholder="Facture, bulletin, etc."
                    value={referenceDocument}
                    onChange={(e) => setReferenceDocument(e.target.value)}
                  />
                </div>
              </div>

              {/* Lignes */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-2">
                  Lignes de l'écriture
                </label>
                <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
                  {lines.map((line, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                      <Select
                        value={line.accountCode}
                        onValueChange={(v) =>
                          handleLineChange(idx, 'accountCode', v)
                        }
                      >
                        <SelectTrigger className="col-span-4">
                          <SelectValue placeholder="Compte..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-64">
                          {chartOfAccounts.map((acc) => (
                            <SelectItem key={acc.code} value={acc.code}>
                              {acc.code} - {acc.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={line.side}
                        onValueChange={(v) =>
                          handleLineChange(idx, 'side', v)
                        }
                      >
                        <SelectTrigger className="col-span-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="D">Débit</SelectItem>
                          <SelectItem value="C">Crédit</SelectItem>
                        </SelectContent>
                      </Select>

                      <Input
                        type="number"
                        placeholder="0"
                        value={line.amount}
                        onChange={(e) =>
                          handleLineChange(idx, 'amount', e.target.value)
                        }
                        className="col-span-3"
                      />

                      {lines.length > 2 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveLine(idx)}
                          className="col-span-1 h-10"
                        >
                          ✕
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Équilibre */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 grid grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground">Total Débits</div>
                  <div className="font-bold text-blue-700">
                    {formatCurrency(totalDebits)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Total Crédits</div>
                  <div className="font-bold text-blue-700">
                    {formatCurrency(totalCredits)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">État</div>
                  <Badge
                    variant={isBalanced ? 'default' : 'destructive'}
                    className="mt-1"
                  >
                    {isBalanced
                      ? '✓ Équilibrée'
                      : `✗ Écart ${formatCurrency(
                          Math.abs(totalDebits - totalCredits)
                        )}`}
                  </Badge>
                </div>
              </div>

              <Button
                onClick={handleAddLine}
                variant="outline"
                className="w-full"
              >
                + Ajouter une ligne
              </Button>

              <Button
                onClick={handleCreateEntry}
                disabled={!isBalanced || !description.trim()}
                className="w-full"
              >
                Créer l'écriture
              </Button>
            </CardContent>
          </Card>

          {/* Écritures récentes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Écritures récentes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHead>Journal</TableHead>
                      <TableHead>Numéro</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Montant</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {[...allEntries]
                      .sort(
                        (a, b) =>
                          new Date(b.createdAt).getTime() -
                          new Date(a.createdAt).getTime()
                      )
                      .slice(0, 10)
                      .map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-mono text-sm">
                            {entry.journalType}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {entry.journalNumber}
                          </TableCell>
                          <TableCell className="text-sm">
                            {entry.description}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(
                              entry.lines[0]?.amount || 0
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                entry.status === 'validated'
                                  ? 'default'
                                  : 'secondary'
                              }
                            >
                              {entry.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {entry.status === 'draft' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleValidateEntry(entry.id)}
                              >
                                Valider
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========== TAB BALANCE GÉNÉRALE ==========*/}
        <TabsContent value="balance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Balance générale</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Période
                  </label>
                  <Select
                    value={selectedPeriod}
                    onValueChange={setSelectedPeriod}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {allPeriods.map((p) => (
                        <SelectItem key={p.period} value={p.period}>
                          {p.period}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHead>Compte</TableHead>
                      <TableHead>Libellé</TableHead>
                      <TableHead className="text-right">Débits</TableHead>
                      <TableHead className="text-right">Crédits</TableHead>
                      <TableHead className="text-right">Solde</TableHead>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {trialBalance.rows.map((row) => (
                      <TableRow key={row.accountCode}>
                        <TableCell className="font-mono font-bold">
                          {row.accountCode}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.accountLabel}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {formatCurrency(row.debits)}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {formatCurrency(row.credits)}
                        </TableCell>
                        <TableCell className="text-right font-bold text-sm">
                          {formatCurrency(row.balance)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold bg-muted">
                      <TableCell colSpan={2}>TOTAL</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(trialBalance.totalDebits)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(trialBalance.totalCredits)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={
                            Math.abs(
                              trialBalance.totalDebits -
                                trialBalance.totalCredits
                            ) < 0.01
                              ? 'default'
                              : 'destructive'
                          }
                        >
                          {Math.abs(
                            trialBalance.totalDebits -
                              trialBalance.totalCredits
                          ) < 0.01
                            ? '✓'
                            : '✗'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========== TAB GRAND LIVRE ==========*/}
        <TabsContent value="grand-livre" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Grand Livre - Compte détail</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Sélectionner un compte
                </label>
                <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir un compte..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {trialBalance.rows.map((row) => (
                      <SelectItem key={row.accountCode} value={row.accountCode}>
                        {row.accountCode} - {row.accountLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedAccount && (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Journal</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Débit</TableHead>
                        <TableHead className="text-right">Crédit</TableHead>
                        <TableHead className="text-right">Solde</TableHead>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {generalLedger.map((line, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-sm">
                            {line.entryDate}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {line.journalNumber}
                          </TableCell>
                          <TableCell className="text-sm">
                            {line.description}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {line.debit ? formatCurrency(line.debit) : '-'}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {line.credit ? formatCurrency(line.credit) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-bold text-sm">
                            {formatCurrency(line.balance)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========== TAB PERIODES ==========*/}
        <TabsContent value="periodes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Gestion des périodes comptables</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Créer nouvelle période
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      placeholder="YYYY-MM"
                      id="newPeriod"
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        const input = document.getElementById(
                          'newPeriod'
                        ) as HTMLInputElement;
                        if (input?.value) handleCreatePeriod(input.value);
                      }}
                    >
                      Créer
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {allPeriods.map((period) => (
                  <div
                    key={period.period}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <div className="font-bold">{period.period}</div>
                      <div className="text-xs text-muted-foreground">
                        {period.status === 'open' ? 'Ouverte' : 'Fermée'} -{' '}
                        {new Date(period.openedAt).toLocaleDateString('fr-FR')}
                      </div>
                    </div>
                    {period.status === 'open' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleClosePeriod(period.period)}
                      >
                        Fermer
                      </Button>
                    )}
                    {period.status === 'closed' && (
                      <Badge>Fermée</Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
