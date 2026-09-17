export function Brand() {
  return (
    <div className="brand">
      <svg className="brand-mark" width="30" height="30" viewBox="0 0 96 96" aria-hidden="true">
        <rect width="96" height="96" rx="27" fill="#1F7A5C" />
        {/* Типографская засечковая Z — как фирменный шрифт Fraunces; в favicon тот же знак системной гарнитурой */}
        <text
          x="48"
          y="69"
          fontFamily="var(--font-fraunces), Georgia, 'Times New Roman', serif"
          fontSize="60"
          fontWeight="600"
          fill="#fff"
          textAnchor="middle"
        >
          Z
        </text>
      </svg>
      Zori
    </div>
  );
}
