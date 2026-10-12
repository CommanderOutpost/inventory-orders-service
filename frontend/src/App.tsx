import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute, RoleRoute } from './components/ProtectedRoute';
import { Toaster } from './components/Toaster';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ProductsPage } from './pages/ProductsPage';
import { CartPage } from './pages/CartPage';
import { MyOrdersPage } from './pages/MyOrdersPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { AdminProductsPage } from './pages/admin/AdminProductsPage';
import { AdminOrdersPage } from './pages/admin/AdminOrdersPage';
import { AdminReportsPage } from './pages/admin/AdminReportsPage';
import { useAuthStore } from './store/auth';

export default function App() {
  const user = useAuthStore((s) => s.user);

  return (
    <>
      <Toaster />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route element={<Layout />}>
          <Route index element={<ProductsPage />} />
          <Route path="/products" element={<ProductsPage />} />

          {/* Cart is viewable by guests; the CartPage prompts sign-in at checkout. */}
          <Route path="/cart" element={<CartPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<RoleRoute allowedRoles={['customer']} />}>
              <Route path="/orders" element={<MyOrdersPage />} />
              <Route path="/orders/:id" element={<OrderDetailPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route element={<RoleRoute allowedRoles={['admin']} />}>
              <Route path="/admin/products" element={<AdminProductsPage />} />
              <Route path="/admin/orders" element={<AdminOrdersPage />} />
              <Route path="/admin/reports" element={<AdminReportsPage />} />
            </Route>
          </Route>

          {/* Fallbacks */}
          <Route path="/admin" element={<Navigate to="/admin/orders" replace />} />
          <Route
            path="*"
            element={
              <Navigate
                to={user ? (user.role === 'admin' ? '/admin/orders' : '/products') : '/products'}
                replace
              />
            }
          />
        </Route>
      </Routes>
    </>
  );
}
