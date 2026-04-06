import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { changePassword, updateUserProfile } from "@/lib/auth";
import { toast } from "sonner";
import { User, ShieldCheck, Shield, KeyRound, Eye, EyeOff, CheckCircle2, XCircle, Save } from "lucide-react";

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const checks = [
    { label: "6 caractères minimum", ok: password.length >= 6 },
    { label: "Une majuscule", ok: /[A-Z]/.test(password) },
    { label: "Un chiffre", ok: /\d/.test(password) },
  ];
  const passed = checks.filter(c => c.ok).length;
  const color = passed <= 1 ? "bg-destructive" : passed === 2 ? "bg-warning" : "bg-success";
  return (
    <div className="space-y-2 mt-2">
      <div className="flex gap-1">
        {[0, 1, 2].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < passed ? color : "bg-muted"}`} />
        ))}
      </div>
      <div className="space-y-0.5">
        {checks.map(c => (
          <p key={c.label} className={`text-[11px] flex items-center gap-1 ${c.ok ? "text-success" : "text-muted-foreground"}`}>
            {c.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
            {c.label}
          </p>
        ))}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { user, refresh } = useAuth();

  // Profile edit state
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [profileLoading, setProfileLoading] = useState(false);

  // Password change state
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  if (!user) return null;

  const handleProfileUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileLoading(true);
    const result = updateUserProfile(user.id, displayName);
    setProfileLoading(false);
    if (result.success) {
      toast.success("Profil mis à jour");
      refresh();
    } else {
      toast.error(result.error);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPwd || !newPwd || !confirmPwd) {
      toast.error("Veuillez remplir tous les champs");
      return;
    }
    if (newPwd !== confirmPwd) {
      toast.error("Les nouveaux mots de passe ne correspondent pas");
      return;
    }
    if (newPwd.length < 6) {
      toast.error("Nouveau mot de passe trop court (min 6 caractères)");
      return;
    }
    setPwdLoading(true);
    const result = await changePassword(user.id, currentPwd, newPwd);
    setPwdLoading(false);
    if (result.success) {
      toast.success("Mot de passe modifié avec succès");
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
    } else {
      toast.error(result.error);
    }
  };

  const confirmMismatch = confirmPwd.length > 0 && newPwd !== confirmPwd;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Mon profil</h2>
        <p className="text-sm text-muted-foreground">Gérer vos informations et votre mot de passe</p>
      </div>

      {/* Account info card */}
      <Card className="border-0 shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-lg">{user.displayName}</CardTitle>
              <p className="text-sm text-muted-foreground">@{user.username}</p>
            </div>
            {user.role === 'superadmin' ? (
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                <ShieldCheck className="h-3 w-3 mr-1" /> Super Admin
              </Badge>
            ) : (
              <Badge variant="secondary">
                <Shield className="h-3 w-3 mr-1" /> Admin
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Membre depuis le {new Date(user.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </CardContent>
      </Card>

      {/* Edit display name */}
      <Card className="border-0 shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Save className="h-4 w-4" /> Informations personnelles
          </CardTitle>
          <CardDescription>Modifier votre nom affiché dans l'application</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleProfileUpdate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="profile-name">Nom complet</Label>
                <Input
                  id="profile-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Votre nom complet"
                />
              </div>
              <div className="space-y-2">
                <Label>Nom d'utilisateur</Label>
                <Input value={user.username} disabled className="bg-muted" />
              </div>
            </div>
            <Button type="submit" disabled={profileLoading || displayName.trim() === user.displayName} className="gap-2">
              <Save className="h-4 w-4" />
              {profileLoading ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card className="border-0 shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Changer le mot de passe
          </CardTitle>
          <CardDescription>Pour votre sécurité, choisissez un mot de passe unique</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-pwd">Mot de passe actuel</Label>
              <div className="relative">
                <Input
                  id="current-pwd"
                  type={showCurrent ? "text" : "password"}
                  value={currentPwd}
                  onChange={(e) => setCurrentPwd(e.target.value)}
                  placeholder="Votre mot de passe actuel"
                  autoComplete="current-password"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full w-10 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowCurrent(!showCurrent)}
                  tabIndex={-1}
                >
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="new-pwd">Nouveau mot de passe</Label>
              <div className="relative">
                <Input
                  id="new-pwd"
                  type={showNew ? "text" : "password"}
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="Nouveau mot de passe"
                  autoComplete="new-password"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full w-10 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowNew(!showNew)}
                  tabIndex={-1}
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <PasswordStrength password={newPwd} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-pwd">Confirmer le nouveau mot de passe</Label>
              <Input
                id="confirm-pwd"
                type={showNew ? "text" : "password"}
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                placeholder="Retapez le nouveau mot de passe"
                autoComplete="new-password"
                className={confirmMismatch ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {confirmMismatch && (
                <p className="text-[11px] text-destructive flex items-center gap-1">
                  <XCircle className="h-3 w-3" /> Les mots de passe ne correspondent pas
                </p>
              )}
            </div>

            <Button type="submit" disabled={pwdLoading || confirmMismatch || !currentPwd || !newPwd} className="gap-2">
              <KeyRound className="h-4 w-4" />
              {pwdLoading ? "Modification..." : "Modifier le mot de passe"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
