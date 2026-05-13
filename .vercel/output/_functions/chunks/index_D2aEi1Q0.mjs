import { $ as $$Layout } from './Layout_C_TQ-mLw.mjs';
import { c as createComponent } from './astro-component_ChyAuDe0.mjs';
import 'piccolore';
import { Q as renderTemplate, z as maybeRenderHead } from './params-and-props_Bdc0UXF-.mjs';
import { r as renderComponent } from './entrypoint_CY5oGq1D.mjs';
import { C as ChatApp } from './ChatApp_BoJVYUZk.mjs';

const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$Index;
  const user = Astro2.locals.user;
  if (!user) {
    return Astro2.redirect("/login");
  }
  const supabase = Astro2.locals.supabase;
  const { data: profiles } = await supabase.from("profiles").select("id, username, avatar_url, last_seen, is_banned").neq("id", user.id).order("last_seen", { ascending: false });
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Chat - ChatApp" }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="flex flex-1 h-[calc(100vh-64px)] overflow-hidden"> <!-- React Component to handle realtime chat --> ${renderComponent($$result2, "ChatApp", ChatApp, { "client:load": true, "currentUser": { id: user.id, email: user.email || "" }, "initialProfiles": profiles || [], "client:component-hydration": "load", "client:component-path": "C:/Users/Jarvis/Desktop/New folder (2)/chat/src/components/ChatApp", "client:component-export": "default" })} </div> ` })}`;
}, "C:/Users/Jarvis/Desktop/New folder (2)/chat/src/pages/chat/index.astro", void 0);

const $$file = "C:/Users/Jarvis/Desktop/New folder (2)/chat/src/pages/chat/index.astro";
const $$url = "/chat";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
	__proto__: null,
	default: $$Index,
	file: $$file,
	url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
