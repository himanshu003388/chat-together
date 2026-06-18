import type { APIRoute } from "astro";
import { signupSchema } from "../../../utils/validation";
import { AuthService } from "../../../services/auth.service";
import { logger } from "../../../utils/logger";
import { AppError } from "../../../utils/errors";

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  try {
    const formData = await request.formData();
    const email = formData.get("email")?.toString();
    const password = formData.get("password")?.toString();
    const username = formData.get("username")?.toString();

    const validated = signupSchema.safeParse({ email, password, username });
    if (!validated.success) {
      return redirect(`/signup?error=${encodeURIComponent(validated.error.issues[0].message)}`);
    }

    const authService = new AuthService(locals.supabase);
    const data = await authService.signUp(
      validated.data.email,
      validated.data.password,
      validated.data.username
    );

    // If session was returned, user is auto-logged in
    if (data.session) {
      logger.info({ email: validated.data.email }, "User signed up and logged in");
      return redirect("/");
    }

    // If no session, try signing in immediately (works if auto-confirm is enabled)
    try {
      await authService.signIn(validated.data.email, validated.data.password);
      logger.info({ email: validated.data.email }, "User signed up and logged in");
      return redirect("/");
    } catch {
      // Email confirmation required — tell user
      return redirect(`/login?message=Please check your email to confirm your account&email=${encodeURIComponent(validated.data.email)}`);
    }
  } catch (err) {
    if (err instanceof AppError) {
      return redirect(`/signup?error=${encodeURIComponent(err.message)}`);
    }
    logger.error(err, "Unexpected error in sign-up route");
    return redirect("/signup?error=An unexpected error occurred");
  }
};
