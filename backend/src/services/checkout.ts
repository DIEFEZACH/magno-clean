import { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "../errors/AppError";
import { env, frontendOrigin } from "../config/env";
import { mercadoPagoPreference } from "../lib/mercadoPago";
import { reserveInventory } from "./inventory";

type CheckoutInput = {
  customer: {
    fullName: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  items: Array<{ id: string; quantity: number }>;
};

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function checkoutResponse(order: {
  id: string;
  payment: { providerPreferenceId: string | null; rawResponse: Prisma.JsonValue | null } | null;
}) {
  const raw = order.payment?.rawResponse as { init_point?: string; sandbox_init_point?: string } | null;
  return {
    preferenceId: order.payment?.providerPreferenceId,
    orderId: order.id,
    initPoint: raw?.init_point || raw?.sandbox_init_point || null,
  };
}

export async function createCheckout(
  prisma: PrismaClient,
  input: CheckoutInput,
  idempotencyKey: string,
) {
  const existing = await prisma.order.findUnique({
    where: { idempotencyKey },
    include: { payment: true },
  });
  if (existing) return checkoutResponse(existing);

  const quantities = new Map<string, number>();
  for (const item of input.items) {
    const quantity = (quantities.get(item.id) || 0) + item.quantity;
    if (quantity > env.MAX_ITEM_QUANTITY) throw new AppError(400, `La cantidad máxima por producto es ${env.MAX_ITEM_QUANTITY}`);
    quantities.set(item.id, quantity);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: { id: { in: [...quantities.keys()] }, active: true },
        select: { id: true, name: true, code: true, price: true },
      });
      if (products.length !== quantities.size) throw new AppError(400, "Uno o más productos no existen o no están activos");

      const items = products.map((product) => {
        const quantity = quantities.get(product.id)!;
        return { productId: product.id, productName: product.name, productCode: product.code, quantity, unitPrice: product.price, subtotal: product.price * quantity };
      });
      const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
      const shipping = 0;
      const discount = 0;
      const tax = 0;
      const total = subtotal + shipping + tax - discount;
      const order = await tx.order.create({
        data: {
          idempotencyKey,
          customerName: input.customer.fullName,
          customerEmail: input.customer.email,
          customerPhone: input.customer.phone,
          shippingAddress: input.customer.address,
          city: input.customer.city,
          state: input.customer.state,
          postalCode: input.customer.zipCode,
          country: input.customer.country,
          subtotal, shipping, discount, tax, total,
          currency: env.DEFAULT_CURRENCY,
          items: { create: items },
          payment: { create: { provider: "MERCADO_PAGO" } },
        },
      });

      const expiresAt = new Date(Date.now() + env.INVENTORY_RESERVATION_MINUTES * 60_000);
      await reserveInventory(tx, order.id, items, expiresAt);

      const baseUrl = frontendOrigin.replace(/\/$/, "");
      const supportsAutomaticReturn = baseUrl.startsWith("https://");
      const preference = await mercadoPagoPreference.create({
        body: {
          external_reference: order.id,
          items: items.map((item) => ({
            id: item.productId,
            title: item.productName,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            currency_id: env.DEFAULT_CURRENCY,
          })),
          payer: { name: input.customer.fullName, email: input.customer.email, phone: { number: input.customer.phone } },
          back_urls: {
            success: `${baseUrl}/checkout/success?orderId=${order.id}`,
            failure: `${baseUrl}/checkout/error?orderId=${order.id}`,
            pending: `${baseUrl}/checkout/pending?orderId=${order.id}`,
          },
          auto_return: supportsAutomaticReturn ? "approved" : undefined,
          notification_url: env.API_PUBLIC_URL ? `${env.API_PUBLIC_URL.replace(/\/$/, "")}/api/payments/webhook` : undefined,
        },
        requestOptions: { idempotencyKey },
      });
      if (!preference.id) throw new AppError(502, "Mercado Pago no devolvió un identificador de preferencia");

      const payment = await tx.payment.update({
        where: { orderId: order.id },
        data: { providerPreferenceId: preference.id, rawResponse: asJson(preference) },
      });
      return checkoutResponse({ id: order.id, payment });
    }, { maxWait: 10000, timeout: 30000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.order.findUnique({ where: { idempotencyKey }, include: { payment: true } });
      if (duplicate?.payment?.providerPreferenceId) return checkoutResponse(duplicate);
    }
    throw error;
  }
}
