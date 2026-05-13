import { $ as $$Layout } from './Layout_C_TQ-mLw.mjs';
import { c as createComponent } from './astro-component_ChyAuDe0.mjs';
import 'piccolore';
import { Q as renderTemplate, z as maybeRenderHead } from './params-and-props_Bdc0UXF-.mjs';
import { r as renderComponent } from './entrypoint_CY5oGq1D.mjs';

const $$Signup = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$Signup;
  const user = Astro2.locals.user;
  if (user) {
    return Astro2.redirect("/chat");
  }
  const error = Astro2.url.searchParams.get("error");
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Sign up - ChatApp" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="min-h-full flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8"> <div class="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-sm border border-gray-100"> <div> <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">
Create a new account
</h2> <p class="mt-2 text-center text-sm text-gray-600">
Join our chat community
</p> </div> ${error && renderTemplate`<div class="bg-red-50 border-l-4 border-red-400 p-4"> <p class="text-sm text-red-700">${error}</p> </div>`} <form class="mt-8 space-y-6" action="/api/auth/signup" method="post"> <div class="space-y-4"> <div> <label for="username" class="block text-sm font-medium text-gray-700">Username</label> <input id="username" name="username" type="text" autocomplete="username" required minlength="3" maxlength="30" pattern="[a-zA-Z0-9_]+" class="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm" placeholder="Username (3-30 characters)"> <p class="mt-1 text-xs text-gray-500">Letters, numbers, and underscores only</p> </div> <div> <label for="email-address" class="block text-sm font-medium text-gray-700">Email address</label> <input id="email-address" name="email" type="email" autocomplete="email" required class="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm" placeholder="you@example.com"> </div> <div> <label for="password" class="block text-sm font-medium text-gray-700">Password</label> <input id="password" name="password" type="password" autocomplete="new-password" required minlength="8" class="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm" placeholder="Password (min 8 characters)"> </div> </div> <div> <button type="submit" class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
Sign up
</button> </div> </form> <div class="text-center text-sm"> <a href="/login" class="text-indigo-600 hover:text-indigo-500">Already have an account? Sign in</a> </div> </div> </div> ` })}`;
}, "C:/Users/Jarvis/Desktop/New folder (2)/chat/src/pages/signup.astro", void 0);

const $$file = "C:/Users/Jarvis/Desktop/New folder (2)/chat/src/pages/signup.astro";
const $$url = "/signup";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
	__proto__: null,
	default: $$Signup,
	file: $$file,
	url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
