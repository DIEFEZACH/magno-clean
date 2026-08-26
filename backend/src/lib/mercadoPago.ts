import { MercadoPagoConfig, Payment, Preference } from "mercadopago";
import { env } from "../config/env";

const client = new MercadoPagoConfig({
  accessToken: env.MERCADO_PAGO_ACCESS_TOKEN,
  options: { timeout: 10000 },
});

export const mercadoPagoPreference = new Preference(client);
export const mercadoPagoPayment = new Payment(client);
