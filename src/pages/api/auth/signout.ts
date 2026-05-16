import type { APIRoute } from "astro";
import { AuthService } from "../../../services/auth.service";
import { logger } from "../../../utils/logger";

export const POST: APIRoute = async ({ locals, redirect }) => {
  try {
    const authService = new AuthService(locals.supabase);
    await authService.signOut();
    logger.info("User signed out");
  } catch (err) {
    logger.error(err, "Sign-out error");
  }
  return redirect("/login");
};
