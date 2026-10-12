import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { selectCartCount, useCartStore } from '../store/cart';

export function Layout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const cartCount = useCartStore(selectCartCount);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/products');
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__inner">
          <NavLink to="/products" className="brand">
            <span className="brand__mark">AS</span>
            Atlas Supply Co.
          </NavLink>

          <nav className="nav">
            <NavLink to="/products" className="nav__link">
              Products
            </NavLink>

            {user?.role === 'customer' && (
              <NavLink to="/orders" className="nav__link">
                My Orders
              </NavLink>
            )}

            {user?.role === 'admin' && (
              <>
                <NavLink to="/admin/orders" className="nav__link">
                  Orders
                </NavLink>
                <NavLink to="/admin/products" className="nav__link">
                  Products
                </NavLink>
                <NavLink to="/admin/reports" className="nav__link">
                  Reports
                </NavLink>
              </>
            )}
          </nav>

          <div className="topbar__actions">
            {user ? (
              <>
                <NavLink to="/cart" className="nav__link nav__link--cart">
                  Cart{cartCount > 0 ? ` (${cartCount})` : ''}
                </NavLink>
                <span className="user-chip" title={user.email}>
                  {user.name}
                  <span className="user-chip__role">{user.role}</span>
                </span>
                <button className="btn btn--ghost btn--sm" onClick={handleLogout}>
                  Log out
                </button>
              </>
            ) : (
              <>
                <NavLink to="/cart" className="nav__link nav__link--cart">
                  Cart{cartCount > 0 ? ` (${cartCount})` : ''}
                </NavLink>
                <NavLink to="/login" className="btn btn--ghost btn--sm">
                  Sign in
                </NavLink>
                <NavLink to="/register" className="btn btn--primary btn--sm">
                  Register
                </NavLink>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>

      <footer className="footer">
        Inventory &amp; Orders — assessment build (NestJS · React · Go)
      </footer>
    </div>
  );
}
