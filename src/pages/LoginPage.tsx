import { useState } from "react";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { login, createUser } from "@/lib/auth";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { LogIn, UserPlus, Eye, EyeOff, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import logoGuimsGroup from "@/assets/logo-guims-group.jpg";

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

export default function LoginPage() {
  const { refresh } = useAuth();
  const [activeTab, setActiveTab] = useState("login");

  // Login state
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [showLoginPwd, setShowLoginPwd] = useState(false);

  // Register state
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regDisplayName, setRegDisplayName] = useState("");
  const [regLoading, setRegLoading] = useState(false);
  const [showRegPwd, setShowRegPwd] = useState(false);
  const [regSuccess, setRegSuccess] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim() || !loginPassword) {
      toast.error("Veuillez remplir tous les champs");
      return;
    }
    setLoginLoading(true);
    const result = await login(loginUsername.trim(), loginPassword);
    setLoginLoading(false);
    if (result.success) {
      toast.success(`Bienvenue, ${result.user!.displayName}`);
      refresh();
    } else {
      toast.error(result.error);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regUsername.trim() || !regPassword || !regDisplayName.trim()) {
      toast.error("Veuillez remplir tous les champs");
      return;
    }
    if (regUsername.trim().length < 3) {
      toast.error("Nom d'utilisateur trop court (min 3 caractères)");
      return;
    }
    if (regPassword.length < 6) {
      toast.error("Mot de passe trop court (min 6 caractères)");
      return;
    }
    if (regPassword !== regConfirm) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }
    setRegLoading(true);
    const result = await createUser(regUsername.trim(), regPassword, regDisplayName.trim(), 'admin');
    setRegLoading(false);
    if (result.success) {
      setRegSuccess(true);
      setRegUsername("");
      setRegPassword("");
      setRegConfirm("");
      setRegDisplayName("");
    } else {
      toast.error(result.error);
    }
  };

  const confirmMismatch = regConfirm.length > 0 && regPassword !== regConfirm;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-3">
          <img src={logoGuimsGroup} alt="Guims Group" className="h-20 w-20 rounded-2xl object-cover shadow-lg mx-auto ring-2 ring-primary/10" />
          <h1 className="text-2xl font-bold text-foreground">Guims Finance</h1>
          <p className="text-sm text-muted-foreground italic">Petit à petit, on y arrivera</p>
        </div>

        <Card className="border-0 shadow-xl">
          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setRegSuccess(false); }}>
            <CardHeader className="pb-2">
              <TabsList className="w-full">
                <TabsTrigger value="login" className="flex-1 gap-1.5">
                  <LogIn className="h-3.5 w-3.5" /> Connexion
                </TabsTrigger>
                <TabsTrigger value="register" className="flex-1 gap-1.5">
                  <UserPlus className="h-3.5 w-3.5" /> Créer un compte
                </TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent>
              {/* ===== LOGIN TAB ===== */}
              <TabsContent value="login" className="mt-0">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-user">Nom d'utilisateur</Label>
                    <Input
                      id="login-user"
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      placeholder="Votre identifiant"
                      autoComplete="username"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-pwd">Mot de passe</Label>
                    <div className="relative">
                      <Input
                        id="login-pwd"
                        type={showLoginPwd ? "text" : "password"}
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="Votre mot de passe"
                        autoComplete="current-password"
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full w-10 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowLoginPwd(!showLoginPwd)}
                        tabIndex={-1}
                      >
                        {showLoginPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full gap-2 h-11" disabled={loginLoading}>
                    <LogIn className="h-4 w-4" />
                    {loginLoading ? "Connexion en cours..." : "Se connecter"}
                  </Button>
                </form>
              </TabsContent>

              {/* ===== REGISTER TAB ===== */}
              <TabsContent value="register" className="mt-0">
                {regSuccess ? (
                  <div className="text-center py-6 space-y-4">
                    <div className="mx-auto h-14 w-14 rounded-full bg-success/10 flex items-center justify-center">
                      <CheckCircle2 className="h-7 w-7 text-success" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">Compte créé avec succès !</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Votre compte est en attente d'approbation par le Super Admin. Vous serez notifié une fois qu'il sera activé.
                      </p>
                    </div>
                    <Button variant="outline" className="gap-2" onClick={() => { setRegSuccess(false); setActiveTab("login"); }}>
                      <LogIn className="h-4 w-4" /> Retour à la connexion
                    </Button>
                  </div>
                ) : (
                  <>
                    <CardDescription className="mb-4 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <span>Créez un compte administrateur. Il sera activé après validation par le Super Admin.</span>
                    </CardDescription>
                    <form onSubmit={handleRegister} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="reg-name">Nom complet</Label>
                        <Input
                          id="reg-name"
                          value={regDisplayName}
                          onChange={(e) => setRegDisplayName(e.target.value)}
                          placeholder="Ex: Jean Dupont"
                          autoComplete="name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reg-user">Nom d'utilisateur</Label>
                        <Input
                          id="reg-user"
                          value={regUsername}
                          onChange={(e) => setRegUsername(e.target.value.replace(/\s/g, ''))}
                          placeholder="Ex: jdupont (sans espaces)"
                          autoComplete="username"
                        />
                        {regUsername.length > 0 && regUsername.length < 3 && (
                          <p className="text-[11px] text-destructive">Min. 3 caractères</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reg-pwd">Mot de passe</Label>
                        <div className="relative">
                          <Input
                            id="reg-pwd"
                            type={showRegPwd ? "text" : "password"}
                            value={regPassword}
                            onChange={(e) => setRegPassword(e.target.value)}
                            placeholder="Créez un mot de passe"
                            autoComplete="new-password"
                            className="pr-10"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full w-10 text-muted-foreground hover:text-foreground"
                            onClick={() => setShowRegPwd(!showRegPwd)}
                            tabIndex={-1}
                          >
                            {showRegPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                        <PasswordStrength password={regPassword} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reg-confirm">Confirmer le mot de passe</Label>
                        <Input
                          id="reg-confirm"
                          type={showRegPwd ? "text" : "password"}
                          value={regConfirm}
                          onChange={(e) => setRegConfirm(e.target.value)}
                          placeholder="Retapez le mot de passe"
                          autoComplete="new-password"
                          className={confirmMismatch ? "border-destructive focus-visible:ring-destructive" : ""}
                        />
                        {confirmMismatch && (
                          <p className="text-[11px] text-destructive flex items-center gap-1">
                            <XCircle className="h-3 w-3" /> Les mots de passe ne correspondent pas
                          </p>
                        )}
                      </div>
                      <Button type="submit" className="w-full gap-2 h-11" disabled={regLoading || confirmMismatch}>
                        <UserPlus className="h-4 w-4" />
                        {regLoading ? "Création en cours..." : "Créer mon compte"}
                      </Button>
                    </form>
                  </>
                )}
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
