import GlassPanel from '@/components/journal/ui/GlassPanel';

export default function JournalLoading() {
  return (
    <div className="journal-page">
      <div className="journal-layout">
        <main className="journal-main">
          <GlassPanel as="section">
            <div className="foundation-card">
              <span className="metric-label">Loading</span>
              <span className="metric-value">Preparing journal shell...</span>
              <p>Fetching the journal route and rendering the current workspace.</p>
            </div>
          </GlassPanel>
        </main>
      </div>
    </div>
  );
}
