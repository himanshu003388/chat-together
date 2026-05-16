import type { APIRoute } from "astro";
import { resendSchema } from "../../../utils/validation";
import { AuthService } from "../../../services/auth.service";
import { logger } from "../../../utils/logger";
import { AppError } from "../../../utils/errors";

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  try {
    const formData = await request.formData();
    const email = formData.get("email")?.toString();

    const validated = resendSchema.safeParse({ email });
    if (!validated.success) {
      return redirect(`/login?error=${encodeURIComponent(validated.error.issues[0].message)}`);
    }

    const authService = new AuthService(locals.supabase);
    await authService.resendConfirmation(validated.data.email);

    return redirect(`/login?message=Confirmation email resent. Please check your inbox.&email=${encodeURIComponent(validated.data.email)}`);
  } catch (err) {
    if (err instanceof AppError) {
      const email = (await request.clone().formData()).get("email")?.toString() || "";
      return redirect(`/login?error=${encodeURIComponent(err.message)}&email=${encodeURIComponent(email)}`);
    }
    logger.error(err, "Unexpected error in resend route");
    return redirect("/login?error=An unexpected error occurred");
  }
};
