import { create } from "zustand";
import { persist } from "zustand/middleware";

type Product = {
  id: string;
  slug: string;
  name: string;
  category: string;
  price: number;
  oldPrice?: number | null;
  badge?: string | null;
  description: string;
  imageUrl?: string | null;
  availableStock?: number;
};

type CartItem = Product & {
  quantity: number;
};

type CartStore = {
  items: CartItem[];
  addItem: (product: Product) => void;
  removeItem: (id: string) => void;
  increaseItem: (id: string) => void;
  decreaseItem: (id: string) => void;
  clearCart: () => void;
};

export const useCartStore = create<CartStore>()(
  persist(
    (set) => ({
      items: [],

      addItem: (product) =>
        set((state) => {
          if ((product.availableStock ?? 0) <= 0) return state;
          const exists = state.items.find((item) => item.id === product.id);

          if (exists) {
            if (exists.quantity >= (product.availableStock ?? 0)) return state;
            return {
              items: state.items.map((item) =>
                item.id === product.id
                  ? { ...item, quantity: item.quantity + 1 }
                  : item
              ),
            };
          }

          return {
            items: [...state.items, { ...product, quantity: 1 }],
          };
        }),

      removeItem: (id) =>
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        })),

      increaseItem: (id) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id && item.quantity < (item.availableStock ?? 0) ? { ...item, quantity: item.quantity + 1 } : item
          ),
        })),

      decreaseItem: (id) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? { ...item, quantity: Math.max(1, item.quantity - 1) }
              : item
          ),
        })),

      clearCart: () => set({ items: [] }),
    }),
    {
      name: "magno-clean-cart",
    }
  )
);
