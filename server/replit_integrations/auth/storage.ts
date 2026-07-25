import { users, licenses, tenants, profiles, type User, type UpsertUser } from "@shared/schema";
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
      // MASTER_ADMIN_ID siempre tiene licencia "permanente" en la DB.
      // El bypass en /api/license/status y checkLicense ya cubre casos de
      // datos inconsistentes, pero mantener la fila coherente es correcto.
      await db
        .insert(licenses)
        .values({ ownerId: user.id, status: "permanente" })
        .onConflictDoUpdate({
          target: licenses.ownerId,
          set: { status: "permanente", updatedAt: new Date() },
        });
    } else {
      await db
        .insert(licenses)
        .values({ ownerId: user.id, status: "pendiente" })
        .onConflictDoNothing();
    }

    await this.ensureProfileAndTenant(user, userData);

    return user;
  }

  private async ensureProfileAndTenant(user: User, userData: UpsertUser): Promise<void> {
    const [existing] = await db
      .select({ id: profiles.id, tenantId: profiles.tenantId })
      .from(profiles)
      .where(eq(profiles.id, user.id));

    if (existing && existing.tenantId) return;

    const tenantName =
      [userData.firstName, userData.lastName].filter(Boolean).join(" ").trim() ||
      userData.email ||
      "Mi Negocio";

    const [newTenant] = await db
      .insert(tenants)
      .values({ name: tenantName, ownerId: user.id })
      .returning();

    if (existing) {
      await db
        .update(profiles)
        .set({ tenantId: newTenant.id, updatedAt: new Date() })
        .where(eq(profiles.id, user.id));
    } else {
      await db
        .insert(profiles)
        .values({ id: user.id, tenantId: newTenant.id, role: "owner" })
        .onConflictDoNothing();
    }
  }
}

export const authStorage = new AuthStorage();
