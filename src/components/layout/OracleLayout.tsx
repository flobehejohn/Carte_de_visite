// src/components/layout/OracleLayout.tsx
import RitualWizard from '../oracle/RitualWizard';

function OracleLayout() {
  return (
    <main className="relative w-full h-full bg-black text-slate-200 overflow-hidden selection:bg-yellow-900 selection:text-white">
      {/* C'est RitualWizard qui contient la logique Orbital Container et la Scène 3D */}
      <RitualWizard />
    </main>
  );
}

export default OracleLayout;