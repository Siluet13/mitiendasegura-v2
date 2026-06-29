import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface Props {
  platform: "ios" | "android" | "desktop";
  open: boolean;
  onClose: () => void;
}

const instructions: Record<"ios" | "android" | "desktop", { title: string; steps: string[] }> = {
  ios: {
    title: "Instalar en iPhone / iPad",
    steps: [
      'Abrí esta página en Safari.',
      'Tocá el botón de compartir (⬆) en la barra inferior.',
      'Seleccioná "Agregar a pantalla de inicio".',
      'Confirmá tocando "Agregar".',
    ],
  },
  android: {
    title: "Instalar en Android",
    steps: [
      'Abrí esta página en Chrome.',
      'Tocá el menú (⋮) en la esquina superior derecha.',
      'Seleccioná "Agregar a pantalla de inicio" o "Instalar app".',
      'Confirmá la instalación.',
    ],
  },
  desktop: {
    title: "Instalar en escritorio",
    steps: [
      'Buscá el ícono de instalación (⊕) en la barra de direcciones de Chrome o Edge.',
      'Hacé clic en él y confirmá la instalación.',
      'Si no aparece, el navegador podría no admitir instalación de PWA.',
    ],
  },
};

export function PwaInstallDialog({ platform, open, onClose }: Props) {
  const { title, steps } = instructions[platform];
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Seguí estos pasos para instalar Mi Tienda Segura.</DialogDescription>
        </DialogHeader>
        <ol className="mt-2 space-y-2 text-sm text-foreground">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 font-medium text-muted-foreground">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
