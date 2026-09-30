import Image from 'next/image';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/oncocare-brandmark.png"
      alt=""
      aria-hidden="true"
      width={64}
      height={64}
      className={cn('object-contain', className)}
    />
  );
}

export function Logo({
  iconBoxSize = 'h-9 w-9',
  iconSize = 'h-8 w-8',
  textSize = 'text-lg',
  textClassName = 'text-slate-900',
  className,
}: {
  iconBoxSize?: string;
  iconSize?: string;
  textSize?: string;
  textClassName?: string;
  className?: string;
}) {
  const t = useTranslations('components.shared.logo');
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div className={cn('flex shrink-0 items-center justify-center', iconBoxSize)}>
        <LogoMark className={iconSize} />
      </div>
      <span className={cn(textSize, 'font-bold tracking-tight', textClassName)}>
        {t('oncocare')}<span className="text-emerald-deep">+</span>
      </span>
    </div>
  );
}