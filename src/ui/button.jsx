import * as React from 'react';

const BASE_CLASSES = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-[3px]';

const VARIANT_CLASSES = Object.freeze({
    default: 'bg-primary text-primary-foreground hover:bg-primary/90',
    destructive: 'bg-destructive text-white hover:bg-destructive/90',
    outline: 'border bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    link: 'text-primary underline-offset-4 hover:underline',
});

const SIZE_CLASSES = Object.freeze({
    default: 'h-9 px-4 py-2 has-[>svg]:px-3',
    sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5',
    lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
    icon: 'size-9',
});

const joinClassNames = (...classNames) => classNames.filter(Boolean).join(' ');

const buttonVariants = ({ variant = 'default', size = 'default', className = '' } = {}) => (
    joinClassNames(
        BASE_CLASSES,
        VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.default,
        SIZE_CLASSES[size] ?? SIZE_CLASSES.default,
        className,
    )
);

function Button({
    className,
    variant = 'default',
    size = 'default',
    asChild = false,
    children,
    ...props
}) {
    const resolvedClassName = buttonVariants({ variant, size, className });

    if (asChild && React.isValidElement(children)) {
        return React.cloneElement(children, {
            ...props,
            'data-slot': 'button',
            className: joinClassNames(children.props.className, resolvedClassName),
        });
    }

    return (
        <button data-slot="button" className={resolvedClassName} {...props}>
            {children}
        </button>
    );
}

export { Button };
