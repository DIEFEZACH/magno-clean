import { useQuery } from "@tanstack/react-query";
import { API_URL } from "../lib/config";

type CheckoutStatus = {
  checkoutEnabled: boolean;
};

export function useCheckoutAvailability() {
  const query = useQuery({
    queryKey: ["checkout-status"],
    queryFn: async () => {
      const response = await fetch(`${API_URL}/api/checkout/status`);
      if (!response.ok) throw new Error("No se pudo consultar la disponibilidad del checkout");
      return response.json() as Promise<CheckoutStatus>;
    },
    staleTime: 30_000,
  });

  return {
    checkoutEnabled: query.data?.checkoutEnabled === true,
    loading: query.isLoading,
    unavailable: query.isError,
  };
}
