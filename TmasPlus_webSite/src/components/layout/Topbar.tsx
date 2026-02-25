import logo from "@/assets/Logo-v3.png";
type Props = {
  onToggleSidebar?: () => void;
};

export const Topbar: React.FC<Props> = ({ onToggleSidebar }) => (
  <header className="sticky top-0 z-40 h-14 flex items-center justify-between bg-sky-500 text-white px-4 shadow">
    <div className="flex items-center gap-3">
      <button
        aria-label="Abrir menú"
        onClick={onToggleSidebar}
        className="md:hidden rounded-xl px-2 py-1 bg-white/10 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <span className="font-semibold select-none">T+PLUS</span>
    </div>

    <div className="flex items-center gap-3">
      <img src={logo} alt="T+ Logo" className="w-10 h-10 mb-3" />
    </div>
  </header>
);
