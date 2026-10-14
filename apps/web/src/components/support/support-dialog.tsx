"use client";

import { useEffect, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowLeft, ChevronRight, Mail, MessageCircle } from "lucide-react";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABELS,
  type SupportCategory,
} from "@nutri-plus/shared-types";
import { submitSupportRequest } from "@/lib/api/support";
import { ApiError } from "@/lib/api/client";
import {
  supportRequestSchema,
  type SupportFormValues,
} from "@/lib/validation/support";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SUPPORT_WHATSAPP = "5562991376124";

function supportWhatsappUrl(email: string): string {
  const text = `Olá! Sou nutricionista e uso o iNutri (conta: ${email}). Preciso de ajuda com: `;
  return `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(text)}`;
}

function ChannelOption({
  icon,
  title,
  description,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
        {icon}
      </span>
      <span className="flex-1">
        <span className="flex items-center gap-2 font-medium">
          {title}
          {badge && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {badge}
            </span>
          )}
        </span>
        <span className="block text-sm text-muted-foreground">
          {description}
        </span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
    </>
  );
}

const channelClass =
  "flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function SupportDialog({
  open,
  onOpenChange,
  defaultEmail,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultEmail: string;
}) {
  const [step, setStep] = useState<"choose" | "email">("choose");
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<SupportFormValues>({
    resolver: zodResolver(
      supportRequestSchema,
    ) as unknown as Resolver<SupportFormValues>,
    defaultValues: {
      replyTo: defaultEmail,
      category: undefined as unknown as SupportCategory,
      description: "",
    },
  });

  useEffect(() => {
    if (open) {
      setStep("choose");
      form.reset({
        replyTo: defaultEmail,
        category: undefined as unknown as SupportCategory,
        description: "",
      });
      setFormError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultEmail]);

  async function onSubmit(values: SupportFormValues) {
    setFormError(null);
    try {
      await submitSupportRequest(values);
      toast.success("Pedido de suporte enviado. Responderemos em breve.");
      onOpenChange(false);
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 503
          ? "Suporte indisponível no momento. Tente mais tarde ou escreva para contato@inutri.life."
          : "Não foi possível enviar. Tente novamente.";
      setFormError(message);
      toast.error(message);
    }
  }

  const pending = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Suporte</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {step === "choose"
              ? "Como prefere falar com a gente?"
              : "Conte o que aconteceu. Responderemos no e-mail informado."}
          </p>
        </DialogHeader>

        {step === "choose" ? (
          <div className="space-y-3">
            <a
              href={supportWhatsappUrl(defaultEmail)}
              target="_blank"
              rel="noopener noreferrer"
              className={channelClass}
              onClick={() => onOpenChange(false)}
            >
              <ChannelOption
                icon={
                  <MessageCircle
                    className="size-5 text-[#25D366]"
                    aria-hidden
                  />
                }
                title="WhatsApp"
                badge="Resposta mais rápida"
                description="Converse direto com a nossa equipe."
              />
            </a>
            <button
              type="button"
              className={channelClass}
              onClick={() => setStep("email")}
            >
              <ChannelOption
                icon={
                  <Mail className="size-5 text-muted-foreground" aria-hidden />
                }
                title="Enviar por e-mail"
                description="Descreva o problema e respondemos no seu e-mail."
              />
            </button>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="replyTo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-mail para retorno</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria</FormLabel>
                    <Select
                      value={field.value ?? ""}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o tipo do problema" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SUPPORT_CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {SUPPORT_CATEGORY_LABELS[c]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={5}
                        placeholder="Descreva o problema com o máximo de detalhes possível."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {formError && (
                <p className="text-sm text-destructive">{formError}</p>
              )}

              <DialogFooter className="justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setStep("choose")}
                  disabled={pending}
                >
                  <ArrowLeft className="size-4" aria-hidden />
                  Voltar
                </Button>
                <Button
                  type="submit"
                  className="rounded-full"
                  disabled={pending}
                >
                  {pending ? "Enviando…" : "Enviar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
