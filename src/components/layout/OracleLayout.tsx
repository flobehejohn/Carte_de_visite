import RitualWizard from '../oracle/RitualWizard';

export default function OracleLayout() {
  return (
    <main className="relative w-full min-h-screen bg-[#020408] overflow-hidden selection:bg-amber-500/30">
      {/* Le RitualWizard possède désormais le monopole absolu de l'expérience (Live & E2E) */}
      <RitualWizard isE2E={false} />
    </main>
  );
}
