import { OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { InvalidWebhookSignatureError, WebhookSignatureValidator } from "mercadopago";
import { env } from "../config/env";
import { AppError } from "../errors/AppError";
import { mercadoPagoPayment } from "../lib/mercadoPago";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/asyncHandler";
import { consumeReservation, releaseReservation, returnConsumedInventory } from "../services/inventory";

export const paymentsRouter = Router();
const webhookLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.WEBHOOK_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
});

function paymentStatus(status?: string): PaymentStatus {
  if (status === "approved") return PaymentStatus.APPROVED;
  if (status === "rejected") return PaymentStatus.REJECTED;
  if (status === "refunded" || status === "charged_back") return PaymentStatus.REFUNDED;
  if (status === "cancelled") return PaymentStatus.FAILED;
  return PaymentStatus.PENDING;
}

function orderStatus(status?: string): OrderStatus {
  if (status === "approved") return OrderStatus.PAID;
  if (status === "refunded" || status === "charged_back") return OrderStatus.REFUNDED;
  if (status === "cancelled" || status === "rejected") return OrderStatus.CANCELLED;
  return OrderStatus.PENDING;
}

paymentsRouter.post("/webhook", webhookLimiter, asyncHandler(async (req, res) => {
  const dataId = typeof req.query["data.id"] === "string" ? req.query["data.id"].toLowerCase() : "";
  const xSignature = req.header("x-signature") || "";
  const xRequestId = req.header("x-request-id") || "";

  try {
    WebhookSignatureValidator.validate({ xSignature, xRequestId, dataId, secret: env.MERCADO_PAGO_WEBHOOK_SECRET });
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) throw new AppError(401, "Firma de webhook inválida");
    throw error;
  }

  if (req.body?.type !== "payment" || !dataId) return res.sendStatus(200);

  const remotePayment = await mercadoPagoPayment.get({ id: dataId });
  const orderId = remotePayment.external_reference;
  if (!orderId) return res.sendStatus(200);

  const rawResponse = JSON.parse(JSON.stringify(remotePayment)) as Prisma.InputJsonValue;

  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { payment: true } });
    if (!order?.payment) return;

    const amountMatches = Number(remotePayment.transaction_amount) === order.total;
    const currencyMatches = !remotePayment.currency_id || remotePayment.currency_id === order.currency;
    const verified = amountMatches && currencyMatches;
    const nextPaymentStatus = verified ? paymentStatus(remotePayment.status) : PaymentStatus.FAILED;
    const nextOrderStatus = verified ? orderStatus(remotePayment.status) : OrderStatus.PENDING;

    if (verified && remotePayment.status === "approved") {
      await consumeReservation(tx, orderId);
    } else if (verified && ["rejected", "cancelled"].includes(remotePayment.status || "")) {
      await releaseReservation(tx, orderId, `Pago ${remotePayment.status}`);
    } else if (verified && ["refunded", "charged_back"].includes(remotePayment.status || "")) {
      await releaseReservation(tx, orderId, `Pago ${remotePayment.status}`);
      await returnConsumedInventory(tx, orderId, `Pago ${remotePayment.status}`);
    }

    await tx.payment.update({
      where: { orderId },
      data: {
        providerPaymentId: String(remotePayment.id),
        status: nextPaymentStatus,
        rawResponse,
      },
    });
    await tx.order.update({ where: { id: orderId }, data: { status: nextOrderStatus } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  res.sendStatus(200);
}));
