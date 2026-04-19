import clsx from "clsx";

export type ToastKind = "success" | "bad-score" | "combo" | "next-round";

export type Toast = {
    id: number;
    kind: ToastKind;
    message: string;
    exiting: boolean;
};

const kindStyles: Record<
    ToastKind,
    { bg: string; enter: string; emoji: string }
> = {
    success: {
        bg: "bg-emerald-500",
        enter: "animate-toast-success",
        emoji: "🎯",
    },
    "bad-score": { bg: "bg-red-400", enter: "animate-toast-bad", emoji: "😬" },
    combo: { bg: "bg-amber-500", enter: "animate-toast-combo", emoji: "🔥" },
    "next-round": {
        bg: "bg-[#34b9c3]",
        enter: "animate-toast-enter",
        emoji: "→",
    },
};

function ToastItem({ toast }: { toast: Toast }) {
    const style = kindStyles[toast.kind];

    return (
        <div
            className={clsx(
                "px-5 py-3 rounded-2xl font-bold text-white shadow-xl text-sm",
                "min-w-55 max-w-[320px] text-center select-none",
                style.bg,
                toast.exiting ? "animate-toast-exit" : style.enter,
            )}
        >
            {toast.message}
        </div>
    );
}

export function GameToastStack({ toasts }: { toasts: Toast[] }) {
    return (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2 pointer-events-none">
            {toasts.map((t) => (
                <ToastItem key={t.id} toast={t} />
            ))}
        </div>
    );
}
