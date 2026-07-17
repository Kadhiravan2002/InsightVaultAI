import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Sparkles, ShieldCheck, MessageSquare, FileSearch, Users, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen gradient-hero">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg gradient-primary shadow-elegant">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display text-lg font-semibold tracking-tight">InsightVault AI</span>
        </Link>
        <nav className="flex items-center gap-3">
          <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">Sign in</Link>
          <Button asChild variant="default">
            <Link to="/auth">Get started <ArrowRight className="ml-1 h-4 w-4" /></Link>
          </Button>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-6 pt-16 pb-24">
        <section className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_10px] shadow-primary" />
            For data-analytics consultancies
          </span>
          <h1 className="mt-6 text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Your project knowledge,<br />
            <span className="bg-gradient-to-r from-primary via-primary to-fuchsia-400 bg-clip-text text-transparent">available on demand.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Preserve every report, dashboard and dataset in a secure client portal. Your clients ask questions in plain English and get answers grounded in their own project documents — freeing your analysts from repeat support.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button asChild size="lg" className="gradient-primary text-primary-foreground shadow-elegant">
              <Link to="/auth">Open the portal <ArrowRight className="ml-1 h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#features">See how it works</a>
            </Button>
          </div>
        </section>

        <section id="features" className="mt-24 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: FileSearch, title: "Ingest anything", body: "PDFs, Excel, CSV, Word, PowerPoint, dashboard exports, images and charts." },
            { icon: MessageSquare, title: "Ask like ChatGPT", body: "Clients pose questions in natural language and get grounded, cited answers." },
            { icon: ShieldCheck, title: "Isolated by client", body: "Row-level security guarantees a client only ever sees their own project." },
            { icon: Users, title: "Admin control", body: "One dashboard to manage clients, workspaces, files and chat activity." },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border border-border/60 bg-card/60 p-5 shadow-card backdrop-blur">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent/30 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>

        <footer className="mt-24 border-t border-border/60 pt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} InsightVault AI · Built for consulting teams.
        </footer>
      </main>
    </div>
  );
}
