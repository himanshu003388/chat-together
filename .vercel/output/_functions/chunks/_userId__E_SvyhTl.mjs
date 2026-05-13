import { $ as $$Layout } from './Layout_C_TQ-mLw.mjs';
import { c as createComponent } from './astro-component_ChyAuDe0.mjs';
import 'piccolore';
import { Q as renderTemplate, z as maybeRenderHead } from './params-and-props_Bdc0UXF-.mjs';
import { r as renderComponent } from './entrypoint_CZzd4IbP.mjs';
import { C as ChatApp } from './ChatApp_BoJVYUZk.mjs';

const $$userId = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$userId;
  const user = Astro2.locals.user;
  if (!user) {
    return Astro2.redirect("/login");
  }
  const supabase = Astro2.locals.supabase;
  const { userId } = Astro2.params;
  const { data: profiles } = await supabase.from("profiles").select("id, username, avatar_url, last_seen, is_banned").neq("id", user.id).order("last_seen", { ascending: false });
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Chat - ChatApp" }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="flex flex-1 h-[calc(100vh-64px)] overflow-hidden"> ${renderComponent($$result2, "ChatApp", ChatApp, { "client:load": true, "currentUser": { id: user.id, email: user.email || "" }, "initialProfiles": profiles || [], "initialActiveUserId": userId, "client:component-hydration": "load", "client:component-path": "C:/Users/Jarvis/Desktop/New folder (2)/chat/src/components/ChatApp", "client:component-export": "default" })} </div> ` })}`;
}, "C:/Users/Jarvis/Desktop/New folder (2)/chat/src/pages/chat/[userId].astro", void 0);

const $$file = "C:/Users/Jarvis/Desktop/New folder (2)/chat/src/pages/chat/[userId].astro";
const $$url = "/chat/[userId]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
	__proto__: null,
	default: $$userId,
	file: $$file,
	url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
