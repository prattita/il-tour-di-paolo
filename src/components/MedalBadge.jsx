const styles = {
  gold: 'bg-[#FAEEDA] text-[#633806]',
  silver: 'bg-[#D3D1C7] text-[#2C2C2A]',
  bronze: 'bg-[#F5C4B3] text-[#4A1B0C]',
  none: 'bg-[#f5f5f3] text-[#9b9b96]',
}

const labels = {
  gold: 'Gold',
  silver: 'Silver',
  bronze: 'Bronze',
  none: 'No medal',
}

const sizeClasses = {
  default: 'px-2 py-0.5 text-[11px]',
  sm: 'px-1.5 py-px text-[10px] leading-tight',
}

export function MedalBadge({ tier, size = 'default', className = '' }) {
  const t = styles[tier] ? tier : 'none'
  const sz = sizeClasses[size] ?? sizeClasses.default
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-medium ${sz} ${styles[t]} ${className}`.trim()}
    >
      {labels[t]}
    </span>
  )
}
