import { useAuth } from '../../context/AuthContext';

export default function MainHeader() {
  const { user } = useAuth();

  const fullName = user?.fullName || user?.username || 'Admin';
  const firstName = fullName.split(' ').pop() || fullName;

  const now = new Date();
  const days = ['vas\u00e1rnap', 'h\u00e9tf\u0151', 'kedd', 'szerda', 'cs\u00fct\u00f6rt\u00f6k', 'p\u00e9ntek', 'szombat'];
  const months = [
    'janu\u00e1r', 'febru\u00e1r', 'm\u00e1rcius', '\u00e1prilis', 'm\u00e1jus', 'j\u00fanius',
    'j\u00falius', 'augusztus', 'szeptember', 'okt\u00f3ber', 'november', 'december',
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
        </div>
      </div>
    </div>
  );
}
