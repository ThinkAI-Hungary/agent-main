import { useAuth } from '../../context/AuthContext';

export default function MainHeader() {
  const { user } = useAuth();

  const fullName = user?.fullName || user?.username || 'Admin';
  const firstName = fullName.split(' ').pop() || fullName;

  const now = new Date();
  const days = ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat'];
  const months = [
    'január', 'február', 'március', 'április', 'május', 'június',
    'július', 'augusztus', 'szeptember', 'október', 'november', 'december',
  ];
  const dateStr = `${now.getFullYear()}. ${months[now.getMonth()]} ${now.getDate()}., ${days[now.getDay()]}`;

  return (
    <div className="greeting-bar" id="greeting-bar">
      <div>
        <div className="greeting-text" id="greeting-text">
          Szia, <strong>{firstName}</strong>!
        </div>
        <div className="greeting-date" id="greeting-date">
          {dateStr}
          {user?.tenantName && (
            <span style={{ marginLeft: 10, padding: '2px 8px', background: '#e0f2fe', color: '#0369a1', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
              {user.tenantName}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
