export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <h2 style={{ color: 'var(--text)', marginBottom: 8 }}>{title}</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
        Ez az oldal a következő fázisban kerül migrálásra.
      </p>
    </div>
  );
}
