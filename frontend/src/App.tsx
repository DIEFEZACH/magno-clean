import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
const PublicLayout = lazy(() => import("./components/layout/PublicLayout").then(m => ({ default: m.PublicLayout })));
const AdminLayout = lazy(() => import("./components/admin/AdminLayout").then(m => ({ default: m.AdminLayout })));
const AdminRoute = lazy(() => import("./components/admin/AdminRoute").then(m => ({ default: m.AdminRoute })));
const page = <T extends Record<string, unknown>>(loader: () => Promise<T>, name: keyof T) => lazy(async () => ({ default: (await loader())[name] as React.ComponentType }));
const Home=page(()=>import("./pages/Home"),"Home"), Products=page(()=>import("./pages/Products"),"Products"), ProductDetail=page(()=>import("./pages/ProductDetail"),"ProductDetail"), Categories=page(()=>import("./pages/Categories"),"Categories"), About=page(()=>import("./pages/About"),"About"), Support=page(()=>import("./pages/Support"),"Support"), Contact=page(()=>import("./pages/Contact"),"Contact"), Cart=page(()=>import("./pages/Cart"),"Cart"), NotFound=page(()=>import("./pages/NotFound"),"NotFound"), Checkout=page(()=>import("./pages/Checkout"),"Checkout");
const CheckoutResult = lazy(() => import("./pages/CheckoutResult").then(m => ({ default: m.CheckoutResult }))) as React.LazyExoticComponent<React.ComponentType<{ kind: "success" | "error" | "pending" }>>;
const LegalPage = lazy(() => import("./pages/LegalPage").then(m => ({ default: m.LegalPage }))) as React.LazyExoticComponent<React.ComponentType<{ kind: "privacy" | "terms" | "returns" }>>;
const AdminLogin=page(()=>import("./pages/AdminLogin"),"AdminLogin"), AdminDashboard=page(()=>import("./pages/AdminDashboard"),"AdminDashboard"), AdminOrders=page(()=>import("./pages/AdminOrders"),"AdminOrders"), AdminOrderDetail=page(()=>import("./pages/AdminOrderDetail"),"AdminOrderDetail"), AdminCustomers=page(()=>import("./pages/AdminCustomers"),"AdminCustomers"), AdminCustomerDetail=page(()=>import("./pages/AdminCustomerDetail"),"AdminCustomerDetail"), AdminProducts=page(()=>import("./pages/AdminProducts"),"AdminProducts"), AdminProductEdit=page(()=>import("./pages/AdminProductEdit"),"AdminProductEdit"), AdminProductFamilies=page(()=>import("./pages/AdminProductFamilies"),"AdminProductFamilies"), AdminInventory=page(()=>import("./pages/AdminInventory"),"AdminInventory"), AdminSettings=page(()=>import("./pages/AdminSettings"),"AdminSettings"), AdminContent=page(()=>import("./pages/AdminContent"),"AdminContent");
const AdminContentEditor = lazy(() => import("./pages/AdminContentEditor").then(m => ({ default: m.AdminContentEditor }))) as React.LazyExoticComponent<React.ComponentType<{ type: "family" | "product" }>>;

export default function App() {
  return (
    <BrowserRouter>
      <div
        className="min-h-screen bg-white text-[#111111]"
        style={{
          fontFamily: "Montserrat, Inter, system-ui, sans-serif",
        }}
      >
          <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#F5F5F5]" role="status"><div className="h-12 w-12 animate-spin rounded-full border-4 border-[#19A2B6]/20 border-t-[#19A2B6]"/><span className="sr-only">Cargando página</span></div>}><Routes>
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
              <Route index element={<AdminDashboard />} />
              <Route path="orders" element={<AdminOrders />} />
              <Route path="orders/:id" element={<AdminOrderDetail />} />
              <Route path="customers" element={<AdminCustomers />} />
              <Route path="customers/:email" element={<AdminCustomerDetail />} />
              <Route path="products" element={<AdminProducts />} />
              <Route path="products/:id/edit" element={<AdminProductEdit />} />
              <Route path="product-families" element={<AdminProductFamilies />} />
              <Route path="content" element={<AdminContent />} />
              <Route path="content/families/:familyId" element={<AdminContentEditor type="family" />} />
              <Route path="content/products/:productId" element={<AdminContentEditor type="product" />} />
              <Route path="inventory" element={<AdminInventory />} />
              <Route path="settings" element={<AdminSettings />} />
            </Route>
            <Route element={<PublicLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/productos" element={<Products />} />
              <Route path="/producto/:slug" element={<ProductDetail />} />
              <Route path="/categorias" element={<Categories />} />
              <Route path="/nosotros" element={<About />} />
              <Route path="/soporte" element={<Support />} />
              <Route path="/contacto" element={<Contact />} />
              <Route path="/privacidad" element={<LegalPage kind="privacy" />} />
              <Route path="/terminos" element={<LegalPage kind="terms" />} />
              <Route path="/devoluciones" element={<LegalPage kind="returns" />} />
              <Route path="/carrito" element={<Cart />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/checkout/success" element={<CheckoutResult kind="success" />} />
              <Route path="/checkout/error" element={<CheckoutResult kind="error" />} />
              <Route path="/checkout/pending" element={<CheckoutResult kind="pending" />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes></Suspense>
      </div>
    </BrowserRouter>
  );
}
