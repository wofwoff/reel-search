import Icon from "./Icon";

type BottomNavProps = {
  searching: boolean;
  onHome: () => void;
  onSearch: () => void;
  onSave: () => void;
  onDevices: () => void;
};

/** Phone-only tab bar; hidden on wide screens by CSS. */
export default function BottomNav({ searching, onHome, onSearch, onSave, onDevices }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Main">
      <button type="button" className="bottom-nav__item" aria-label="Home" aria-current={searching ? undefined : "page"} onClick={onHome}>
        <Icon name="home" size={26} />
      </button>
      <button type="button" className="bottom-nav__item" aria-label="Search" aria-current={searching ? "page" : undefined} onClick={onSearch}>
        <Icon name="search" size={26} />
      </button>
      <button type="button" className="bottom-nav__item" aria-label="Save a reel" onClick={onSave}>
        <Icon name="plus" size={26} />
      </button>
      <button type="button" className="bottom-nav__item" aria-label="Devices" onClick={onDevices}>
        <Icon name="devices" size={26} />
      </button>
    </nav>
  );
}
