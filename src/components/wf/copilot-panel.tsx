import { Link } from "@tanstack/react-router";
import { Bot, CornerDownLeft, Sparkles, User } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { askCopilot, copilotSuggestions, type CopilotReply } from "@/lib/wf/copilot";
import { useWf } from "@/lib/wf/store";

interface Turn {
  q: string;
  a: CopilotReply;
}

export function CopilotPanel() {
  const state = useWf();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);

  const ask = (question: string) => {
    const q = question.trim();
    if (!q) return;
    setTurns((t) => [...t, { q, a: askCopilot(q, state) }]);
    setInput("");
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="secondary" className="gap-2">
          <Sparkles className="size-4 text-primary" />
          WFX Copilot
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Bot className="size-4 text-primary" /> WFX Copilot
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            Answers grounded in live warehouse state — orders, inventory, stations and exceptions.
          </p>
        </SheetHeader>

        <ScrollArea className="flex-1 px-5 py-4">
          {turns.length === 0 ? (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Try asking
              </p>
              <div className="flex flex-wrap gap-2">
                {copilotSuggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => ask(s)}
                    className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {turns.map((t, i) => (
                <div key={i} className="space-y-3">
                  <div className="flex items-start gap-2">
                    <User className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <p className="text-sm font-medium">{t.q}</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <Bot className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div className="panel flex-1 space-y-2 p-3">
                      <p className="text-sm leading-relaxed">{t.a.answer}</p>
                      {t.a.bullets.length ? (
                        <ul className="space-y-1">
                          {t.a.bullets.map((b, j) => (
                            <li key={j} className="flex gap-2 text-xs text-muted-foreground">
                              <span className="text-primary">›</span>
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {t.a.link ? (
                        <Button
                          asChild
                          size="sm"
                          variant="secondary"
                          className="mt-1"
                          onClick={() => setOpen(false)}
                        >
                          <Link to={t.a.link.to}>{t.a.link.label}</Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <form
          className="flex items-center gap-2 border-t border-border px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about risk, priorities, stock, bottlenecks…"
            aria-label="Ask WFX Copilot"
          />
          <Button type="submit" size="icon" aria-label="Send question">
            <CornerDownLeft className="size-4" />
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
