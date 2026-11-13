import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { useState } from "preact/hooks"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "./ui/label"

const STORAGE_KEY = "popupShown"

const STEPS = [
    "Upload any file under 500MB.",
    "Save your retrieval code (we can't get it back for you).",
    "Retrieve it before it expires (up to 3 days).",
]

const readDismissed = () => {
    try {
        return localStorage.getItem(STORAGE_KEY) === 'true'
    } catch {
        return false
    }
}

export const BeginnerPopup = () => {
    const [open, setOpen] = useState(() => !readDismissed())
    const [dontShowAgain, setDontShowAgain] = useState(false)

    const handleChange = (checked: boolean | 'indeterminate') => {
        const value = checked === true
        setDontShowAgain(value)
        try {
            if (value) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(true))
            } else {
                localStorage.removeItem(STORAGE_KEY)
            }
        } catch {
            // Storage unavailable (private mode); the popup just shows again next time.
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent
                className="outline-hidden"
                onOpenAutoFocus={(event) => {
                    // Focus the sheet itself rather than ringing the first checkbox.
                    event.preventDefault();
                    (event.currentTarget as HTMLElement | null)?.focus();
                }}
            >
                <DialogHeader>
                    <DialogTitle>Welcome to Filedrop.</DialogTitle>
                    <DialogDescription className="text-sm">
                        The best solution for swift and uncomplicated file sharing between computers. Not for long-term storage.
                    </DialogDescription>
                </DialogHeader>
                {/* All three steps at once: nothing to swipe through on a phone. */}
                <ol className="space-y-3">
                    {STEPS.map((step, index) => (
                        <li key={step} className="flex items-start gap-3 text-sm">
                            <span
                                aria-hidden="true"
                                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground tabular-nums"
                            >
                                {index + 1}
                            </span>
                            <span className="pt-0.5">{step}</span>
                        </li>
                    ))}
                </ol>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <Checkbox
                            id="showagain"
                            checked={dontShowAgain}
                            onCheckedChange={handleChange}
                        />
                        <Label className="cursor-pointer py-2 text-sm font-medium leading-none" htmlFor="showagain">Don't show again</Label>
                    </div>
                    <DialogClose asChild>
                        <Button size="lg" className="w-full sm:w-auto">Got it</Button>
                    </DialogClose>
                </div>
            </DialogContent>
        </Dialog>
    )
}
