import { $ as $$Layout } from './Layout_C_TQ-mLw.mjs';
import { c as createComponent } from './astro-component_ChyAuDe0.mjs';
import 'piccolore';
import { Q as renderTemplate, z as maybeRenderHead } from './params-and-props_Bdc0UXF-.mjs';
import { r as renderComponent } from './entrypoint_CZzd4IbP.mjs';

const $$Index = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$Index;
  const user = Astro2.locals.user;
  if (user) {
    return Astro2.redirect("/chat");
  }
  const error = Astro2.url.searchParams.get("error");
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Welcome to ChatApp" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center flex-1 flex flex-col justify-center"> ${error && renderTemplate`<div class="max-w-md mx-auto mb-8 bg-red-50 border-l-4 border-red-400 p-4"> <p class="text-sm text-red-700">${error}</p> </div>`} <h1 class="text-5xl font-extrabold text-gray-900 tracking-tight mb-4">
Connect with everyone, <span class="text-indigo-600">in real-time.</span> </h1> <p class="text-xl text-gray-500 max-w-2xl mx-auto mb-8">
A fast, secure, and beautiful chat application built with Astro, Tailwind, and Supabase.
</p> <div class="flex justify-center gap-4"> <a href="/signup" class="px-8 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition">Get Started</a> <a href="/login" class="px-8 py-3 bg-white text-indigo-600 border border-gray-300 font-medium rounded-lg hover:bg-gray-50 transition">Log In</a> </div> </div> ` })}`;
}, "C:/Users/Jarvis/Desktop/New folder (2)/chat/src/pages/index.astro", void 0);

const $$file = "C:/Users/Jarvis/Desktop/New folder (2)/chat/src/pages/index.astro";
const $$url = "";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
	__proto__: null,
	default: $$Index,
	file: $$file,
	url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
