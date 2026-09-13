// Drop-in React component: swaps light/dark lockups with Tailwind's `dark:` class.
// Files expected in /public/brand/: dalil-lockup-en.svg, dalil-lockup-en-dark.svg, dalil-mark.svg, dalil-mark-dark.svg
export function DalilLogo({ variant = "lockup", className = "h-8" }: { variant?: "lockup" | "icon"; className?: string }) {
  const base = variant === "icon" ? "/brand/dalil-mark" : "/brand/dalil-lockup-en";
  return (
    <>
      <img src={`${base}.svg`} alt="Dalil" className={`${className} dark:hidden`} />
      <img src={`${base}-dark.svg`} alt="Dalil" className={`${className} hidden dark:block`} />
    </>
  );
}
