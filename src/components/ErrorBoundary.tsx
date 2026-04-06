import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center space-y-4 max-w-md">
            <AlertTriangle className="h-12 w-12 text-warning mx-auto" />
            <h2 className="text-xl font-bold text-foreground">Une erreur est survenue</h2>
            <p className="text-sm text-muted-foreground">
              {this.state.error?.message || "Quelque chose s'est mal passé."}
            </p>
            <Button onClick={() => { this.setState({ hasError: false }); window.location.href = '/'; }}>
              Retourner à l'accueil
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
