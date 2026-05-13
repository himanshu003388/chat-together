import { $ as $$Layout } from './Layout_C_TQ-mLw.mjs';
import { c as createComponent } from './astro-component_ChyAuDe0.mjs';
import 'piccolore';
import { Q as renderTemplate, z as maybeRenderHead, a3 as addAttribute } from './params-and-props_Bdc0UXF-.mjs';
import { r as renderComponent } from './entrypoint_CZzd4IbP.mjs';

const $$Login = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$Login;
  const user = Astro2.locals.user;
  if (user) {
    return Astro2.redirect("/chat");
  }
  const error = Astro2.url.searchParams.get("error");
  const message = Astro2.url.searchParams.get("message");
  const emailParam = Astro2.url.searchParams.get("email") || "";
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Log in - ChatApp" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="min-h-full flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8"> <div class="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-sm border border-gray-100"> <div> <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">
Sign in to your account
</h2> <p class="mt-2 text-center text-sm text-gray-600">
Welcome back!
</p> </div> ${error && renderTemplate`<div class="bg-red-50 border-l-4 border-red-400 p-4"> <p class="text-sm text-red-700">${error}</p> </div>`} ${message && renderTemplate`<div class="bg-green-50 border-l-4 border-green-400 p-4"> <p class="text-sm text-green-700">${message}</p> </div>`} ${(error?.includes("confirm") || message?.includes("confirm")) && emailParam && renderTemplate`<form action="/api/auth/resend" method="post" class="mt-2"> <input type="hidden" name="email"${addAttribute(emailParam, "value")}> <p class="text-sm text-gray-600">
Didn't receive the email?
<button type="submit" class="text-indigo-600 hover:text-indigo-500 font-medium ml-1">
Resend confirmation link
</button> </p> </form>`} <form class="mt-8 space-y-6" action="/api/auth/signin" method="post"> <div class="space-y-4"> <div> <label for="email-address" class="block text-sm font-medium text-gray-700">Email address</label> <input id="email-address" name="email" type="email" autocomplete="email" required class="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm" placeholder="you@example.com"> </div> <div> <label for="password" class="block text-sm font-medium text-gray-700">Password</label> <input id="password" name="password" type="password" autocomplete="current-password" required class="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm" placeholder="Password"> </div> </div> <div> <button type="submit" class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
Sign in
</button> </div> </form> <div class="text-center text-sm"> <a href="/signup" class="text-indigo-600 hover:text-indigo-500">Don't have an account? Sign up</a> </div> </div> </div> ` })}`;
}, "C:/Users/Jarvis/Desktop/New folder (2)/chat/src/pages/login.astro", void 0);

const $$file = "C:/Users/Jarvis/Desktop/New folder (2)/chat/src/pages/login.astro";
const $$url = "/login";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
	__proto__: null,
	default: $$Login,
	file: $$file,
	url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
