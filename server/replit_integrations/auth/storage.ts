import { users, licenses, type User, type UpsertUser } from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";

export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: { ...userData, updatedAt: new Date() },
      })
      .returning();

    const adminId = process.env.MASTER_ADMIN_ID;
    const isAdmin = !!adminId && user.id === adminId;

    if (isAdmin) {
      await db
        .insert(licenses)
        .values({ ownerId: user.id, status: "activa" })
        .onConflictDoUpdate({
          target: licenses.ownerId,
          set: { status: "activa", updatedAt: new Date() },
        });
    } else {
      await db
        .insert(licenses)
        .values({ ownerId: user.id, status: "pendiente" })
        .onConflictDoNothing();
    }

    return user;
  }
}

export const authStorage = new AuthStorage();
