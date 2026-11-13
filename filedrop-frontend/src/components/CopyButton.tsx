import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { Check, Copy } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { copyText } from '@/lib/transfer';
import { cn } from '@/lib/utils';

const swap = 'absolute inset-0 transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)]';
const shown = 'opacity-100 scale-100 blur-none';
const hidden = 'opacity-0 scale-25 blur-xs';

interface CopyButtonProps extends Omit<ButtonProps, 'value' | 'children'> {
    value: string;
    /** Accessible name; also what the button says when it has no visible text. */
    label: string;
    children?: ComponentChildren;
}

/** Copies on tap and confirms in place (icon + label), so no toast has to cover the screen. */
export function CopyButton({ value, label, children, className, ...props }: CopyButtonProps) {
    const [copied, setCopied] = useState(false);
    const timer = useRef<number>();
    const { toast } = useToast();

    useEffect(() => () => window.clearTimeout(timer.current), []);

    const handleClick = async () => {
        if (await copyText(value)) {
            setCopied(true);
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => setCopied(false), 1600);
        } else {
            toast({ title: 'Could not copy', description: 'Select the text and copy it manually.', variant: 'destructive' });
        }
    };

    return (
        <Button
            type="button"
            className={cn(className)}
            aria-label={children ? undefined : copied ? 'Copied' : label}
            onClick={handleClick}
            {...props}
        >
            <span className="relative inline-flex size-4" aria-hidden="true">
                <Copy className={cn(swap, 'size-4', copied ? hidden : shown)} />
                <Check className={cn(swap, 'size-4', copied ? shown : hidden)} />
            </span>
            {children && <span aria-live="polite">{copied ? 'Copied' : children}</span>}
        </Button>
    );
}
