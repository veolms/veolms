import crypto from "node:crypto";
import type { CartItemInput, CartResponse, CartItem } from "@veolms/contracts";
import type { Executor } from "../shared/repository.types.ts";
import { CommerceErrors } from "../shared/commerce.errors.ts";
import * as cartRepo from "./cart.repository.ts";
import * as courseRepo from "../../courses/course/course.repository.ts";
import * as bundleRepo from "../bundles/bundle.repository.ts";
import { createPricingService, type PricingService } from "../pricing/pricing.service.ts";

export interface CartService {
  getOrCreateCart(userId: string): Promise<{ id: string; user_id: string }>;
  getActiveCart(userId: string): Promise<CartResponse>;
  addItem(userId: string, item: CartItemInput): Promise<CartResponse>;
  removeItem(userId: string, itemId: string): Promise<CartResponse>;
  clearCart(userId: string): Promise<CartResponse>;
}

export function createCartService({
  database,
  pricingService = createPricingService({ database }),
}: {
  database: Executor;
  pricingService?: PricingService;
}): CartService {
  async function getOrCreateCart(userId: string) {
    let cart = await cartRepo.findCartByUserId(database, userId);
    if (!cart) {
      cart = await cartRepo.createCart(database, {
        id: crypto.randomUUID(),
        user_id: userId,
      });
    }
    return cart;
  }

  async function getActiveCart(userId: string): Promise<CartResponse> {
    const cart = await getOrCreateCart(userId);
    const rawItems = await cartRepo.listCartItemsByCartId(database, cart.id);

    if (rawItems.length === 0) {
      return {
        id: cart.id,
        userId,
        items: [],
        itemCount: 0,
        subtotalAmount: 0,
        currency: "INR",
        updatedAt: new Date(),
      };
    }

    const pricingInputs: CartItemInput[] = rawItems.map((it) => ({
      itemType: it.item_type,
      courseId: it.course_id ?? undefined,
      bundleId: it.bundle_id ?? undefined,
    }));

    // Attempt pricing — degrade gracefully if an item became unavailable.
    let pricingItems: Array<{ title: string; unitPrice: number }> = [];
    let subtotalAmount = 0;
    let currency = "INR";

    try {
      const { pricing } = await pricingService.calculatePricing({ userId, items: pricingInputs });
      pricingItems = pricing.items;
      subtotalAmount = pricing.subtotalAmount;
      currency = pricing.currency;
    } catch {
      // Pricing failed (e.g., a course was unpublished); show items at zero price.
      pricingItems = [];
    }

    const enrichedItems: CartItem[] = [];

    for (let i = 0; i < rawItems.length; i++) {
      const raw = rawItems[i]!;
      const calculated = pricingItems[i];

      let slug = "";
      let thumbnailMediaId: string | null | undefined = null;

      if (raw.item_type === "course" && raw.course_id) {
        const course = await courseRepo.findCourseById(database, raw.course_id);
        slug = course?.slug ?? "";
        thumbnailMediaId = course?.thumbnail_media_id;
      } else if (raw.item_type === "bundle" && raw.bundle_id) {
        const bundle = await bundleRepo.findBundleById(database, raw.bundle_id);
        slug = bundle?.slug ?? "";
        thumbnailMediaId = bundle?.thumbnail_media_id;
      }

      enrichedItems.push({
        id: raw.id,
        cartId: raw.cart_id,
        itemType: raw.item_type,
        courseId: raw.course_id,
        bundleId: raw.bundle_id,
        title: calculated?.title ?? "Course",
        slug,
        thumbnailMediaId,
        unitPrice: calculated?.unitPrice ?? 0,
        currency,
        createdAt: raw.created_at,
      });
    }

    return {
      id: cart.id,
      userId,
      items: enrichedItems,
      itemCount: enrichedItems.length,
      subtotalAmount,
      currency,
      updatedAt: new Date(),
    };
  }

  async function addItem(userId: string, item: CartItemInput): Promise<CartResponse> {
    const cart = await getOrCreateCart(userId);

    // 1. Check for duplicate cart item in student's active cart
    const existing = await cartRepo.findCartItem(database, {
      cart_id: cart.id,
      item_type: item.itemType,
      course_id: item.courseId,
      bundle_id: item.bundleId,
    });

    if (existing) {
      throw CommerceErrors.CART_ITEM_ALREADY_EXISTS();
    }

    // 2. Validate course/bundle purchasability and ownership via pricing engine
    await pricingService.calculatePricing({
      userId,
      items: [item],
    });

    // 3. Persist item to cart
    await cartRepo.insertCartItem(database, {
      id: crypto.randomUUID(),
      cart_id: cart.id,
      item_type: item.itemType,
      course_id: item.courseId,
      bundle_id: item.bundleId,
    });

    return await getActiveCart(userId);
  }

  async function removeItem(userId: string, itemId: string): Promise<CartResponse> {
    const cart = await getOrCreateCart(userId);
    const result = await cartRepo.deleteCartItem(database, cart.id, itemId);

    if (!result || Number(result.numDeletedRows ?? 0) === 0) {
      throw CommerceErrors.CART_ITEM_NOT_FOUND();
    }

    return await getActiveCart(userId);
  }

  async function clearCart(userId: string): Promise<CartResponse> {
    const cart = await getOrCreateCart(userId);
    await cartRepo.clearCartItems(database, cart.id);
    return await getActiveCart(userId);
  }

  return {
    getOrCreateCart,
    getActiveCart,
    addItem,
    removeItem,
    clearCart,
  };
}
