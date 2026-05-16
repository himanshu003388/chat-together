import type { APIRoute } from "astro";
import { loginSchema } from "../../../utils/validation";
import { AuthService } from "../../../services/auth.service";
import { logger } from "../../../utils/logger";
import { AppError } from "../../../utils/errors";

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  try {
    const formData = await request.formData();
    const email = formData.get("email")?.toString();
    const password = formData.get("password")?.toString();

    const validated = loginSchema.safeParse({ email, password });
    if (!validated.success) {
      return redirect(`/login?error=${encodeURIComponent(validated.error.issues[0].message)}`);
    }

    const authService = new AuthService(locals.supabase);
    await authService.signIn(validated.data.email, validated.data.password);

    logger.info({ email: validated.data.email }, "User signed in");
    return redirect("/");
  } catch (err) {
    if (err instanceof AppError) {
      const msg = err.message.toLowerCase();
      if (msg.includes('confirm your email')) {
        const formData = await request.clone().formData();
        const email = formData.get("email")?.toString();
        return redirect(`/login?error=${encodeURIComponent(err.message)}&email=${encodeURIComponent(email || '')}`);
      }
      return redirect(`/login?error=${encodeURIComponent(err.message)}`);
    }
    logger.error(err, "Unexpected error in sign-in route");
    return redirect("/login?error=An unexpected error occurred");
  }
};
