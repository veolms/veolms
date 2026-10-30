import type { CartItemType } from "@veolms/database";
import type { Executor } from "../shared/repository.types.ts";

export async function findCartByUserId(database: Executor, userId: string) {
  return await database
    .selectFrom("carts")
    .selectAll()
    .where("user_id", "=", userId)
    .executeTakeFirst();
}

export async function createCart(
  database: Executor,
  values: {
    id: string;
    user_id: string;
    created_at?: Date;
    updated_at?: Date;
  },
) {
  return await database
    .insertInto("carts")
    .values(values)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function listCartItemsByCartId(
  database: Executor,
  cartId: string,
) {
  return await database
    .selectFrom("cart_items")
    .selectAll()
    .where("cart_id", "=", cartId)
    .orderBy("created_at", "asc")
    .execute();
}

export async function findCartItem(
  database: Executor,
  params: {
    cart_id: string;
    item_type: CartItemType;
    course_id?: string | null;
    bundle_id?: string | null;
  },
) {
  let query = database
    .selectFrom("cart_items")
    .selectAll()
    .where("cart_id", "=", params.cart_id)
    .where("item_type", "=", params.item_type);

  if (params.course_id) {
    query = query.where("course_id", "=", params.course_id);
  }
  if (params.bundle_id) {
    query = query.where("bundle_id", "=", params.bundle_id);
  }

  return await query.executeTakeFirst();
}

export async function insertCartItem(
  database: Executor,
  values: {
    id: string;
    cart_id: string;
    item_type: CartItemType;
    course_id?: string | null;
    bundle_id?: string | null;
    created_at?: Date;
  },
) {
  return await database
    .insertInto("cart_items")
    .values(values)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function deleteCartItem(
  database: Executor,
  cartId: string,
  itemId: string,
) {
  return await database
    .deleteFrom("cart_items")
    .where("cart_id", "=", cartId)
    .where("id", "=", itemId)
    .executeTakeFirst();
}

export async function clearCartItems(database: Executor, cartId: string) {
  return await database
    .deleteFrom("cart_items")
    .where("cart_id", "=", cartId)
    .execute();
}

export async function removeItemsFromUserCart(
  database: Executor,
  userId: string,
  items: Array<{ course_id?: string | null; bundle_id?: string | null }>,
) {
  const cart = await findCartByUserId(database, userId);
  if (!cart || items.length === 0) return;

  const courseIds = items
    .map((it) => it.course_id)
    .filter((id): id is string => Boolean(id));

  const bundleIds = items
    .map((it) => it.bundle_id)
    .filter((id): id is string => Boolean(id));

  if (courseIds.length > 0) {
    await database
      .deleteFrom("cart_items")
      .where("cart_id", "=", cart.id)
      .where("item_type", "=", "course")
      .where("course_id", "in", courseIds)
      .execute();
  }

  if (bundleIds.length > 0) {
    await database
      .deleteFrom("cart_items")
      .where("cart_id", "=", cart.id)
      .where("item_type", "=", "bundle")
      .where("bundle_id", "in", bundleIds)
      .execute();
  }
}
