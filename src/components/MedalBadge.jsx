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
  none: 'No medal yet',
}

export function MedalBadge({ tier }) {
  const t = styles[tier] ? tier : 'none'
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[t]}`}
    >
      {labels[t]}
    </span>
  )
}
